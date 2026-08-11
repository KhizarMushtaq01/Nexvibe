import { describe, it, expect } from 'vitest';
import { initialCallState, callReducer, isCallBusy } from './callState.js';

const reduce = (state, ...actions) => actions.reduce(callReducer, state);

const outgoing = () => callReducer(initialCallState, {
  type: 'START_CALL',
  callId: 'c1',
  conversationId: 'conv1',
  callType: 'video',
  peerIds: ['bob'],
});

const incoming = () => callReducer(initialCallState, {
  type: 'INCOMING_CALL',
  callId: 'c1',
  conversationId: 'conv1',
  callType: 'audio',
  caller: { _id: 'alice', username: 'alice' },
  memberIds: ['alice', 'me'],
  selfId: 'me',
});

describe('callReducer — outgoing', () => {
  it('moves idle to outgoing and seeds a peer per invitee', () => {
    const s = outgoing();
    expect(s.status).toBe('outgoing');
    expect(s.callType).toBe('video');
    expect(Object.keys(s.peers)).toEqual(['bob']);
    expect(s.peers.bob.state).toBe('ringing');
  });

  it('turns the local camera on for a video call and off for audio', () => {
    expect(outgoing().localVideo).toBe(true);
    const audio = callReducer(initialCallState, {
      type: 'START_CALL', callId: 'c1', conversationId: 'conv1', callType: 'audio', peerIds: ['bob'],
    });
    expect(audio.localVideo).toBe(false);
    expect(audio.localAudio).toBe(true);
  });

  it('flags a call with more than one invitee as a group call', () => {
    const s = callReducer(initialCallState, {
      type: 'START_CALL', callId: 'c1', conversationId: 'conv1', callType: 'audio', peerIds: ['b', 'c'],
    });
    expect(s.isGroup).toBe(true);
    expect(outgoing().isGroup).toBe(false);
  });

  it('ignores START_CALL when a call is already in progress', () => {
    const s = outgoing();
    expect(callReducer(s, { type: 'START_CALL', callId: 'c2', conversationId: 'x', callType: 'audio', peerIds: ['z'] }))
      .toBe(s);
  });

  it('moves to connecting on the first acceptance', () => {
    const s = reduce(outgoing(), { type: 'PEER_ACCEPTED', userId: 'bob' });
    expect(s.status).toBe('connecting');
    expect(s.peers.bob.state).toBe('connecting');
  });

  it('ends the call when every invitee rejects', () => {
    const s = reduce(outgoing(), { type: 'PEER_REJECTED', userId: 'bob', reason: 'declined' });
    expect(s.status).toBe('ended');
    expect(s.endedReason).toBe('declined');
  });

  it('stays up when only one of several invitees rejects', () => {
    const start = callReducer(initialCallState, {
      type: 'START_CALL', callId: 'c1', conversationId: 'conv1', callType: 'audio', peerIds: ['b', 'c'],
    });
    const s = reduce(start, { type: 'PEER_REJECTED', userId: 'b', reason: 'declined' });
    expect(s.status).toBe('outgoing');
    expect(s.peers.b).toBeUndefined();
  });

  it('ends with a missed reason on ring timeout', () => {
    const s = reduce(outgoing(), { type: 'RING_TIMEOUT' });
    expect(s.status).toBe('ended');
    expect(s.endedReason).toBe('missed');
  });

  it('does not let a ring timeout kill a call that already connected', () => {
    const s = reduce(outgoing(),
      { type: 'PEER_ACCEPTED', userId: 'bob' },
      { type: 'PEER_CONNECTED', userId: 'bob' },
      { type: 'RING_TIMEOUT' });
    expect(s.status).toBe('active');
  });
});

describe('callReducer — incoming', () => {
  it('moves idle to incoming and records the caller', () => {
    const s = incoming();
    expect(s.status).toBe('incoming');
    expect(s.caller.username).toBe('alice');
  });

  it('seeds a peer for every member except me', () => {
    const s = incoming();
    expect(Object.keys(s.peers)).toEqual(['alice']);
  });

  it('answering moves to connecting and honours the chosen video mode', () => {
    const s = reduce(incoming(), { type: 'ANSWER', withVideo: false });
    expect(s.status).toBe('connecting');
    expect(s.localVideo).toBe(false);
  });

  it('answering a video call with video on enables the camera', () => {
    const videoIncoming = callReducer(initialCallState, {
      type: 'INCOMING_CALL', callId: 'c1', conversationId: 'conv1', callType: 'video',
      caller: { _id: 'alice' }, memberIds: ['alice', 'me'], selfId: 'me',
    });
    expect(callReducer(videoIncoming, { type: 'ANSWER', withVideo: true }).localVideo).toBe(true);
  });

  it('ignores a second incoming call while busy, so an active call is never hijacked', () => {
    const s = reduce(incoming(), { type: 'ANSWER', withVideo: false }, { type: 'PEER_CONNECTED', userId: 'alice' });
    const after = callReducer(s, {
      type: 'INCOMING_CALL', callId: 'c2', conversationId: 'conv2', callType: 'audio',
      caller: { _id: 'carol' }, memberIds: ['carol', 'me'], selfId: 'me',
    });
    expect(after).toBe(s);
  });
});

