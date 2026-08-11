import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerCallHandlers } from './socketCalls.js';
import { createCallRegistry } from '../lib/callRegistry.js';

// Minimal socket.io doubles: enough to record what was emitted where.
const makeIo = () => {
  const emissions = [];
  return {
    emissions,
    to: (target) => ({ emit: (event, payload) => emissions.push({ target, event, payload }) }),
  };
};

const makeSocket = (userId) => {
  const handlers = new Map();
  const emissions = [];
  return {
    userId,
    handlers,
    emissions,
    on: (event, cb) => handlers.set(event, cb),
    emit: (event, payload) => emissions.push({ event, payload }),
    fire: (event, payload) => handlers.get(event)?.(payload),
  };
};

describe('call socket handlers', () => {
  let io, socket, registry, onlineUsers, loadConversation;

  beforeEach(() => {
    io = makeIo();
    socket = makeSocket('alice');
    onlineUsers = new Map([['alice', 'sock-alice'], ['bob', 'sock-bob']]);
    loadConversation = vi.fn(async () => ({
      _id: 'conv1',
      participants: ['alice', 'bob'],
    }));
    // A fresh registry per test -- the module under test defaults to one
    // shared singleton (correct for a real server process), but Vitest does
    // not reset module state between tests in the same file, so reusing that
    // default here would leak call membership across test cases.
    registry = registerCallHandlers({ io, socket, onlineUsers, loadConversation, registry: createCallRegistry() });
  });

  it('rings every online participant on initiate', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });

    const incoming = io.emissions.filter(e => e.event === 'call:incoming');
    expect(incoming).toHaveLength(1);
    expect(incoming[0].target).toBe('sock-bob');
    expect(incoming[0].payload.callId).toBe('call1');
    expect(incoming[0].payload.callType).toBe('audio');
  });

  it('registers the caller and the invitees as call members', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    expect(registry.isMember('call1', 'alice')).toBe(true);
    expect(registry.isMember('call1', 'bob')).toBe(true);
  });

  it('tells the caller which invitees were offline', async () => {
    onlineUsers.delete('bob');
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    const status = socket.emissions.find(e => e.event === 'call:ring-status');
    expect(status.payload.offlineUserIds).toEqual(['bob']);
  });

  it('refuses to start a call in a conversation the caller is not part of', async () => {
    loadConversation.mockResolvedValueOnce({ _id: 'conv1', participants: ['bob', 'carol'] });
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    expect(io.emissions.filter(e => e.event === 'call:incoming')).toHaveLength(0);
    expect(registry.has('call1')).toBe(false);
    expect(socket.emissions.some(e => e.event === 'call:error')).toBe(true);
  });

  it('refuses to ring someone who is not in the conversation', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob', 'mallory'], callType: 'audio',
    });
    const rung = io.emissions.filter(e => e.event === 'call:incoming').map(e => e.target);
    expect(rung).toEqual(['sock-bob']);
    expect(registry.isMember('call1', 'mallory')).toBe(false);
  });

  it('relays an offer only between members of the same call', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    io.emissions.length = 0;

    socket.fire('call:offer', { callId: 'call1', toUserId: 'bob', sdp: 'SDP' });

    const offers = io.emissions.filter(e => e.event === 'call:offer');
    expect(offers).toHaveLength(1);
    expect(offers[0].payload).toEqual({ callId: 'call1', fromUserId: 'alice', sdp: 'SDP' });
  });

  it('drops signaling from a socket that is not a member of the call', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    io.emissions.length = 0;

    const mallory = makeSocket('mallory');
    registerCallHandlers({ io, socket: mallory, onlineUsers, loadConversation, registry });
    mallory.fire('call:offer', { callId: 'call1', toUserId: 'bob', sdp: 'EVIL' });

    expect(io.emissions.filter(e => e.event === 'call:offer')).toHaveLength(0);
  });

  it('drops signaling aimed at a user who is not in the call', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    io.emissions.length = 0;

    socket.fire('ice:candidate', { callId: 'call1', toUserId: 'carol', candidate: 'C' });
    expect(io.emissions).toHaveLength(0);
  });

  it('broadcasts peer-left to the remaining members on leave', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    io.emissions.length = 0;

    socket.fire('call:leave', { callId: 'call1' });

    const left = io.emissions.filter(e => e.event === 'call:peer-left');
    expect(left).toHaveLength(1);
    expect(left[0].target).toBe('sock-bob');
    expect(left[0].payload).toEqual({ callId: 'call1', userId: 'alice' });
    expect(registry.isMember('call1', 'alice')).toBe(false);
  });

  it('broadcasts media state changes to the other members', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'video',
    });
    io.emissions.length = 0;

    socket.fire('call:media-state', { callId: 'call1', audioEnabled: false, videoEnabled: true });

    const states = io.emissions.filter(e => e.event === 'call:peer-media-state');
    expect(states[0].payload).toEqual({
      callId: 'call1', userId: 'alice', audioEnabled: false, videoEnabled: true,
    });
  });

  it('treats a disconnect as leaving every call the user was in', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    io.emissions.length = 0;

    socket.fire('disconnect');

    const left = io.emissions.filter(e => e.event === 'call:peer-left');
    expect(left).toHaveLength(1);
    expect(left[0].payload.userId).toBe('alice');
  });

  // Regression coverage for a crash found in review: relay() and several
  // handlers used to destructure straight from the raw event payload with no
  // guard against a missing or explicit-null payload. socket.io invokes
  // listeners outside any try/catch, so that throw would have been an
  // uncaught TypeError taking down the whole process for every connected
  // user -- reachable by any client, before even calling user:join. These
  // assert both "does not throw" and "emits nothing", since a handler that
  // silently relayed garbage instead of throwing would also be wrong.
  describe('malformed payloads', () => {
    it('does not crash and relays nothing when call:offer is fired with no payload', async () => {
      await socket.fire('call:initiate', {
        callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
      });
      io.emissions.length = 0;

      expect(() => socket.fire('call:offer')).not.toThrow();
      expect(io.emissions).toHaveLength(0);
    });

    it('does not crash and relays nothing when call:offer is fired with a null payload', async () => {
      await socket.fire('call:initiate', {
        callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
      });
      io.emissions.length = 0;

      expect(() => socket.fire('call:offer', null)).not.toThrow();
      expect(io.emissions).toHaveLength(0);
    });

    it('does not crash and does nothing when call:leave is fired with no payload', async () => {
      await socket.fire('call:initiate', {
        callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
      });
      io.emissions.length = 0;

      expect(() => socket.fire('call:leave')).not.toThrow();
      expect(io.emissions).toHaveLength(0);
      // Also confirm it was a true no-op, not a leave that just failed to notify.
      expect(registry.isMember('call1', 'alice')).toBe(true);
    });

    it('does not crash and does nothing when call:initiate is fired with no payload', async () => {
      // call:initiate is an async handler: a synchronous throw inside it
      // becomes a rejected promise rather than a thrown exception at the
      // call site, so assert on the promise settling instead of on toThrow().
      await expect(socket.fire('call:initiate')).resolves.toBeUndefined();

      expect(io.emissions).toHaveLength(0);
      expect(socket.emissions).toHaveLength(0);
    });

    it('does not crash and does nothing when call:media-state is fired with a null payload', async () => {
      await socket.fire('call:initiate', {
        callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
      });
      io.emissions.length = 0;

      expect(() => socket.fire('call:media-state', null)).not.toThrow();
      expect(io.emissions).toHaveLength(0);
    });
  });
});
