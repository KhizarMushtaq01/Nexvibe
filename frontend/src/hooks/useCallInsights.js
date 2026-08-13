import { useEffect, useState } from 'react';
import { qualityFromLoss, lossRatioFromStats, worstQuality, isSpeaking } from '../lib/callQuality';

/**
 * Polls peer-connection stats for a quality band, and audio levels for who
 * is speaking. Kept out of CallContext so a re-render every second does not
 * churn the whole call tree -- only the header and tiles consume this.
 *
 * @param peerConnections Map<userId, RTCPeerConnection>
 * @param remoteStreams   Map<userId, MediaStream>
 * @returns { quality: 'good'|'fair'|'poor'|'unknown', speakingIds: Set<string> }
 */
export const useCallInsights = (peerConnections, remoteStreams, enabled) => {
  const [quality, setQuality] = useState('unknown');
  const [speakingIds, setSpeakingIds] = useState(() => new Set());

  useEffect(() => {
    if (!enabled || !peerConnections?.size) { setQuality('unknown'); return; }

    let cancelled = false;
    const id = setInterval(async () => {
      const bands = [];
      for (const pc of peerConnections.values()) {
        try {
          const report = await pc.getStats();
          bands.push(qualityFromLoss(lossRatioFromStats(report.values ? [...report.values()] : [])));
        } catch { bands.push('unknown'); }
      }
      if (!cancelled) setQuality(worstQuality(bands));
    }, 3000);

    return () => { cancelled = true; clearInterval(id); };
  }, [peerConnections, enabled]);

  useEffect(() => {
    if (!enabled || !remoteStreams?.size) { setSpeakingIds(new Set()); return; }

    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }

    const analysers = new Map();
    for (const [userId, stream] of remoteStreams.entries()) {
      if (!stream?.getAudioTracks?.().length) continue;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analysers.set(userId, { analyser, buffer: new Uint8Array(analyser.frequencyBinCount) });
    }

    const id = setInterval(() => {
      const talking = new Set();
      for (const [userId, { analyser, buffer }] of analysers.entries()) {
        analyser.getByteTimeDomainData(buffer);
        // Byte time-domain data is centred on 128; deviation from that is
        // the signal amplitude.
        let peak = 0;
        for (const sample of buffer) peak = Math.max(peak, Math.abs(sample - 128) / 128);
        if (isSpeaking(peak)) talking.add(userId);
      }
      setSpeakingIds(talking);
    }, 250);

    return () => { clearInterval(id); try { ctx.close(); } catch { /* already closed */ } };
  }, [remoteStreams, enabled]);

  return { quality, speakingIds };
};
