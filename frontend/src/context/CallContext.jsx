import { createContext, useContext, useReducer, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { messageAPI } from '../services/api';
import { initialCallState, callReducer, isCallBusy } from '../lib/callState';
import {
  createPeerConnection, isOfferer, getMediaConstraints,
  videoSenderParams, capParticipants, describeMediaError, MAX_CALL_PARTICIPANTS,
} from '../lib/webrtc';
import { createRingtone } from '../lib/ringtone';

const CallContext = createContext(null);

const RING_TIMEOUT_MS = 30000;
const newCallId = () => (crypto.randomUUID ? crypto.randomUUID() : `call-${Date.now()}-${Math.random()}`);

export const CallProvider = ({ children }) => {
  const { user } = useAuth();
  const { emit, on } = useSocket();
  const navigate = useNavigate();

  const [call, dispatch] = useReducer(callReducer, initialCallState);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [canFlipCamera, setCanFlipCamera] = useState(false);

  const peers = useRef(new Map());          // userId -> RTCPeerConnection
  const pendingIce = useRef(new Map());     // userId -> RTCIceCandidateInit[]
  const localStreamRef = useRef(null);
  const callRef = useRef(call);
  const ringtone = useRef(null);
  const ringTimer = useRef(null);
  const facingMode = useRef('user');

  useEffect(() => { callRef.current = call; }, [call]);

  const canSetSpeaker = typeof HTMLMediaElement !== 'undefined'
    && typeof HTMLMediaElement.prototype.setSinkId === 'function';

  // ---- media -------------------------------------------------------------

  const getLocalStream = useCallback(async (callType, peerCount) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        getMediaConstraints({ callType, peerCount })
      );
      localStreamRef.current = stream;
      setLocalStream(stream);
      return { stream, callType };
    } catch (err) {
      const { message, fallbackToAudio } = describeMediaError(err, callType);
      if (fallbackToAudio) {
        toast(message);
        return getLocalStream('audio', peerCount);
      }
      toast.error(message);
      return { stream: null, callType };
    }
  }, []);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  // ---- peer connections --------------------------------------------------

  const closePeer = useCallback((userId) => {
    const pc = peers.current.get(String(userId));
    if (pc) { pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); }
    peers.current.delete(String(userId));
    pendingIce.current.delete(String(userId));
    setRemoteStreams(prev => {
      const next = new Map(prev);
      next.delete(String(userId));
      return next;
    });
  }, []);

  const createPeer = useCallback((peerUserId, callId) => {
    const id = String(peerUserId);
    if (peers.current.has(id)) return peers.current.get(id);

    const pc = createPeerConnection(import.meta.env);
    peers.current.set(id, pc);

    for (const track of localStreamRef.current?.getTracks() || []) {
      const sender = pc.addTrack(track, localStreamRef.current);
      if (track.kind === 'video') {
        const params = videoSenderParams(Object.keys(callRef.current.peers).length);
        if (params) {
          const p = sender.getParameters();
          p.encodings = [{ ...(p.encodings?.[0] || {}), maxBitrate: params.maxBitrate }];
          sender.setParameters(p).catch(() => { /* not supported everywhere */ });
        }
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) emit('ice:candidate', { callId, toUserId: id, candidate: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      setRemoteStreams(prev => new Map(prev).set(id, e.streams[0]));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') dispatch({ type: 'PEER_CONNECTED', userId: id });
      if (pc.connectionState === 'failed') dispatch({ type: 'PEER_FAILED', userId: id });
      if (pc.connectionState === 'closed') dispatch({ type: 'PEER_LEFT', userId: id });
    };

    return pc;
  }, [emit]);

  const sendOffer = useCallback(async (peerUserId, callId) => {
    const pc = createPeer(peerUserId, callId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    emit('call:offer', { callId, toUserId: String(peerUserId), sdp: pc.localDescription });
  }, [createPeer, emit]);

  const drainIce = useCallback(async (userId) => {
    const pc = peers.current.get(String(userId));
    const queued = pendingIce.current.get(String(userId)) || [];
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
    }
    pendingIce.current.delete(String(userId));
  }, []);

  // ---- teardown ----------------------------------------------------------

  const teardown = useCallback(() => {
    for (const id of [...peers.current.keys()]) closePeer(id);
    stopLocalStream();
    ringtone.current?.stop();
    ringtone.current = null;
    if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null; }
  }, [closePeer, stopLocalStream]);

  // Write the call log, then reset. The initiator (or the callee of a 1-on-1)
  // is the one holding the outcome, so the client that reaches `ended` writes
  // it; the endpoint is idempotent per callId so a duplicate from the other
  // side is discarded server-side.
  useEffect(() => {
    if (call.status !== 'ended') return;
    const { callId, conversationId, callType, endedReason, startedAt } = call;

    teardown();

    if (conversationId && callId) {
      messageAPI.logCall(conversationId, {
        callId,
        callType,
        outcome: endedReason || 'completed',
        duration: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
      }).catch(() => { /* a missing log must never block the UI */ });
    }

    const t = setTimeout(() => dispatch({ type: 'RESET' }), 2000);
    return () => clearTimeout(t);
  }, [call.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ringing -----------------------------------------------------------

  useEffect(() => {
    if (call.status === 'incoming') {
      ringtone.current = createRingtone();
      ringtone.current.start('ring');
    } else if (call.status === 'outgoing') {
      ringtone.current = createRingtone();
      ringtone.current.start('ringback');
    } else {
      ringtone.current?.stop();
      ringtone.current = null;
    }

    if (call.status === 'incoming' || call.status === 'outgoing') {
      ringTimer.current = setTimeout(() => dispatch({ type: 'RING_TIMEOUT' }), RING_TIMEOUT_MS);
    }

    return () => {
      if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null; }
    };
  }, [call.status]);

  // ---- public API --------------------------------------------------------

  const startCall = useCallback(async (conversation, callType) => {
    if (isCallBusy(callRef.current)) { toast.error('You are already on a call'); return; }
    if (!window.isSecureContext) { toast.error('Calls need a secure (https) connection'); return; }

    const participantIds = (conversation.participants || []).map(p => String(p._id || p));
    const peerIds = capParticipants(participantIds, user._id);
    if (peerIds.length === 0) { toast.error('Nobody to call in this chat'); return; }
    if (participantIds.length > MAX_CALL_PARTICIPANTS) {
      toast.error(`Calls support up to ${MAX_CALL_PARTICIPANTS} people`);
      return;
    }

    const { stream, callType: effectiveType } = await getLocalStream(callType, peerIds.length);
    if (!stream) return;

    const callId = newCallId();
    const users = Object.fromEntries(
      (conversation.participants || [])
        .filter(p => String(p._id || p) !== String(user._id))
        .map(p => [String(p._id || p), p])
    );

    dispatch({
      type: 'START_CALL', callId, conversationId: conversation._id,
      callType: effectiveType, peerIds, users,
    });

    emit('call:initiate', {
      callId, conversationId: conversation._id, participantIds: peerIds, callType: effectiveType,
    });
  }, [emit, getLocalStream, user?._id]);

  const answer = useCallback(async ({ withVideo }) => {
    const current = callRef.current;
    if (current.status !== 'incoming') return;

    const peerIds = Object.keys(current.peers);
    const wanted = withVideo && current.callType === 'video' ? 'video' : 'audio';
    const { stream } = await getLocalStream(wanted, peerIds.length);
    if (!stream) { dispatch({ type: 'END_CALL', reason: 'failed' }); return; }

    dispatch({ type: 'ANSWER', withVideo: wanted === 'video' });

    for (const peerId of peerIds) {
      emit('call:accept', { callId: current.callId, toUserId: peerId });
      // Both sides now know about each other; the glare rule decides who
      // sends the offer so exactly one is created per pair.
      if (isOfferer(user._id, peerId)) sendOffer(peerId, current.callId);
      else createPeer(peerId, current.callId);
    }
  }, [emit, getLocalStream, sendOffer, createPeer, user?._id]);

  const decline = useCallback(() => {
    const current = callRef.current;
    for (const peerId of Object.keys(current.peers)) {
      emit('call:reject', { callId: current.callId, toUserId: peerId, reason: 'declined' });
    }
    dispatch({ type: 'END_CALL', reason: 'declined' });
  }, [emit]);

  const endCall = useCallback(() => {
    emit('call:leave', { callId: callRef.current.callId });
    dispatch({ type: 'END_CALL' });
  }, [emit]);

  const broadcastMediaState = useCallback((audioEnabled, videoEnabled) => {
    emit('call:media-state', { callId: callRef.current.callId, audioEnabled, videoEnabled });
  }, [emit]);

  const toggleAudio = useCallback(() => {
    const next = !callRef.current.localAudio;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = next; });
    dispatch({ type: 'SET_LOCAL_MEDIA', localAudio: next });
    broadcastMediaState(next, callRef.current.localVideo);
  }, [broadcastMediaState]);

  const toggleVideo = useCallback(async () => {
    const current = callRef.current;
    const next = !current.localVideo;
    const existing = localStreamRef.current?.getVideoTracks() || [];

    if (next && existing.length === 0) {
      // Upgrading an audio call to video: acquire a camera track and add it
      // to every peer, which triggers renegotiation via onnegotiationneeded
      // -- we drive it explicitly instead, to keep the glare rule in charge.
      try {
        const camStream = await navigator.mediaDevices.getUserMedia(
          getMediaConstraints({ callType: 'video', peerCount: Object.keys(current.peers).length })
        );
        const track = camStream.getVideoTracks()[0];
        localStreamRef.current?.addTrack(track);
        setLocalStream(localStreamRef.current);
        for (const [peerId, pc] of peers.current.entries()) {
          pc.addTrack(track, localStreamRef.current);
          if (isOfferer(user._id, peerId)) await sendOffer(peerId, current.callId);
        }
      } catch (err) {
        toast.error(describeMediaError(err, 'video').message);
        return;
      }
    } else {
      existing.forEach(t => { t.enabled = next; });
    }

    dispatch({ type: 'SET_LOCAL_MEDIA', localVideo: next });
    broadcastMediaState(current.localAudio, next);
  }, [broadcastMediaState, sendOffer, user?._id]);

  const flipCamera = useCallback(async () => {
    facingMode.current = facingMode.current === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode.current }, audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      for (const pc of peers.current.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        await sender?.replaceTrack(newTrack);
      }
      const old = localStreamRef.current?.getVideoTracks()[0];
      if (old) { localStreamRef.current.removeTrack(old); old.stop(); }
      localStreamRef.current?.addTrack(newTrack);
      setLocalStream(localStreamRef.current);
    } catch { toast.error("Couldn't switch camera"); }
  }, []);

  const setMinimized = useCallback((minimized) => {
    dispatch({ type: 'SET_MINIMIZED', minimized });
  }, []);

  // Detect a second camera once, when a video call becomes active.
  useEffect(() => {
    if (call.status !== 'active' || !call.localVideo) return;
    navigator.mediaDevices?.enumerateDevices?.()
      .then(devices => setCanFlipCamera(devices.filter(d => d.kind === 'videoinput').length > 1))
      .catch(() => setCanFlipCamera(false));
  }, [call.status, call.localVideo]);

  // ---- socket wiring -----------------------------------------------------

  useEffect(() => {
    if (!on) return;

    const offIncoming = on('call:incoming', (data) => {
      if (isCallBusy(callRef.current)) {
        emit('call:busy', { callId: data.callId, toUserId: String(data.caller?._id) });
        return;
      }
      dispatch({
        type: 'INCOMING_CALL',
        callId: data.callId,
        conversationId: data.conversationId,
        callType: data.callType,
        caller: data.caller,
        memberIds: data.memberIds,
        selfId: user._id,
      });
    });

    const offRingStatus = on('call:ring-status', ({ offlineUserIds }) => {
      if (offlineUserIds?.length) toast(`${offlineUserIds.length} person(s) are offline`);
    });

    const offAccepted = on('call:accepted', async ({ callId, fromUserId }) => {
      if (callRef.current.callId !== callId) return;
      dispatch({ type: 'PEER_ACCEPTED', userId: fromUserId });
      if (isOfferer(user._id, fromUserId)) await sendOffer(fromUserId, callId);
      else createPeer(fromUserId, callId);
    });

    const offRejected = on('call:rejected', ({ callId, fromUserId, reason }) => {
      if (callRef.current.callId !== callId) return;
      closePeer(fromUserId);
      dispatch({ type: 'PEER_REJECTED', userId: fromUserId, reason });
    });

    const offBusy = on('call:busy', ({ callId, fromUserId }) => {
      if (callRef.current.callId !== callId) return;
      closePeer(fromUserId);
      dispatch({ type: 'PEER_BUSY', userId: fromUserId });
    });

    const offOffer = on('call:offer', async ({ callId, fromUserId, sdp }) => {
      if (callRef.current.callId !== callId) return;
      const pc = createPeer(fromUserId, callId);
      await pc.setRemoteDescription(sdp);
      await drainIce(fromUserId);
      const answerSdp = await pc.createAnswer();
      await pc.setLocalDescription(answerSdp);
      emit('call:answer', { callId, toUserId: String(fromUserId), sdp: pc.localDescription });
    });

    const offAnswer = on('call:answer', async ({ callId, fromUserId, sdp }) => {
      if (callRef.current.callId !== callId) return;
      const pc = peers.current.get(String(fromUserId));
      if (!pc) return;
      await pc.setRemoteDescription(sdp);
      await drainIce(fromUserId);
    });

    const offIce = on('ice:candidate', async ({ callId, fromUserId, candidate }) => {
      if (callRef.current.callId !== callId) return;
      const pc = peers.current.get(String(fromUserId));
      // Candidates can arrive before the remote description is set; queue
      // them rather than throwing them away.
      if (!pc || !pc.remoteDescription) {
        const queue = pendingIce.current.get(String(fromUserId)) || [];
        queue.push(candidate);
        pendingIce.current.set(String(fromUserId), queue);
        return;
      }
      try { await pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
    });

    const offPeerLeft = on('call:peer-left', ({ callId, userId }) => {
      if (callRef.current.callId !== callId) return;
      closePeer(userId);
      dispatch({ type: 'PEER_LEFT', userId });
    });

    const offMediaState = on('call:peer-media-state', ({ callId, userId, audioEnabled, videoEnabled }) => {
      if (callRef.current.callId !== callId) return;
      dispatch({ type: 'PEER_MEDIA_STATE', userId, audioEnabled, videoEnabled });
    });

    const offError = on('call:error', ({ message }) => {
      dispatch({ type: 'CALL_ERROR', message: message || "Couldn't start the call" });
    });

    return () => {
      offIncoming?.(); offRingStatus?.(); offAccepted?.(); offRejected?.(); offBusy?.();
      offOffer?.(); offAnswer?.(); offIce?.(); offPeerLeft?.(); offMediaState?.(); offError?.();
    };
  }, [on, emit, user?._id, sendOffer, createPeer, closePeer, drainIce]);

  // Logging out mid-call must not leave the camera light on.
  useEffect(() => {
    if (!user && isCallBusy(callRef.current)) dispatch({ type: 'END_CALL', reason: 'failed' });
  }, [user]);

  const openChat = useCallback(() => {
    setMinimized(true);
    if (callRef.current.conversationId) navigate(`/messages/${callRef.current.conversationId}`);
  }, [navigate, setMinimized]);

  return (
    <CallContext.Provider value={{
      call, localStream, remoteStreams,
      startCall, answer, decline, endCall,
      toggleAudio, toggleVideo, setMinimized, openChat,
      canFlipCamera, flipCamera, canSetSpeaker,
      // Task 7 polls getStats() per peer for a connection-quality indicator.
      peerConnections: peers.current,
    }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
};
