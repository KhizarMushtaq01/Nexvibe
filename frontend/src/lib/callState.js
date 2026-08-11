// The whole lifecycle of a call as a pure reducer. Keeping it out of the
// React context means every transition -- including the ones that are hard
// to reproduce by hand, like "all peers failed" or "a second call arrives
// mid-call" -- is directly testable.

export const initialCallState = {
  status: 'idle',       // idle | outgoing | incoming | connecting | active | ended
  callId: null,
  conversationId: null,
  callType: null,       // 'audio' | 'video'
  isGroup: false,
  minimized: false,
  caller: null,         // who rang us (incoming only)
  peers: {},            // userId -> { userId, user, state, audioEnabled, videoEnabled }
  localAudio: true,
  localVideo: false,
  startedAt: null,
  endedReason: null,    // completed | missed | declined | failed | busy
  error: null,
};

const makePeer = (userId, user = null) => ({
  userId: String(userId),
  user,
  state: 'ringing',     // ringing | connecting | connected | failed
  audioEnabled: true,
  videoEnabled: false,
});

const peersFromIds = (ids, users = {}) =>
  Object.fromEntries(ids.map(id => [String(id), makePeer(id, users[String(id)] || null)]));

const withoutPeer = (peers, userId) => {
  const next = { ...peers };
  delete next[String(userId)];
  return next;
};

const ended = (state, reason, error = null) => ({
  ...state, status: 'ended', endedReason: reason, error, minimized: false,
});

export const isCallBusy = (state) => state.status !== 'idle' && state.status !== 'ended';

export const callReducer = (state, action) => {
  switch (action.type) {
    case 'START_CALL': {
      if (isCallBusy(state)) return state;
      return {
        ...initialCallState,
        status: 'outgoing',
        callId: action.callId,
        conversationId: action.conversationId,
        callType: action.callType,
        isGroup: action.peerIds.length > 1,
        peers: peersFromIds(action.peerIds, action.users),
        localAudio: true,
        localVideo: action.callType === 'video',
      };
    }

    case 'INCOMING_CALL': {
      // Never let a new ring displace a call in progress. The context answers
      // this one with call:busy instead.
      if (isCallBusy(state)) return state;
      const others = action.memberIds.map(String).filter(id => id !== String(action.selfId));
      return {
        ...initialCallState,
        status: 'incoming',
        callId: action.callId,
        conversationId: action.conversationId,
        callType: action.callType,
        isGroup: others.length > 1,
        caller: action.caller,
        peers: peersFromIds(others, { [String(action.caller?._id)]: action.caller }),
        localAudio: true,
        localVideo: false,
      };
    }

    case 'ANSWER': {
      if (state.status !== 'incoming') return state;
      return {
        ...state,
        status: 'connecting',
        localVideo: state.callType === 'video' && !!action.withVideo,
      };
    }

    case 'PEER_ACCEPTED': {
      const peer = state.peers[String(action.userId)];
      if (!peer) return state;
      return {
        ...state,
        status: state.status === 'outgoing' ? 'connecting' : state.status,
        peers: { ...state.peers, [peer.userId]: { ...peer, state: 'connecting' } },
      };
    }

    case 'PEER_REJECTED':
    case 'PEER_BUSY': {
      const peers = withoutPeer(state.peers, action.userId);
      if (Object.keys(peers).length === 0) {
        return ended({ ...state, peers }, action.type === 'PEER_BUSY' ? 'busy' : (action.reason || 'declined'));
      }
      return { ...state, peers };
    }

    case 'PEER_CONNECTED': {
      const peer = state.peers[String(action.userId)];
      if (!peer) return state;
      return {
        ...state,
        status: 'active',
        startedAt: state.startedAt ?? Date.now(),
        peers: { ...state.peers, [peer.userId]: { ...peer, state: 'connected' } },
      };
    }

    case 'PEER_FAILED': {
      const peers = withoutPeer(state.peers, action.userId);
      if (Object.keys(peers).length === 0) {
        return ended({ ...state, peers }, 'failed',
          "Couldn't connect — this network needs a TURN server.");
      }
      return { ...state, peers };
    }

    case 'PEER_LEFT': {
      const peers = withoutPeer(state.peers, action.userId);
      if (Object.keys(peers).length === 0) return ended({ ...state, peers }, 'completed');
      return { ...state, peers };
    }

    case 'PEER_MEDIA_STATE': {
      const peer = state.peers[String(action.userId)];
      if (!peer) return state;
      return {
        ...state,
        peers: {
          ...state.peers,
          [peer.userId]: {
            ...peer,
            audioEnabled: action.audioEnabled ?? peer.audioEnabled,
            videoEnabled: action.videoEnabled ?? peer.videoEnabled,
          },
        },
      };
    }

    case 'SET_LOCAL_MEDIA':
      return {
        ...state,
        localAudio: action.localAudio ?? state.localAudio,
        localVideo: action.localVideo ?? state.localVideo,
      };

    case 'SET_MINIMIZED':
      return { ...state, minimized: !!action.minimized };

    case 'RING_TIMEOUT':
      // Only meaningful while nobody has picked up yet.
      if (state.status !== 'outgoing' && state.status !== 'incoming') return state;
      return ended(state, 'missed');

    case 'CALL_ERROR':
      return ended(state, 'failed', action.message);

    case 'END_CALL':
      if (state.status === 'idle') return state;
      return ended(state, action.reason || (state.startedAt ? 'completed' : 'missed'));

    case 'RESET':
      return initialCallState;

    default:
      return state;
  }
};
