import { describe, it, expect } from 'vitest';
import {
  sodiumReady, concatBytes, kdf, generateIdentity, generateOneTimePreKeys
} from './e2eCrypto.js';

describe('sodiumReady', () => {
  it('resolves once libsodium is initialized', async () => {
    await expect(sodiumReady()).resolves.toBeUndefined();
  });
});

describe('concatBytes', () => {
  it('concatenates multiple Uint8Arrays in order', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4, 5]);
    expect(Array.from(concatBytes(a, b))).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('kdf', () => {
  it('is deterministic for the same input and info string', async () => {
    await sodiumReady();
    const input = new Uint8Array(32).fill(7);
    const out1 = kdf(input, 'test-info', 32);
    const out2 = kdf(input, 'test-info', 32);
    expect(Array.from(out1)).toEqual(Array.from(out2));
    expect(out1.length).toBe(32);
  });

  it('produces different output for different info strings', async () => {
    await sodiumReady();
    const input = new Uint8Array(32).fill(7);
    const out1 = kdf(input, 'info-a', 32);
    const out2 = kdf(input, 'info-b', 32);
    expect(Array.from(out1)).not.toEqual(Array.from(out2));
  });
});

describe('generateIdentity', () => {
  it('returns a base64 public/private key pair', async () => {
    await sodiumReady();
    const identity = generateIdentity();
    expect(typeof identity.publicKey).toBe('string');
    expect(typeof identity.privateKey).toBe('string');
    expect(identity.publicKey).not.toBe(identity.privateKey);
  });

  it('returns a different key pair on each call', async () => {
    await sodiumReady();
    const a = generateIdentity();
    const b = generateIdentity();
    expect(a.publicKey).not.toBe(b.publicKey);
  });
});

describe('generateOneTimePreKeys', () => {
  it('generates the requested count with sequential keyIds', async () => {
    await sodiumReady();
    const keys = generateOneTimePreKeys(5, 100);
    expect(keys.length).toBe(5);
    expect(keys.map(k => k.keyId)).toEqual([100, 101, 102, 103, 104]);
    keys.forEach(k => {
      expect(typeof k.publicKey).toBe('string');
      expect(typeof k.privateKey).toBe('string');
    });
  });
});

import { initSessionAsSender, initSessionAsReceiver } from './e2eCrypto.js';

describe('X3DH-lite handshake', () => {
  it('sender and receiver derive the same initial root key and matching chain keys, with a one-time prekey', async () => {
    await sodiumReady();
    const alice = generateIdentity();
    const bob = generateIdentity();
    const bobPreKeys = generateOneTimePreKeys(1, 1);

    const bundle = {
      identityKey: bob.publicKey,
      oneTimePreKey: { keyId: bobPreKeys[0].keyId, publicKey: bobPreKeys[0].publicKey }
    };

    const { session: aliceSession, handshakeHeader } = initSessionAsSender(alice, bundle);
    const bobSession = initSessionAsReceiver(bob, bobPreKeys, handshakeHeader);

    expect(Array.from(aliceSession.rootKey)).toEqual(Array.from(bobSession.rootKey));
    // Alice's initial sending chain must equal Bob's initial receiving chain
    expect(Array.from(aliceSession.sendingChain.key)).toEqual(Array.from(bobSession.receivingChain.key));
  });

  it('works when the recipient has no unused one-time prekey left', async () => {
    await sodiumReady();
    const alice = generateIdentity();
    const bob = generateIdentity();

    const bundle = { identityKey: bob.publicKey, oneTimePreKey: null };
    const { session: aliceSession, handshakeHeader } = initSessionAsSender(alice, bundle);
    const bobSession = initSessionAsReceiver(bob, [], handshakeHeader);

    expect(Array.from(aliceSession.rootKey)).toEqual(Array.from(bobSession.rootKey));
    expect(Array.from(aliceSession.sendingChain.key)).toEqual(Array.from(bobSession.receivingChain.key));
  });
});

import { ratchetEncrypt, ratchetDecrypt, DecryptError } from './e2eCrypto.js';

function makeSessionPair() {
  const alice = generateIdentity();
  const bob = generateIdentity();
  const bobPreKeys = generateOneTimePreKeys(1, 1);
  const bundle = {
    identityKey: bob.publicKey,
    oneTimePreKey: { keyId: bobPreKeys[0].keyId, publicKey: bobPreKeys[0].publicKey }
  };
  const { session: aliceSession, handshakeHeader } = initSessionAsSender(alice, bundle);
  const bobSession = initSessionAsReceiver(bob, bobPreKeys, handshakeHeader);
  return { aliceSession, bobSession, handshakeHeader };
}

describe('ratchetEncrypt / ratchetDecrypt', () => {
  it('round-trips a single message from Alice to Bob (first message, includes handshake header)', async () => {
    await sodiumReady();
    const { aliceSession, bobSession, handshakeHeader } = makeSessionPair();

    const { ciphertext, header } = ratchetEncrypt(aliceSession, 'hello bob');
    const fullHeader = { ...header, ...handshakeHeader };
    const { plaintext } = ratchetDecrypt(bobSession, ciphertext, fullHeader);

    expect(plaintext).toBe('hello bob');
  });

  it('round-trips multiple messages in one direction', async () => {
    await sodiumReady();
    const { aliceSession, bobSession, handshakeHeader } = makeSessionPair();
    const msgs = ['first', 'second', 'third'];
    const sent = msgs.map((m, i) => {
      const { ciphertext, header } = ratchetEncrypt(aliceSession, m);
      return { ciphertext, header: i === 0 ? { ...header, ...handshakeHeader } : header };
    });
    const received = sent.map(s => ratchetDecrypt(bobSession, s.ciphertext, s.header).plaintext);
    expect(received).toEqual(msgs);
  });

  it('round-trips a reply, exercising the DH ratchet turn', async () => {
    await sodiumReady();
    const { aliceSession, bobSession, handshakeHeader } = makeSessionPair();

    const first = ratchetEncrypt(aliceSession, 'hi bob');
    const firstReceived = ratchetDecrypt(bobSession, first.ciphertext, { ...first.header, ...handshakeHeader });
    expect(firstReceived.plaintext).toBe('hi bob');

    const reply = ratchetEncrypt(bobSession, 'hi alice');
    const replyReceived = ratchetDecrypt(aliceSession, reply.ciphertext, reply.header);
    expect(replyReceived.plaintext).toBe('hi alice');

    const second = ratchetEncrypt(aliceSession, 'how are you');
    const secondReceived = ratchetDecrypt(bobSession, second.ciphertext, second.header);
    expect(secondReceived.plaintext).toBe('how are you');
  });

  it('handles out-of-order delivery via skipped message keys', async () => {
    await sodiumReady();
    const { aliceSession, bobSession, handshakeHeader } = makeSessionPair();
    const msgs = ['one', 'two', 'three'];
    const sent = msgs.map((m, i) => {
      const { ciphertext, header } = ratchetEncrypt(aliceSession, m);
      return { ciphertext, header: i === 0 ? { ...header, ...handshakeHeader } : header };
    });

    // Deliver out of order: 3, 1, 2
    const r3 = ratchetDecrypt(bobSession, sent[2].ciphertext, sent[2].header).plaintext;
    const r1 = ratchetDecrypt(bobSession, sent[0].ciphertext, sent[0].header).plaintext;
    const r2 = ratchetDecrypt(bobSession, sent[1].ciphertext, sent[1].header).plaintext;

    expect([r1, r2, r3]).toEqual(msgs);
  });

  it('throws DecryptError on a tampered ciphertext', async () => {
    await sodiumReady();
    const { aliceSession, bobSession, handshakeHeader } = makeSessionPair();
    const { ciphertext, header } = ratchetEncrypt(aliceSession, 'hello');
    const tampered = ciphertext.slice(0, -4) + 'abcd';
    expect(() => ratchetDecrypt(bobSession, tampered, { ...header, ...handshakeHeader }))
      .toThrow(DecryptError);
  });
});
