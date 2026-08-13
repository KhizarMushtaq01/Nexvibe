// Shared by the server (notification text) and mirrored by the client
// (thread row), so a call reads the same wherever it is shown.

export const CALL_OUTCOMES = ['completed', 'missed', 'declined', 'failed', 'busy'];

export const formatCallDuration = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

/**
 * @param isMine true when the viewer placed the call. An unanswered call is
 *   "Missed" to the person who was rung but "No answer" to the caller --
 *   labelling the caller's own outgoing call "missed" reads as an accusation.
 */
export const describeCallLog = ({ callType, outcome, duration, isMine = false }) => {
  const kind = callType === 'video' ? 'Video call' : 'Audio call';
  switch (outcome) {
    case 'completed': return `${kind} · ${formatCallDuration(duration)}`;
    case 'missed': return isMine ? 'No answer' : `Missed ${callType === 'video' ? 'video' : 'audio'} call`;
    case 'declined': return 'Call declined';
    case 'failed': return "Call couldn't connect";
    case 'busy': return 'User was on another call';
    default: return kind;
  }
};
