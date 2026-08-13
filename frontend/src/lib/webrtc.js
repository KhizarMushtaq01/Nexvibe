// Pure WebRTC helpers. Deliberately free of React and of browser globals
// beyond the RTC types themselves, so every decision a call depends on
// (who offers, what resolution, which ICE servers) is unit-testable.

export const MAX_CALL_PARTICIPANTS = 8;

const DEFAULT_STUN = 'stun:stun.l.google.com:19302';

/**
 * Build the iceServers array from Vite env vars.
 * Note these values ship in the client bundle and are therefore public --
 * long-lived static TURN credentials are not safe here. See the design doc's
 * risk section; a short-lived-credential endpoint is the follow-up.
 */
export const buildIceServers = (env = {}) => {
  const stunUrls = String(env.VITE_STUN_URLS || DEFAULT_STUN)
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

  const servers = [{ urls: stunUrls.length ? stunUrls : [DEFAULT_STUN] }];

  // A TURN entry without credentials is not merely useless -- some browsers
  // reject the whole RTCConfiguration over it. Only emit a complete one.
  if (env.VITE_TURN_URL && env.VITE_TURN_USERNAME && env.VITE_TURN_CREDENTIAL) {
    servers.push({
      urls: [env.VITE_TURN_URL],
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    });
  }

  return servers;
};

/**
 * In a mesh, both peers learn about each other at the same moment, so both
 * would send an offer ("glare") unless one side is designated. Comparing the
 * two user ids gives a rule both sides compute identically with no extra
 * round trip, which is why this needs no perfect-negotiation rollback.
 */
export const isOfferer = (myUserId, peerUserId) => String(myUserId) < String(peerUserId);

export const getMediaConstraints = ({ callType, peerCount }) => {
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (callType !== 'video') return { audio, video: false };

  // Mesh means every extra peer is another full upload of our own video.
  // Past 1-on-1 we trade resolution for the call staying up at all.
  const isGroup = peerCount > 1;
  return {
    audio,
    video: isGroup
      ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  };
};

export const videoSenderParams = (peerCount) => (peerCount > 1 ? { maxBitrate: 150000 } : null);

export const capParticipants = (ids, selfId) => {
  const others = [...new Set(ids.map(String))].filter(id => id !== String(selfId));
  return others.slice(0, MAX_CALL_PARTICIPANTS - 1);
};

export const describeMediaError = (err, callType) => {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        message: callType === 'video'
          ? 'Camera and microphone permission denied. Enable it in your browser settings to call.'
          : 'Microphone permission denied. Enable it in your browser settings to call.',
        fallbackToAudio: false,
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      // No camera is recoverable -- the call can still happen as audio.
      // No microphone is not: a call with no audio is not a call.
      return callType === 'video'
        ? { message: 'No camera found — starting as an audio call.', fallbackToAudio: true }
        : { message: 'No microphone found.', fallbackToAudio: false };
    case 'NotReadableError':
    case 'AbortError':
      return { message: 'Your camera or microphone is being used by another app.', fallbackToAudio: false };
    default:
      return { message: "Couldn't access your microphone or camera.", fallbackToAudio: false };
  }
};

/** Create a peer connection with this app's ICE config already applied. */
export const createPeerConnection = (env) =>
  new RTCPeerConnection({ iceServers: buildIceServers(env), iceCandidatePoolSize: 4 });