describe('callReducer — active call', () => {
  const active = () => reduce(outgoing(),
    { type: 'PEER_ACCEPTED', userId: 'bob' },
    { type: 'PEER_CONNECTED', userId: 'bob' });

  it('records the start time exactly once, on the first connection', () => {
    const s = active();
    expect(s.status).toBe('active');
    expect(typeof s.startedAt).toBe('number');
    const later = callReducer(s, { type: 'PEER_CONNECTED', userId: 'bob' });
    expect(later.startedAt).toBe(s.startedAt);
  });

  it('ends the call when the last peer leaves', () => {
    const s = callReducer(active(), { type: 'PEER_LEFT', userId: 'bob' });
    expect(s.status).toBe('ended');
    expect(s.endedReason).toBe('completed');
  });

  it('stays active when one of several peers leaves', () => {
    const start = callReducer(initialCallState, {
      type: 'START_CALL', callId: 'c1', conversationId: 'conv1', callType: 'audio', peerIds: ['b', 'c'],
    });
    const s = reduce(start,
      { type: 'PEER_ACCEPTED', userId: 'b' }, { type: 'PEER_CONNECTED', userId: 'b' },
      { type: 'PEER_ACCEPTED', userId: 'c' }, { type: 'PEER_CONNECTED', userId: 'c' },
      { type: 'PEER_LEFT', userId: 'b' });
    expect(s.status).toBe('active');
    expect(Object.keys(s.peers)).toEqual(['c']);
  });

  it('ends with failed when every peer connection fails', () => {
    const s = reduce(outgoing(), { type: 'PEER_ACCEPTED', userId: 'bob' }, { type: 'PEER_FAILED', userId: 'bob' });
    expect(s.status).toBe('ended');
    expect(s.endedReason).toBe('failed');
    expect(s.error).toMatch(/TURN|connect/i);
  });

  it('tracks a peer muting their microphone', () => {
    const s = callReducer(active(), {
      type: 'PEER_MEDIA_STATE', userId: 'bob', audioEnabled: false, videoEnabled: true,
    });
    expect(s.peers.bob.audioEnabled).toBe(false);
    expect(s.peers.bob.videoEnabled).toBe(true);
  });

  it('ignores media state for a peer who already left', () => {
    const s = callReducer(active(), { type: 'PEER_MEDIA_STATE', userId: 'ghost', audioEnabled: false });
    expect(s.peers.ghost).toBeUndefined();
  });

  it('toggles local audio and video', () => {
    const s = callReducer(active(), { type: 'SET_LOCAL_MEDIA', localAudio: false });
    expect(s.localAudio).toBe(false);
    expect(s.localVideo).toBe(true);
  });

  it('minimizes and restores without changing status', () => {
    const s = callReducer(active(), { type: 'SET_MINIMIZED', minimized: true });
    expect(s.minimized).toBe(true);
    expect(s.status).toBe('active');
  });

  it('END_CALL always terminates, whatever the status', () => {
    expect(callReducer(active(), { type: 'END_CALL' }).status).toBe('ended');
    expect(callReducer(outgoing(), { type: 'END_CALL' }).status).toBe('ended');
    expect(callReducer(incoming(), { type: 'END_CALL', reason: 'declined' }).endedReason).toBe('declined');
  });

  it('RESET returns to a pristine idle state', () => {
    expect(callReducer(callReducer(active(), { type: 'END_CALL' }), { type: 'RESET' })).toEqual(initialCallState);
  });

  it('preserves the duration on END_CALL so the call log can report it', () => {
    const s = { ...active(), startedAt: Date.now() - 5000 };
    expect(callReducer(s, { type: 'END_CALL' }).startedAt).toBe(s.startedAt);
  });
});

describe('isCallBusy', () => {
  it('is false only when idle or ended', () => {
    expect(isCallBusy(initialCallState)).toBe(false);
    expect(isCallBusy(outgoing())).toBe(true);
    expect(isCallBusy(incoming())).toBe(true);
    expect(isCallBusy(callReducer(outgoing(), { type: 'END_CALL' }))).toBe(false);
  });
});
