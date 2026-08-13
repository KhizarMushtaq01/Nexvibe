// A ringtone synthesized with the Web Audio API rather than shipped as an
// audio file: no asset to 404, no bundle weight, and no licensing question.
//
// Browsers suspend an AudioContext created without a prior user gesture. An
// incoming call is exactly that case, so a suspended context is treated as
// "no sound" -- the visual overlay and vibration still fire. Audio policy
// must never be able to stop a call from being answerable.

const PATTERNS = {
  // Callee side: two-tone burst, 2s on / 4s off, with vibration.
  ring: { freqs: [440, 480], onMs: 2000, cycleMs: 6000, gain: 0.12, vibrate: true },
  // Caller side: quieter single tone so you can hear the other end connect.
  ringback: { freqs: [420], onMs: 1000, cycleMs: 4000, gain: 0.06, vibrate: false },
};

const defaultAudioContextCtor = () => new (window.AudioContext || window.webkitAudioContext)();

export const createRingtone = ({
  AudioContextCtor = defaultAudioContextCtor,
  vibrate = (pattern) => navigator.vibrate?.(pattern),
} = {}) => {
  let ctx = null;
  let loopId = null;
  let oscillators = [];
  let running = false;

  const burst = (pattern) => {
    if (!ctx || ctx.state !== 'running') return;
    const gain = ctx.createGain();
    gain.gain.value = pattern.gain;
    gain.connect(ctx.destination);

    oscillators = pattern.freqs.map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + pattern.onMs / 1000);
      return osc;
    });
  };

  const start = (patternName = 'ring') => {
    if (running) return;
    const pattern = PATTERNS[patternName] || PATTERNS.ring;
    running = true;

    try { ctx = AudioContextCtor(); } catch { ctx = null; }

    const tick = () => {
      burst(pattern);
      if (pattern.vibrate) { try { vibrate([500, 1000]); } catch { /* unsupported */ } }
    };

    tick();
    loopId = setInterval(tick, pattern.cycleMs);
  };

  const stop = () => {
    running = false;
    if (loopId) { clearInterval(loopId); loopId = null; }
    for (const osc of oscillators) { try { osc.stop(); osc.disconnect(); } catch { /* already stopped */ } }
    oscillators = [];
    if (ctx) { try { ctx.close(); } catch { /* already closed */ } ctx = null; }
    try { vibrate(0); } catch { /* unsupported */ }
  };

  return { start, stop };
};
