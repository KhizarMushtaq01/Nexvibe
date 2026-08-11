// models/Message.js exports BOTH models as named exports -- there is no
// default export, so `import Conversation from ...` would be undefined.
import { Conversation } from '../models/Message.js';
import { createCallRegistry, MAX_CALL_PARTICIPANTS } from '../lib/callRegistry.js';

// One registry shared by every connected socket. Injectable so tests can
// hand in a fresh one per case.
const sharedRegistry = createCallRegistry();

const defaultLoadConversation = async (conversationId) =>
  Conversation.findById(conversationId).select('participants type');

/**
 * Wire the call-signaling events onto one socket.
 *
 * Every relay checks that BOTH ends are members of the callId being used.
 * Without that check any authenticated client could inject SDP or ICE into
 * a stranger's call just by guessing an id.
 */
export const registerCallHandlers = ({
  io,
  socket,
  onlineUsers,
  loadConversation = defaultLoadConversation,
  registry = sharedRegistry,
}) => {
  const me = () => String(socket.userId || '');

  const sendTo = (userId, event, payload) => {
    const socketId = onlineUsers.get(String(userId));
    if (socketId) io.to(socketId).emit(event, payload);
  };

  // A relay is only allowed if the sender and the recipient are both in the
  // named call. Returns false (and sends nothing) otherwise. `data` is
  // untrusted client input and may be missing, null, or garbage -- destructure
  // from `data || {}` rather than in the parameter list, because a default
  // parameter only covers `undefined`, not an explicit `null` payload, and a
  // destructure throw here would be an uncaught TypeError that crashes the
  // whole process (socket.io invokes listeners outside any try/catch).
  const relay = (event, data, payload) => {
    const { callId, toUserId } = data || {};
    if (!callId || !toUserId) return false;
    if (!registry.isMember(callId, me())) return false;
    if (!registry.isMember(callId, toUserId)) return false;
    sendTo(toUserId, event, { callId, fromUserId: me(), ...payload });
    return true;
  };

  const broadcastToCall = (callId, event, payload) => {
    for (const memberId of registry.members(callId)) {
      if (memberId === me()) continue;
      sendTo(memberId, event, payload);
    }
  };

  socket.on('call:initiate', async (data) => {
    // Same reasoning as relay(): destructure from `data || {}`, not the
    // parameter list, so a missing or null payload is a silent no-op instead
    // of an uncaught TypeError that takes the process down.
    const { callId, conversationId, participantIds, callType } = data || {};
    if (!callId || !conversationId || !Array.isArray(participantIds)) return;
    if (!['audio', 'video'].includes(callType)) return;

    let conversation;
    try {
      conversation = await loadConversation(conversationId);
    } catch {
      socket.emit('call:error', { callId, message: 'Could not start the call' });
      return;
    }

    const participantSet = new Set((conversation?.participants || []).map(String));
    if (!conversation || !participantSet.has(me())) {
      socket.emit('call:error', { callId, message: 'Not authorized to call in this conversation' });
      return;
    }

    // Only ring people who are actually in the conversation -- the client's
    // list is not trusted.
    const invitees = [...new Set(participantIds.map(String))]
      .filter(id => id !== me() && participantSet.has(id))
      .slice(0, MAX_CALL_PARTICIPANTS - 1);

    if (invitees.length === 0) {
      socket.emit('call:error', { callId, message: 'Nobody to call' });
      return;
    }

    registry.create(callId, [me(), ...invitees]);

    const caller = socket.callerProfile || { _id: me() };
    const memberIds = registry.members(callId);
    const offlineUserIds = [];

    for (const inviteeId of invitees) {
      if (!onlineUsers.has(inviteeId)) { offlineUserIds.push(inviteeId); continue; }
      sendTo(inviteeId, 'call:incoming', {
        callId, conversationId, callType, caller, memberIds,
      });
    }

    socket.emit('call:ring-status', { callId, offlineUserIds });
  });

  socket.on('call:accept', (data) => relay('call:accepted', data, {}));
  socket.on('call:reject', (data) => {
    if (!relay('call:rejected', data, { reason: data?.reason || 'declined' })) return;
    registry.leave(data.callId, me());
  });
  socket.on('call:busy', (data) => {
    if (!relay('call:busy', data, {})) return;
    registry.leave(data.callId, me());
  });
  socket.on('call:offer', (data) => relay('call:offer', data, { sdp: data?.sdp }));
  socket.on('call:answer', (data) => relay('call:answer', data, { sdp: data?.sdp }));
  socket.on('ice:candidate', (data) => relay('ice:candidate', data, { candidate: data?.candidate }));

  socket.on('call:media-state', (data) => {
    // `= {}` in the parameter list only guards `undefined`; an explicit
    // `null` payload would still throw on destructure, so unpack from
    // `data || {}` instead -- see relay() above for why that matters here.
    const { callId, audioEnabled, videoEnabled } = data || {};
    if (!callId || !registry.isMember(callId, me())) return;
    broadcastToCall(callId, 'call:peer-media-state', {
      callId, userId: me(), audioEnabled: !!audioEnabled, videoEnabled: !!videoEnabled,
    });
  });

  socket.on('call:leave', (data) => {
    const { callId } = data || {};
    if (!callId || !registry.isMember(callId, me())) return;
    // Broadcast BEFORE leaving: once leave() runs, a call whose last member
    // just left is deleted outright, and members() would return nothing to
    // notify. Broadcasting first is safe because it already skips me().
    broadcastToCall(callId, 'call:peer-left', { callId, userId: me() });
    registry.leave(callId, me());
  });

  socket.on('disconnect', () => {
    for (const { callId, remaining } of registry.leaveAll(me())) {
      for (const memberId of remaining) {
        sendTo(memberId, 'call:peer-left', { callId, userId: me() });
      }
    }
  });

  return registry;
};
