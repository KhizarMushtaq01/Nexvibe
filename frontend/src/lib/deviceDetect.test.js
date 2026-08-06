import { describe, it, expect } from 'vitest';
import { detectPlatform } from './deviceDetect.js';

describe('detectPlatform', () => {
  it('detects Android', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
    expect(detectPlatform(ua)).toBe('android');
  });

  it('detects iOS from an iPhone UA', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('detects iOS from an iPad UA', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('detects Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0';
    expect(detectPlatform(ua)).toBe('windows');
  });

  it('detects macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('macos');
  });

  it('falls back to other for an unrecognized UA', () => {
    expect(detectPlatform('SomeWeirdBot/1.0')).toBe('other');
  });

  it('falls back to other when called with no argument', () => {
    expect(detectPlatform()).toBe('other');
  });
});
