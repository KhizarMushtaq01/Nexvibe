import { describe, it, expect } from 'vitest';
import { describeCallLog, CALL_OUTCOMES, formatCallDuration } from './callLog.js';

describe('formatCallDuration', () => {
  it('formats under a minute', () => expect(formatCallDuration(42)).toBe('0:42'));
  it('formats minutes and seconds', () => expect(formatCallDuration(252)).toBe('4:12'));
  it('formats past an hour', () => expect(formatCallDuration(3661)).toBe('1:01:01'));
  it('treats a missing duration as zero', () => expect(formatCallDuration(undefined)).toBe('0:00'));
});

describe('describeCallLog', () => {
  it('describes a completed audio call with its duration', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'completed', duration: 252 }))
      .toBe('Audio call · 4:12');
  });

  it('describes a completed video call', () => {
    expect(describeCallLog({ callType: 'video', outcome: 'completed', duration: 60 }))
      .toBe('Video call · 1:00');
  });

  it('describes an unanswered call from the recipient side as missed', () => {
    expect(describeCallLog({ callType: 'video', outcome: 'missed', isMine: false }))
      .toBe('Missed video call');
  });

  it('describes an unanswered call from the caller side as no answer', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'missed', isMine: true }))
      .toBe('No answer');
  });

  it('describes a declined call', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'declined' })).toBe('Call declined');
  });

  it('describes a failed call', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'failed' })).toBe("Call couldn't connect");
  });

  it('describes a busy call', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'busy' })).toBe('User was on another call');
  });

  it('falls back gracefully on an unknown outcome', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'weird' })).toBe('Audio call');
  });

  it('exports the exact set of outcomes the schema allows', () => {
    expect(CALL_OUTCOMES).toEqual(['completed', 'missed', 'declined', 'failed', 'busy']);
  });
});
