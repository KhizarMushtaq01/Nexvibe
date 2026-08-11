import { describe, it, expect } from 'vitest';
import {
  MAX_CALL_PARTICIPANTS,
  buildIceServers,
  isOfferer,
  getMediaConstraints,
  videoSenderParams,
  capParticipants,
  describeMediaError,
} from './webrtc.js';

describe('buildIceServers', () => {
  it('falls back to the public Google STUN server when nothing is configured', () => {
    expect(buildIceServers({})).toEqual([{ urls: ['stun:stun.l.google.com:19302'] }]);
  });

  it('splits VITE_STUN_URLS on commas and trims whitespace', () => {
    expect(buildIceServers({ VITE_STUN_URLS: 'stun:a.example:3478, stun:b.example:3478' }))
      .toEqual([{ urls: ['stun:a.example:3478', 'stun:b.example:3478'] }]);
  });

  it('appends a TURN server when the url and both credentials are present', () => {
    const servers = buildIceServers({
      VITE_TURN_URL: 'turn:t.example:3478',
      VITE_TURN_USERNAME: 'user',
      VITE_TURN_CREDENTIAL: 'pass',
    });
    expect(servers).toHaveLength(2);
    expect(servers[1]).toEqual({ urls: ['turn:t.example:3478'], username: 'user', credential: 'pass' });
  });

  it('ignores a TURN url with missing credentials rather than emitting an unusable server', () => {
    expect(buildIceServers({ VITE_TURN_URL: 'turn:t.example:3478' })).toHaveLength(1);
  });
});

describe('isOfferer', () => {
  it('makes the lexicographically lower user id the offerer', () => {
    expect(isOfferer('aaa', 'bbb')).toBe(true);
    expect(isOfferer('bbb', 'aaa')).toBe(false);
  });

  it('is exactly one-sided for every pair, so neither glare nor deadlock is possible', () => {
    const ids = ['64a', '64b', '64c', '12z'];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        expect(isOfferer(a, b)).toBe(!isOfferer(b, a));
      }
    }
  });

  it('coerces non-string ids (Mongo ObjectIds) before comparing', () => {
    expect(isOfferer({ toString: () => 'aaa' }, { toString: () => 'bbb' })).toBe(true);
  });
});

describe('getMediaConstraints', () => {
  it('requests no video at all for an audio call', () => {
    expect(getMediaConstraints({ callType: 'audio', peerCount: 1 }).video).toBe(false);
  });

  it('always enables echo cancellation and noise suppression on audio', () => {
    const { audio } = getMediaConstraints({ callType: 'audio', peerCount: 1 });
    expect(audio.echoCancellation).toBe(true);
    expect(audio.noiseSuppression).toBe(true);
  });

  it('uses 720p for a 1-on-1 video call', () => {
    const { video } = getMediaConstraints({ callType: 'video', peerCount: 1 });
    expect(video.width.ideal).toBe(1280);
    expect(video.height.ideal).toBe(720);
    expect(video.frameRate.ideal).toBe(30);
  });

  it('drops to 240p/15fps once a video call has more than one peer', () => {
    const { video } = getMediaConstraints({ callType: 'video', peerCount: 2 });
    expect(video.width.ideal).toBe(320);
    expect(video.height.ideal).toBe(240);
    expect(video.frameRate.ideal).toBe(15);
  });
});

describe('videoSenderParams', () => {
  it('caps group video bitrate', () => {
    expect(videoSenderParams(2)).toEqual({ maxBitrate: 150000 });
  });

  it('leaves 1-on-1 video uncapped', () => {
    expect(videoSenderParams(1)).toBeNull();
  });
});

describe('capParticipants', () => {
  it('removes the caller from the participant list', () => {
    expect(capParticipants(['me', 'a', 'b'], 'me')).toEqual(['a', 'b']);
  });

  it('de-duplicates ids', () => {
    expect(capParticipants(['a', 'a', 'b'], 'me')).toEqual(['a', 'b']);
  });

  it('keeps the call within MAX_CALL_PARTICIPANTS including the caller', () => {
    const many = Array.from({ length: 20 }, (_, i) => `u${i}`);
    expect(capParticipants(many, 'me')).toHaveLength(MAX_CALL_PARTICIPANTS - 1);
  });
});

describe('describeMediaError', () => {
  it('explains a permission denial', () => {
    const { message, fallbackToAudio } = describeMediaError({ name: 'NotAllowedError' }, 'video');
    expect(message).toMatch(/permission/i);
    expect(fallbackToAudio).toBe(false);
  });

  it('falls back to audio when a video call finds no camera', () => {
    expect(describeMediaError({ name: 'NotFoundError' }, 'video').fallbackToAudio).toBe(true);
  });

  it('does not offer an audio fallback when an audio call finds no microphone', () => {
    const { message, fallbackToAudio } = describeMediaError({ name: 'NotFoundError' }, 'audio');
    expect(fallbackToAudio).toBe(false);
    expect(message).toMatch(/microphone/i);
  });

  it('explains a device already in use', () => {
    expect(describeMediaError({ name: 'NotReadableError' }, 'audio').message).toMatch(/another app/i);
  });

  it('has a generic message for an unknown error', () => {
    expect(describeMediaError({ name: 'WeirdError' }, 'audio').message).toBeTruthy();
  });
});
