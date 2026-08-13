import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRingtone } from './ringtone.js';

const makeFakeAudioContext = (state = 'running') => {
  const gainNode = { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  const oscillators = [];
  return {
    state,
    currentTime: 0,
    destination: {},
    close: vi.fn(),
    createGain: vi.fn(() => gainNode),
    createOscillator: vi.fn(() => {
      const osc = { type: 'sine', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() };
      oscillators.push(osc);
      return osc;
    }),
    _oscillators: oscillators,
    _gain: gainNode,
  };
};

describe('createRingtone', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts oscillators when the audio context is running', () => {
    const ctx = makeFakeAudioContext('running');
    const ring = createRingtone({ AudioContextCtor: () => ctx });
    ring.start('ring');
    expect(ctx._oscillators.length).toBeGreaterThan(0);
    expect(ctx._oscillators[0].start).toHaveBeenCalled();
  });

  it('plays nothing when autoplay policy has suspended the context, instead of throwing', () => {
    const ctx = makeFakeAudioContext('suspended');
    const ring = createRingtone({ AudioContextCtor: () => ctx });
    expect(() => ring.start('ring')).not.toThrow();
    expect(ctx._oscillators).toHaveLength(0);
  });

  it('survives an environment with no AudioContext at all', () => {
    const ring = createRingtone({ AudioContextCtor: () => { throw new Error('unsupported'); } });
    expect(() => ring.start('ring')).not.toThrow();
    expect(() => ring.stop()).not.toThrow();
  });

  it('vibrates on each ring burst when vibration is available', () => {
    const vibrate = vi.fn();
    const ring = createRingtone({ AudioContextCtor: () => makeFakeAudioContext(), vibrate });
    ring.start('ring');
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6000);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('does not vibrate for the caller-side ringback', () => {
    const vibrate = vi.fn();
    const ring = createRingtone({ AudioContextCtor: () => makeFakeAudioContext(), vibrate });
    ring.start('ringback');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('stops oscillators, cancels the loop and closes the context on stop', () => {
    const ctx = makeFakeAudioContext();
    const vibrate = vi.fn();
    const ring = createRingtone({ AudioContextCtor: () => ctx, vibrate });
    ring.start('ring');
    ring.stop();
    expect(ctx._oscillators[0].stop).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
    vi.advanceTimersByTime(20000);
    expect(vibrate.mock.calls.filter(c => Array.isArray(c[0]))).toHaveLength(1); // no further bursts after stop
  });

  it('starting twice does not stack two ringtones', () => {
    const ctx = makeFakeAudioContext();
    const ring = createRingtone({ AudioContextCtor: () => ctx });
    ring.start('ring');
    const afterFirst = ctx._oscillators.length;
    ring.start('ring');
    expect(ctx._oscillators.length).toBe(afterFirst);
  });

  it('stop is safe to call when never started', () => {
    const ring = createRingtone({ AudioContextCtor: () => makeFakeAudioContext() });
    expect(() => ring.stop()).not.toThrow();
  });
});
