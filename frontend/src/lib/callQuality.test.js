import { describe, it, expect } from 'vitest';
import { qualityFromLoss, lossRatioFromStats, worstQuality, isSpeaking, SPEAKING_THRESHOLD } from './callQuality.js';

describe('qualityFromLoss', () => {
  it('calls under 2% loss good', () => expect(qualityFromLoss(0.01)).toBe('good'));
  it('calls 2-5% loss fair', () => expect(qualityFromLoss(0.03)).toBe('fair'));
  it('calls over 5% loss poor', () => expect(qualityFromLoss(0.2)).toBe('poor'));
  it('treats the 2% boundary as fair, not good', () => expect(qualityFromLoss(0.02)).toBe('fair'));
  it('returns unknown for a null reading', () => expect(qualityFromLoss(null)).toBe('unknown'));
  it('returns unknown for NaN', () => expect(qualityFromLoss(NaN)).toBe('unknown'));
});

describe('lossRatioFromStats', () => {
  it('computes the ratio across every inbound stream', () => {
    const reports = [
      { type: 'inbound-rtp', packetsReceived: 90, packetsLost: 10 },
      { type: 'outbound-rtp', packetsSent: 100 },
    ];
    expect(lossRatioFromStats(reports)).toBeCloseTo(0.1);
  });

  it('sums multiple inbound streams', () => {
    const reports = [
      { type: 'inbound-rtp', packetsReceived: 50, packetsLost: 0 },
      { type: 'inbound-rtp', packetsReceived: 50, packetsLost: 100 },
    ];
    expect(lossRatioFromStats(reports)).toBeCloseTo(0.5);
  });

  it('returns null before any packets have arrived, rather than 0', () => {
    expect(lossRatioFromStats([{ type: 'inbound-rtp', packetsReceived: 0, packetsLost: 0 }])).toBeNull();
  });

  it('returns null for an empty or missing report', () => {
    expect(lossRatioFromStats([])).toBeNull();
    expect(lossRatioFromStats(null)).toBeNull();
  });

  it('tolerates reports with missing counters', () => {
    expect(lossRatioFromStats([{ type: 'inbound-rtp' }])).toBeNull();
  });
});

describe('worstQuality', () => {
  it('surfaces the worst band present', () => {
    expect(worstQuality(['good', 'poor', 'fair'])).toBe('poor');
    expect(worstQuality(['good', 'fair'])).toBe('fair');
    expect(worstQuality(['good', 'good'])).toBe('good');
  });

  it('returns unknown when there is nothing to judge', () => {
    expect(worstQuality([])).toBe('unknown');
    expect(worstQuality(['unknown'])).toBe('unknown');
  });
});

describe('isSpeaking', () => {
  it('is true above the threshold', () => expect(isSpeaking(SPEAKING_THRESHOLD + 0.01)).toBe(true));
  it('is false at or below the threshold', () => {
    expect(isSpeaking(SPEAKING_THRESHOLD)).toBe(false);
    expect(isSpeaking(0)).toBe(false);
  });
  it('is false for a missing level', () => expect(isSpeaking(undefined)).toBe(false));
});
