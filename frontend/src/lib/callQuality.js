// Turns raw WebRTC stats and audio levels into the two things the UI shows:
// a quality dot and a "this person is talking" flag.

export const QUALITY_LEVELS = ['good', 'fair', 'poor', 'unknown'];

/**
 * Packet loss ratio -> quality band. Thresholds follow the usual VoIP rule
 * of thumb: under 2% is imperceptible, 2-5% is audible but usable, above
 * that the call is visibly degrading.
 */
export const qualityFromLoss = (lossRatio) => {
  if (typeof lossRatio !== 'number' || Number.isNaN(lossRatio)) return 'unknown';
  if (lossRatio < 0.02) return 'good';
  if (lossRatio < 0.05) return 'fair';
  return 'poor';
};

/** Extract the inbound packet-loss ratio from an RTCStatsReport-like iterable. */
export const lossRatioFromStats = (reports) => {
  let received = 0;
  let lost = 0;
  for (const report of reports || []) {
    if (report.type !== 'inbound-rtp') continue;
    received += report.packetsReceived || 0;
    lost += report.packetsLost || 0;
  }
  const total = received + lost;
  return total > 0 ? lost / total : null;
};

/** The worst band across all peers is what the header should show. */
export const worstQuality = (qualities) => {
  const order = ['poor', 'fair', 'good'];
  for (const level of order) if (qualities.includes(level)) return level;
  return 'unknown';
};

// Above this normalized level (0-1) someone is treated as talking. Low
// enough to catch quiet speech, high enough that room noise does not light
// up every tile at once.
export const SPEAKING_THRESHOLD = 0.06;

export const isSpeaking = (level) => typeof level === 'number' && level > SPEAKING_THRESHOLD;
