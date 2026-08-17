import { describe, it, expect } from 'vitest';
import { normalizeApiOrigin } from './apiOrigin';

describe('normalizeApiOrigin', () => {
  it('returns an empty string when unset, so requests stay same-origin', () => {
    expect(normalizeApiOrigin(undefined)).toBe('');
    expect(normalizeApiOrigin('')).toBe('');
  });

  it('keeps a bare origin as-is', () => {
    expect(normalizeApiOrigin('https://nexvibe-api.onrender.com')).toBe('https://nexvibe-api.onrender.com');
  });

  it('strips trailing slashes so the joined path never becomes //api', () => {
    expect(normalizeApiOrigin('https://nexvibe-api.onrender.com/')).toBe('https://nexvibe-api.onrender.com');
    expect(normalizeApiOrigin('https://nexvibe-api.onrender.com///')).toBe('https://nexvibe-api.onrender.com');
  });

  it('trims surrounding whitespace picked up from a pasted env value', () => {
    expect(normalizeApiOrigin('  https://nexvibe-api.onrender.com/  ')).toBe('https://nexvibe-api.onrender.com');
  });
});
