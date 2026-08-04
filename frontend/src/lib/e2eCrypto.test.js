import { describe, it, expect } from 'vitest';
import { sodiumReady } from './e2eCrypto.js';

describe('sodiumReady', () => {
  it('resolves once libsodium is initialized', async () => {
    await expect(sodiumReady()).resolves.toBeUndefined();
  });
});
