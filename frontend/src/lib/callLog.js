// Kept in sync with backend/lib/callLog.js. The frontend and backend are
// separate npm packages with no shared module path, so this is a deliberate
// duplicate rather than an import. If you change one, change both.

export const CALL_OUTCOMES = ['completed', 'missed', 'declined', 'failed', 'busy'];

export const formatCallDuration = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

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
