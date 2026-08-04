# E2E Encrypted Direct Messages (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt 1-on-1 (direct) text messages client-side so the NexVibe server never has access to plaintext, using a Double Ratchet (forward secrecy) bootstrapped by a simplified X3DH handshake — plus a message-reporting path and content-free new-message notifications that work despite the server being unable to read message content.

**Architecture:** All crypto runs in the browser via `libsodium-wrappers` (audited primitives). A new `frontend/src/lib/e2eCrypto.js` implements the X3DH-lite handshake and Double Ratchet state machine from Signal's public spec on top of those primitives; `frontend/src/lib/e2eStorage.js` persists per-device keys and per-conversation ratchet state in IndexedDB, never sent to the server. The backend only stores/relays public keys and ciphertext (new `e2e` fields on `User`, new `encrypted`/`encryptedContent` fields on `Message`), plus two small new capabilities that stay compatible with never seeing plaintext: message reporting (the reporter's own client submits its already-decrypted copy as evidence) and generic new-message notifications (sender name only, no content).

**Tech Stack:** `libsodium-wrappers` (new frontend dependency, X25519/XChaCha20-Poly1305/BLAKE2b), `vitest` (new frontend dev dependency, for the crypto module's unit tests — no test runner exists in this repo today), native browser IndexedDB (no new dependency), existing stack otherwise (Express, Mongoose, Socket.io, React, Resend).

## Global Constraints

- Only `libsodium-wrappers` provides cryptographic primitives (key generation, ECDH, AEAD encryption, hashing). No hand-rolled crypto math anywhere — only protocol *state machine* logic is custom, built from Signal's public X3DH/Double Ratchet specs.
- Group conversations (`Conversation.type === 'group'`) and media messages are explicitly out of scope for this plan — untouched, stay plaintext.
- Multi-device is explicitly out of scope — each browser/device has its own identity key; no key sync between devices.
- No Web Push / service-worker infrastructure is built in this plan — only in-app `Notification` documents (existing collection, `type: 'message'` already in its enum but unused) and a generic Resend email.
- No message content (plaintext or ciphertext) is ever included in a `Notification.text`, an email body, or a server log line.
- Backend responses follow the existing `{ success: true/false, message? }` shape and try/catch → `500` with `error.message` pattern used throughout `backend/controllers/`.
- No automated backend or React-component test suite exists in this repo (neither `package.json` has a `test` script prior to this plan) — this plan adds `vitest` **only** for the pure-logic crypto module (Task 1-4); everything else is verified manually/by script, matching this repo's existing convention (confirmed during the Resend/Cloudinary setup earlier in this project).

---

### Task 1: Frontend crypto tooling setup

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.js`
- Create: `frontend/src/lib/e2eCrypto.js` (stub for this task, filled in Tasks 2-4)
- Test: `frontend/src/lib/e2eCrypto.test.js`

**Interfaces:**
- Produces: `sodiumReady()` — async function other modules/tests call before using any `e2eCrypto.js` export, resolving once `libsodium-wrappers` has finished its WASM init.

- [ ] **Step 1: Install dependencies**

```bash
cd frontend
npm install libsodium-wrappers
npm install -D vitest
```

- [ ] **Step 2: Add the test script and vitest config**

Edit `frontend/package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

Create `frontend/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node'
  }
});
```

- [ ] **Step 3: Write the failing test**

Create `frontend/src/lib/e2eCrypto.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { sodiumReady } from './e2eCrypto.js';

describe('sodiumReady', () => {
  it('resolves once libsodium is initialized', async () => {
    await expect(sodiumReady()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `e2eCrypto.js` doesn't exist yet / `sodiumReady` is not exported.

- [ ] **Step 5: Write minimal implementation**

Create `frontend/src/lib/e2eCrypto.js`:
```js
import sodium from 'libsodium-wrappers';

export const sodiumReady = () => sodium.ready;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.js frontend/src/lib/e2eCrypto.js frontend/src/lib/e2eCrypto.test.js
git commit -m "Add libsodium-wrappers and vitest for E2E crypto module"
```

---

### Task 2: Crypto module — KDF, byte helpers, identity/prekey generation

**Files:**
- Modify: `frontend/src/lib/e2eCrypto.js`
- Test: `frontend/src/lib/e2eCrypto.test.js`

**Interfaces:**
- Consumes: `sodiumReady()` from Task 1.
- Produces:
  - `concatBytes(...arrays: Uint8Array[]): Uint8Array`
  - `kdf(inputKeyMaterial: Uint8Array, info: string, outputLength?: number): Uint8Array` — used by every later key-derivation step in Tasks 3-4.
  - `generateIdentity(): { publicKey: string, privateKey: string }` — base64-encoded X25519 key pair.
  - `generateOneTimePreKeys(count: number, startKeyId?: number): Array<{ keyId: number, publicKey: string, privateKey: string }>` — base64-encoded.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/e2eCrypto.test.js`:
```js
import {
  sodiumReady, concatBytes, kdf, generateIdentity, generateOneTimePreKeys
} from './e2eCrypto.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — `concatBytes`, `kdf`, `generateIdentity`, `generateOneTimePreKeys` not exported.

- [ ] **Step 3: Write minimal implementation**

Replace `frontend/src/lib/e2eCrypto.js` with:
```js
import sodium from 'libsodium-wrappers';

export const sodiumReady = () => sodium.ready;

export function concatBytes(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// Not a strict RFC5869 HKDF, but the same extract-then-expand shape built on
// crypto_generichash (BLAKE2b keyed hash), which every libsodium-wrappers
// build exposes -- avoids depending on a specific HKDF helper name that may
// differ across library versions.
export function kdf(inputKeyMaterial, info, outputLength = 32) {
  const prk = sodium.crypto_generichash(32, inputKeyMaterial);
  const infoBytes = sodium.from_string(info);
  const expandInput = concatBytes(infoBytes, new Uint8Array([0x01]));
  return sodium.crypto_generichash(outputLength, expandInput, prk);
}

export function generateIdentity() {
  const pair = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(pair.publicKey),
    privateKey: sodium.to_base64(pair.privateKey)
  };
}

export function generateOneTimePreKeys(count, startKeyId = 1) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    const pair = sodium.crypto_box_keypair();
    keys.push({
      keyId: startKeyId + i,
      publicKey: sodium.to_base64(pair.publicKey),
      privateKey: sodium.to_base64(pair.privateKey)
    });
  }
  return keys;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS (all tests from Task 1 and Task 2)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/e2eCrypto.js frontend/src/lib/e2eCrypto.test.js
git commit -m "Add KDF and identity/prekey generation to E2E crypto module"
```

---

### Task 3: Crypto module — X3DH-lite handshake

**Files:**
- Modify: `frontend/src/lib/e2eCrypto.js`
- Test: `frontend/src/lib/e2eCrypto.test.js`

**Interfaces:**
- Consumes: `concatBytes`, `kdf` from Task 2; `sodium` (module-internal).
- Produces:
  - `initSessionAsSender(myIdentityKeyPair: {publicKey, privateKey} (base64), theirBundle: {identityKey: string, oneTimePreKey: {keyId, publicKey} | null}): { session: Session, handshakeHeader: {senderIdentityKey, senderEphemeralKey, oneTimePreKeyId} }`
  - `initSessionAsReceiver(myIdentityKeyPair: {publicKey, privateKey} (base64), myOneTimePreKeys: Array<{keyId, publicKey, privateKey}> (base64), handshakeHeader: {senderIdentityKey, senderEphemeralKey, oneTimePreKeyId}): Session`
  - `Session` shape (internal, opaque to callers): `{ rootKey, sendingChain: {key, n}, receivingChain: {key, n}, dhSelfPrivateKey, dhSelfPublicKey, dhRemotePublicKey, previousChainLength, skippedMessageKeys }` — all key fields are raw `Uint8Array` (NOT base64) once inside a `Session`; only wire-format fields (`handshakeHeader`, and later `header`/`ciphertext` from Task 4) are base64 strings.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/e2eCrypto.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `initSessionAsSender`/`initSessionAsReceiver` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `frontend/src/lib/e2eCrypto.js`:
```js
export function initSessionAsSender(myIdentityKeyPair, theirBundle) {
  const myIdentityPriv = sodium.from_base64(myIdentityKeyPair.privateKey);
  const ephemeral = sodium.crypto_box_keypair();
  const theirIdentityPub = sodium.from_base64(theirBundle.identityKey);
  const hasOPK = !!theirBundle.oneTimePreKey;
  const theirOPKPub = hasOPK ? sodium.from_base64(theirBundle.oneTimePreKey.publicKey) : null;

  const dh2 = sodium.crypto_scalarmult(ephemeral.privateKey, theirIdentityPub);
  const dhParts = [];
  if (hasOPK) dhParts.push(sodium.crypto_scalarmult(myIdentityPriv, theirOPKPub));
  dhParts.push(dh2);
  if (hasOPK) dhParts.push(sodium.crypto_scalarmult(ephemeral.privateKey, theirOPKPub));
  const sharedSecret = kdf(concatBytes(...dhParts), 'x3dh-shared-secret', 32);

  const ratchetMaterial = concatBytes(sharedSecret, dh2);
  const rootKey = kdf(ratchetMaterial, 'ratchet-root', 32);
  const sendingChainKey = kdf(ratchetMaterial, 'ratchet-chain', 32);

  const session = {
    rootKey,
    sendingChain: { key: sendingChainKey, n: 0 },
    receivingChain: { key: null, n: 0 },
    dhSelfPrivateKey: ephemeral.privateKey,
    dhSelfPublicKey: ephemeral.publicKey,
    dhRemotePublicKey: theirIdentityPub,
    previousChainLength: 0,
    skippedMessageKeys: {}
  };

  return {
    session,
    handshakeHeader: {
      senderIdentityKey: myIdentityKeyPair.publicKey,
      senderEphemeralKey: sodium.to_base64(ephemeral.publicKey),
      oneTimePreKeyId: hasOPK ? theirBundle.oneTimePreKey.keyId : null
    }
  };
}

export function initSessionAsReceiver(myIdentityKeyPair, myOneTimePreKeys, handshakeHeader) {
  const myIdentityPriv = sodium.from_base64(myIdentityKeyPair.privateKey);
  const myIdentityPub = sodium.from_base64(myIdentityKeyPair.publicKey);
  const theirIdentityPub = sodium.from_base64(handshakeHeader.senderIdentityKey);
  const theirEphemeralPub = sodium.from_base64(handshakeHeader.senderEphemeralKey);

  const usedOPK = handshakeHeader.oneTimePreKeyId != null
    ? myOneTimePreKeys.find(k => k.keyId === handshakeHeader.oneTimePreKeyId)
    : null;

  const dh2 = sodium.crypto_scalarmult(myIdentityPriv, theirEphemeralPub);
  const dhParts = [];
  if (usedOPK) {
    const opkPriv = sodium.from_base64(usedOPK.privateKey);
    dhParts.push(sodium.crypto_scalarmult(opkPriv, theirIdentityPub));
  }
  dhParts.push(dh2);
  if (usedOPK) {
    const opkPriv = sodium.from_base64(usedOPK.privateKey);
    dhParts.push(sodium.crypto_scalarmult(opkPriv, theirEphemeralPub));
  }
  const sharedSecret = kdf(concatBytes(...dhParts), 'x3dh-shared-secret', 32);

  const ratchetMaterial = concatBytes(sharedSecret, dh2);
  const rootKey = kdf(ratchetMaterial, 'ratchet-root', 32);
  const receivingChainKey = kdf(ratchetMaterial, 'ratchet-chain', 32);

  return {
    rootKey,
    sendingChain: { key: null, n: 0 },
    receivingChain: { key: receivingChainKey, n: 0 },
    dhSelfPrivateKey: myIdentityPriv,
    dhSelfPublicKey: myIdentityPub,
    dhRemotePublicKey: theirEphemeralPub,
    previousChainLength: 0,
    skippedMessageKeys: {}
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS (all tests from Tasks 1-3)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/e2eCrypto.js frontend/src/lib/e2eCrypto.test.js
git commit -m "Add X3DH-lite handshake to E2E crypto module"
```

---

### Task 4: Crypto module — Double Ratchet encrypt/decrypt

**Files:**
- Modify: `frontend/src/lib/e2eCrypto.js`
- Test: `frontend/src/lib/e2eCrypto.test.js`

**Interfaces:**
- Consumes: `Session` shape, `concatBytes`, `kdf` from Tasks 2-3.
- Produces:
  - `class DecryptError extends Error {}`
  - `ratchetEncrypt(session: Session, plaintext: string): { ciphertext: string, header: {dhPublicKey, previousChainLength, messageNumber}, session: Session }` — mutates and returns the same `session` object.
  - `ratchetDecrypt(session: Session, ciphertext: string, header: {dhPublicKey, previousChainLength, messageNumber}): { plaintext: string, session: Session }` — mutates and returns the same `session` object; throws `DecryptError` on failure.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/lib/e2eCrypto.test.js`:
```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test`
Expected: FAIL — `ratchetEncrypt`/`ratchetDecrypt`/`DecryptError` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `frontend/src/lib/e2eCrypto.js`:
```js
export class DecryptError extends Error {}

const MAX_SKIP = 1000;

function chainStep(chainKey) {
  const messageKey = kdf(chainKey, 'message-key', 32);
  const nextChainKey = kdf(chainKey, 'chain-key', 32);
  return { messageKey, nextChainKey };
}

function performDhRatchetStep(session, theirNewDhPublicKey) {
  const dhOut1 = sodium.crypto_scalarmult(session.dhSelfPrivateKey, theirNewDhPublicKey);
  const material1 = concatBytes(session.rootKey, dhOut1);
  const rootKeyAfterReceive = kdf(material1, 'ratchet-root', 32);
  const receivingChainKey = kdf(material1, 'ratchet-chain', 32);

  const newSelf = sodium.crypto_box_keypair();
  const dhOut2 = sodium.crypto_scalarmult(newSelf.privateKey, theirNewDhPublicKey);
  const material2 = concatBytes(rootKeyAfterReceive, dhOut2);
  const rootKeyAfterSend = kdf(material2, 'ratchet-root', 32);
  const sendingChainKey = kdf(material2, 'ratchet-chain', 32);

  session.previousChainLength = session.sendingChain.n;
  session.rootKey = rootKeyAfterSend;
  session.receivingChain = { key: receivingChainKey, n: 0 };
  session.sendingChain = { key: sendingChainKey, n: 0 };
  session.dhSelfPrivateKey = newSelf.privateKey;
  session.dhSelfPublicKey = newSelf.publicKey;
  session.dhRemotePublicKey = theirNewDhPublicKey;
}

function selfRatchetStep(session) {
  const newSelf = sodium.crypto_box_keypair();
  const dhOut = sodium.crypto_scalarmult(newSelf.privateKey, session.dhRemotePublicKey);
  const material = concatBytes(session.rootKey, dhOut);
  session.rootKey = kdf(material, 'ratchet-root', 32);
  session.sendingChain = { key: kdf(material, 'ratchet-chain', 32), n: 0 };
  session.dhSelfPrivateKey = newSelf.privateKey;
  session.dhSelfPublicKey = newSelf.publicKey;
}

function skipMessageKeys(session, untilN) {
  if (!session.receivingChain.key || session.receivingChain.n >= untilN) return;
  const remoteKeyB64 = sodium.to_base64(session.dhRemotePublicKey);
  while (session.receivingChain.n < untilN) {
    const { messageKey, nextChainKey } = chainStep(session.receivingChain.key);
    session.skippedMessageKeys[`${remoteKeyB64}|${session.receivingChain.n}`] = messageKey;
    session.receivingChain.key = nextChainKey;
    session.receivingChain.n++;
  }
  const keys = Object.keys(session.skippedMessageKeys);
  if (keys.length > MAX_SKIP) {
    for (const k of keys.slice(0, keys.length - MAX_SKIP)) delete session.skippedMessageKeys[k];
  }
}

function aeadEncrypt(key, plaintext, header) {
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const aad = sodium.from_string(JSON.stringify(header));
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.from_string(plaintext), aad, null, nonce, key
  );
  return sodium.to_base64(concatBytes(nonce, ct));
}

function aeadDecrypt(key, ciphertextB64, header) {
  const raw = sodium.from_base64(ciphertextB64);
  const nonceLen = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  const nonce = raw.slice(0, nonceLen);
  const ct = raw.slice(nonceLen);
  const aad = sodium.from_string(JSON.stringify(header));
  try {
    const plaintextBytes = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ct, aad, nonce, key);
    return sodium.to_string(plaintextBytes);
  } catch {
    throw new DecryptError('Failed to decrypt message');
  }
}

export function ratchetEncrypt(session, plaintext) {
  if (!session.sendingChain.key) {
    selfRatchetStep(session);
  }
  const { messageKey, nextChainKey } = chainStep(session.sendingChain.key);
  const n = session.sendingChain.n;
  session.sendingChain.key = nextChainKey;
  session.sendingChain.n = n + 1;

  const header = {
    dhPublicKey: sodium.to_base64(session.dhSelfPublicKey),
    previousChainLength: session.previousChainLength,
    messageNumber: n
  };
  const ciphertext = aeadEncrypt(messageKey, plaintext, header);
  return { ciphertext, header, session };
}

export function ratchetDecrypt(session, ciphertext, header) {
  const skipCacheKey = `${header.dhPublicKey}|${header.messageNumber}`;
  if (session.skippedMessageKeys[skipCacheKey]) {
    const messageKey = session.skippedMessageKeys[skipCacheKey];
    delete session.skippedMessageKeys[skipCacheKey];
    const plaintext = aeadDecrypt(messageKey, ciphertext, header);
    return { plaintext, session };
  }

  const incomingDh = sodium.from_base64(header.dhPublicKey);
  const isNewRatchetKey = !session.dhRemotePublicKey ||
    sodium.to_base64(session.dhRemotePublicKey) !== header.dhPublicKey;

  if (isNewRatchetKey) {
    skipMessageKeys(session, header.previousChainLength);
    performDhRatchetStep(session, incomingDh);
  }

  skipMessageKeys(session, header.messageNumber);
  const { messageKey, nextChainKey } = chainStep(session.receivingChain.key);
  session.receivingChain.key = nextChainKey;
  session.receivingChain.n = header.messageNumber + 1;

  const plaintext = aeadDecrypt(messageKey, ciphertext, header);
  return { plaintext, session };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS (all tests from Tasks 1-4)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/e2eCrypto.js frontend/src/lib/e2eCrypto.test.js
git commit -m "Add Double Ratchet encrypt/decrypt to E2E crypto module"
```

---

### Task 5: Frontend — IndexedDB key/session storage

**Files:**
- Create: `frontend/src/lib/e2eStorage.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure IndexedDB wrapper; stores whatever plain objects `e2eCrypto.js` produces, but doesn't import it).
- Produces:
  - `getLocalIdentity(): Promise<{publicKey, privateKey} | null>`
  - `saveLocalIdentity(identity: {publicKey, privateKey}): Promise<void>`
  - `getUnusedOneTimePreKeys(): Promise<Array<{keyId, publicKey, privateKey}>>`
  - `saveOneTimePreKeys(keys: Array<{keyId, publicKey, privateKey}>): Promise<void>`
  - `consumeOneTimePreKey(keyId: number): Promise<void>` — deletes the local private key once the server confirms it was used.
  - `getSession(conversationId: string): Promise<Session | null>` — the raw `Session` object from `e2eCrypto.js` has `Uint8Array` fields, which IndexedDB (structured clone) stores natively without serialization.
  - `saveSession(conversationId: string, session: Session): Promise<void>`

- [ ] **Step 1: Write the implementation**

Create `frontend/src/lib/e2eStorage.js`:
```js
const DB_NAME = 'nexvibe-e2e';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('identity')) {
        db.createObjectStore('identity'); // single row, key 'self'
      }
      if (!db.objectStoreNames.contains('oneTimePreKeys')) {
        db.createObjectStore('oneTimePreKeys', { keyPath: 'keyId' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions'); // keyed by conversationId
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runTx(storeName, mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  }));
}

export function getLocalIdentity() {
  return runTx('identity', 'readonly', store => {
    return new Promise((resolve, reject) => {
      const req = store.get('self');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }).then(wrapped => wrapped);
}

export function saveLocalIdentity(identity) {
  return runTx('identity', 'readwrite', store => store.put(identity, 'self'));
}

export function getUnusedOneTimePreKeys() {
  return runTx('oneTimePreKeys', 'readonly', store => {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }).then(rows => rows);
}

export function saveOneTimePreKeys(keys) {
  return runTx('oneTimePreKeys', 'readwrite', store => {
    keys.forEach(k => store.put(k));
  });
}

export function consumeOneTimePreKey(keyId) {
  return runTx('oneTimePreKeys', 'readwrite', store => store.delete(keyId));
}

export function getSession(conversationId) {
  return runTx('sessions', 'readonly', store => {
    return new Promise((resolve, reject) => {
      const req = store.get(conversationId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }).then(session => session);
}

export function saveSession(conversationId, session) {
  return runTx('sessions', 'readwrite', store => store.put(session, conversationId));
}
```

Note on `getLocalIdentity`/`getUnusedOneTimePreKeys` etc.: `runTx`'s inner `fn` sometimes returns a `Promise` (for read operations using `req.onsuccess`) and sometimes returns a plain value/`IDBRequest` (for writes) — in both cases `tx.oncomplete` resolves the outer promise with whatever `result` was captured, but for reads the actual data must come from the inner promise's resolution, not from `tx.oncomplete` timing (which fires after the read but doesn't carry its value). To keep this correct, reads resolve their own value via the inner `req.onsuccess` and `runTx` returns that inner promise's value through the chain (`.then(x => x)`), while `tx.oncomplete` is only used to know the transaction didn't fail. This matches standard IndexedDB usage where you read the value from the request itself, not the transaction.

- [ ] **Step 2: Manual verification**

There is no IndexedDB implementation available under `vitest`'s default `node` environment (confirmed by `vitest.config.js` in Task 1 using `environment: 'node'`), and adding a polyfill (`fake-indexeddb`) purely to unit-test a thin CRUD wrapper is more infrastructure than this module's complexity justifies — verify it directly in the browser instead, alongside Task 11 (which is the first task that actually calls these functions from the app). For now, confirm the module has no syntax errors:

Run: `cd frontend && node -e "import('./src/lib/e2eStorage.js').then(m => console.log('exports:', Object.keys(m))).catch(e => { console.error(e); process.exit(1); })"`
Expected: prints `exports: [ 'getLocalIdentity', 'saveLocalIdentity', 'getUnusedOneTimePreKeys', 'saveOneTimePreKeys', 'consumeOneTimePreKey', 'getSession', 'saveSession' ]` (note: `indexedDB` is undefined outside a browser, but that's only touched when the exported functions are *called*, not at module-load time, so this smoke test passing confirms the module parses and loads correctly).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/e2eStorage.js
git commit -m "Add IndexedDB storage for E2E identity keys and ratchet sessions"
```

---

### Task 6: Backend — User key fields and key management endpoints

**Files:**
- Modify: `backend/models/User.js`
- Create: `backend/controllers/e2eController.js`
- Create: `backend/routes/e2eRoutes.js`
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `protect` middleware from `backend/middleware/authMiddleware.js` (existing).
- Produces: `POST /api/e2e/keys`, `GET /api/e2e/prekey-bundle/:userId` — used by `e2eAPI` in Task 11.

- [ ] **Step 1: Add the `e2e` field to the User schema**

Edit `backend/models/User.js`, add after the `highlights` field (before the closing `}, {` of the schema definition, i.e. right before line 232's `}, {`... insert as the last schema field):
```js
  // End-to-end encryption (Phase 1: direct-message text only)
  e2e: {
    identityKey: String, // base64 public X25519 key, set once per device that has ever logged in
    oneTimePreKeys: [{
      keyId: Number,
      publicKey: String, // base64
      used: { type: Boolean, default: false }
    }]
  }
```

- [ ] **Step 2: Create the controller**

Create `backend/controllers/e2eController.js`:
```js
import User from '../models/User.js';

// @desc    Publish this device's identity key and a batch of one-time prekeys
// @route   POST /api/e2e/keys
export const publishKeys = async (req, res) => {
  try {
    const { identityKey, oneTimePreKeys } = req.body;
    if (!identityKey || typeof identityKey !== 'string') {
      return res.status(400).json({ success: false, message: 'identityKey is required' });
    }
    if (!Array.isArray(oneTimePreKeys)) {
      return res.status(400).json({ success: false, message: 'oneTimePreKeys must be an array' });
    }

    const user = await User.findById(req.user._id);
    user.e2e = user.e2e || { identityKey: undefined, oneTimePreKeys: [] };
    user.e2e.identityKey = identityKey;
    user.e2e.oneTimePreKeys.push(
      ...oneTimePreKeys.map(k => ({ keyId: k.keyId, publicKey: k.publicKey, used: false }))
    );
    await user.save();

    res.json({ success: true, message: 'Keys published' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Fetch a prekey bundle to start a session with a user
// @route   GET /api/e2e/prekey-bundle/:userId
export const getPreKeyBundle = async (req, res) => {
  try {
    const target = await User.findById(req.params.userId).select('e2e');
    if (!target || !target.e2e?.identityKey) {
      return res.status(404).json({ success: false, message: 'User has not published encryption keys yet' });
    }

    const claimed = await User.findOneAndUpdate(
      { _id: req.params.userId, 'e2e.oneTimePreKeys.used': false },
      { $set: { 'e2e.oneTimePreKeys.$.used': true } },
      { new: false }
    ).select('e2e');

    let oneTimePreKey = null;
    if (claimed) {
      const unused = claimed.e2e.oneTimePreKeys.find(k => !k.used);
      if (unused) oneTimePreKey = { keyId: unused.keyId, publicKey: unused.publicKey };
    }

    res.json({
      success: true,
      identityKey: target.e2e.identityKey,
      oneTimePreKey
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 3: Create the routes**

Create `backend/routes/e2eRoutes.js`:
```js
import express from 'express';
import * as e2e from '../controllers/e2eController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.post('/keys', protect, e2e.publishKeys);
router.get('/prekey-bundle/:userId', protect, e2e.getPreKeyBundle);

export default router;
```

- [ ] **Step 4: Mount the routes**

Edit `backend/server.js`, add the import alongside the other route imports (after line 21's `import messageRoutes from './routes/messageRoutes.js';`):
```js
import e2eRoutes from './routes/e2eRoutes.js';
```
Add the mount alongside the other `app.use('/api/...)` calls (after line 88's `app.use('/api/messages', messageRoutes);`):
```js
app.use('/api/e2e', e2eRoutes);
```

- [ ] **Step 5: Manual verification**

Start the backend (`cd backend && npm run dev`), then in a separate terminal, register/login a test user (reuse the pattern from the earlier Resend end-to-end test in this project) and exercise both endpoints:

```bash
curl -s -X POST http://localhost:5000/api/auth/register -H "Content-Type: application/json" \
  -d '{"fullName":"E2E Test","username":"e2etest_verify","email":"e2etest.verify@example.com","password":"TestPass123!"}'

TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" \
  -d '{"identifier":"e2etest_verify","password":"TestPass123!"}' | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).token")

USER_ID=$(curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" \
  -d '{"identifier":"e2etest_verify","password":"TestPass123!"}' | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).user._id")

curl -s -X POST http://localhost:5000/api/e2e/keys -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"identityKey":"dGVzdC1pZGVudGl0eS1rZXk=","oneTimePreKeys":[{"keyId":1,"publicKey":"dGVzdC1vcGstMQ=="},{"keyId":2,"publicKey":"dGVzdC1vcGstMg=="}]}'
# Expected: {"success":true,"message":"Keys published"}

curl -s http://localhost:5000/api/e2e/prekey-bundle/$USER_ID -H "Authorization: Bearer $TOKEN"
# Expected: {"success":true,"identityKey":"dGVzdC1pZGVudGl0eS1rZXk=","oneTimePreKey":{"keyId":1,"publicKey":"dGVzdC1vcGstMQ=="}}

curl -s http://localhost:5000/api/e2e/prekey-bundle/$USER_ID -H "Authorization: Bearer $TOKEN"
# Expected: oneTimePreKey now {"keyId":2,...} (first one consumed)

curl -s http://localhost:5000/api/e2e/prekey-bundle/$USER_ID -H "Authorization: Bearer $TOKEN"
# Expected: oneTimePreKey now null (both consumed) -- identityKey still returned
```

- [ ] **Step 6: Commit**

```bash
git add backend/models/User.js backend/controllers/e2eController.js backend/routes/e2eRoutes.js backend/server.js
git commit -m "Add E2E key publishing and prekey-bundle endpoints"
```

---

### Task 7: Backend — encrypted message fields and send/conversation logic

**Files:**
- Modify: `backend/models/Message.js`
- Modify: `backend/controllers/messageController.js`

**Interfaces:**
- Consumes: `Conversation.isEncrypted` (existing field, `backend/models/Message.js`).
- Produces: `Message.encrypted: boolean`, `Message.encryptedContent: {ciphertext, header}` — consumed by the frontend in Task 13.

- [ ] **Step 1: Add fields to the `Message` schema**

Edit `backend/models/Message.js`, add to `messageSchema` after the `content: String,` line:
```js
  encrypted: { type: Boolean, default: false },
  encryptedContent: {
    ciphertext: String,
    header: {
      dhPublicKey: String,
      previousChainLength: Number,
      messageNumber: Number,
      senderIdentityKey: String,
      senderEphemeralKey: String,
      oneTimePreKeyId: Number
    }
  },
```

- [ ] **Step 2: Update `getOrCreateConversation` to lazily mark conversations encrypted**

Edit `backend/controllers/messageController.js`, in `getOrCreateConversation` (around line 8-37), replace the final block before `res.json(...)`:
```js
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user._id, participantId],
        type: 'direct'
      });
      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'username fullName avatar isVerified isOnline lastSeen');
    }

    if (!conversation.isEncrypted && conversation.type === 'direct') {
      const bothHaveKeys = conversation.participants.every(p => p.e2e?.identityKey);
      if (bothHaveKeys) {
        conversation.isEncrypted = true;
        await conversation.save();
      }
    }

    res.json({ success: true, conversation });
```
This requires `participants` to be populated with `e2e.identityKey` — extend both `.populate('participants', ...)` calls in this function (the one in the `Conversation.findOne` chain near the top, and the one right after `Conversation.create`) to include it:
```js
.populate('participants', 'username fullName avatar isVerified isOnline lastSeen e2e.identityKey')
```

- [ ] **Step 3: Update `sendMessage` to accept encrypted content**

Edit `backend/controllers/messageController.js`, in `sendMessage` (around line 114-167), change the destructure and the `Message.create` call:
```js
export const sendMessage = async (req, res) => {
  try {
    const { content, type = 'text', replyTo, sharedPost, encrypted, encryptedContent } = req.body;
    const conversation = await Conversation.findById(req.params.conversationId);

    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    let mediaData = {};
    if (req.file) {
      const isVideo = req.file.mimetype.startsWith('video/');
      const result = await uploadToCloudinary(file.path, 'nexvibe/messages', {
        resource_type: isVideo ? 'video' : 'image'
      });
      mediaData = {
        url: result.secure_url,
        publicId: result.public_id,
        thumbnail: result.thumbnail_url || result.secure_url,
        name: req.file.originalname,
        size: req.file.size
      };
      fs.unlinkSync(req.file.path);
    }

    const isEncrypted = encrypted === true || encrypted === 'true';
    const message = await Message.create({
      conversation: req.params.conversationId,
      sender: req.user._id,
      type,
      content: isEncrypted ? undefined : content,
      encrypted: isEncrypted,
      encryptedContent: isEncrypted ? JSON.parse(encryptedContent) : undefined,
      media: Object.keys(mediaData).length ? mediaData : undefined,
      replyTo,
      sharedPost
    });
```
(Rest of the function — `conversation.lastMessage`/`lastMessageAt` update, populate, socket emit, response — is unchanged.)

Note: `encryptedContent` arrives as a JSON string because `sendMessage` is a `multipart/form-data` endpoint (it accepts an optional file upload via `upload.single('media')`), and form fields are always strings — `JSON.parse` reconstructs the `{ciphertext, header}` object. The frontend side of this contract is built in Task 12.

There's a pre-existing bug unrelated to encryption on the line `uploadToCloudinary(file.path, ...)` in the current code (it references `file` instead of `req.file` — since `req.file` is destructured but a leftover reference to a for-loop variable named `file` from `postController.js`'s pattern doesn't exist here) — **do not** copy that; double-check against the actual current file content before editing, since the real line already correctly reads `req.file.path` (confirm via `Read` before editing — this note exists only to make sure the edit doesn't accidentally introduce a `file`/`req.file` mismatch).

- [ ] **Step 4: Manual verification**

With the backend running, reuse the two-test-user pattern from Task 6 (or the earlier chat functional test) to confirm:
```bash
# Using ALICE_TOKEN/BOB_TOKEN/BOB_ID from a login flow like Task 6's, and a conversationId from getOrCreateConversation:
curl -s -X POST http://localhost:5000/api/messages/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -F "type=text" \
  -F "encrypted=true" \
  -F 'encryptedContent={"ciphertext":"dGVzdC1jaXBoZXJ0ZXh0","header":{"dhPublicKey":"dGVzdC1kaA==","previousChainLength":0,"messageNumber":0}}'
```
Expected: `201` response with `message.encrypted: true`, `message.encryptedContent.ciphertext: "dGVzdC1jaXBoZXJ0ZXh0"`, and `message.content` absent/empty. Then:
```bash
curl -s http://localhost:5000/api/messages/conversations/$CONV_ID/messages -H "Authorization: Bearer $BOB_TOKEN"
```
Expected: the same encrypted message comes back with `encrypted: true` and the same `encryptedContent`.

- [ ] **Step 5: Commit**

```bash
git add backend/models/Message.js backend/controllers/messageController.js
git commit -m "Support encrypted message content in send/fetch and lazily mark direct conversations encrypted"
```

---

### Task 8: Backend — message reporting

**Files:**
- Modify: `backend/models/Report.js`
- Modify: `backend/controllers/reportController.js`

**Interfaces:**
- Consumes: `Message`, `Conversation` from `backend/models/Message.js`.
- Produces: `POST /api/reports` now also accepts `targetType: 'message'` — consumed by `ReportModal.jsx` in Task 14.

- [ ] **Step 1: Extend the `Report` schema**

Edit `backend/models/Report.js`, change the `targetType` enum and add `evidenceContent`:
```js
targetType: { type: String, enum: ['post', 'user', 'message'], required: true },
```
Add a new field alongside the existing `note`:
```js
evidenceContent: { type: String, maxlength: 2000 }, // only used when targetType === 'message'; the reporting client's own already-decrypted copy
```

- [ ] **Step 2: Extend `createReport`**

Edit `backend/controllers/reportController.js`. Add imports at the top:
```js
import { Message, Conversation } from '../models/Message.js';
```
Change the `targetType` validation and add a `message` branch (mirroring the existing `post`/`user` branches):
```js
    const { targetType, targetId, reason, note, evidenceContent } = req.body;

    if (!['post', 'user', 'message'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid targetType' });
    }
    if (!REASONS.includes(reason)) {
      return res.status(400).json({ success: false, message: 'Invalid reason' });
    }

    if (targetType === 'user') {
      if (targetId === req.user._id.toString()) {
        return res.status(400).json({ success: false, message: "You can't report yourself" });
      }
      const target = await User.findById(targetId);
      if (!target) return res.status(404).json({ success: false, message: 'User not found' });
    } else if (targetType === 'post') {
      const target = await Post.findById(targetId);
      if (!target || target.isDeleted) return res.status(404).json({ success: false, message: 'Post not found' });
      if (target.author.toString() === req.user._id.toString()) {
        return res.status(400).json({ success: false, message: "You can't report your own post" });
      }
    } else {
      const target = await Message.findById(targetId);
      if (!target) return res.status(404).json({ success: false, message: 'Message not found' });
      const conversation = await Conversation.findById(target.conversation);
      if (!conversation?.participants.some(p => p.toString() === req.user._id.toString())) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
      if (target.sender.toString() === req.user._id.toString()) {
        return res.status(400).json({ success: false, message: "You can't report your own message" });
      }
      if (!evidenceContent?.trim()) {
        return res.status(400).json({ success: false, message: 'evidenceContent is required for message reports' });
      }
    }

    const existing = await Report.findOne({ reporter: req.user._id, targetType, targetId, status: 'pending' });
    if (existing) {
      return res.status(400).json({ success: false, message: "You've already reported this" });
    }

    await Report.create({ reporter: req.user._id, targetType, targetId, reason, note, evidenceContent });
    res.status(201).json({ success: true, message: 'Report submitted' });
```

- [ ] **Step 3: Manual verification**

```bash
# Bob reports a message Alice sent (MESSAGE_ID from Task 7's verification):
curl -s -X POST http://localhost:5000/api/reports -H "Content-Type: application/json" -H "Authorization: Bearer $BOB_TOKEN" \
  -d '{"targetType":"message","targetId":"'$MESSAGE_ID'","reason":"harassment","evidenceContent":"this is what the message said"}'
# Expected: 201 {"success":true,"message":"Report submitted"}

# Reporting the same message again should be rejected:
curl -s -X POST http://localhost:5000/api/reports -H "Content-Type: application/json" -H "Authorization: Bearer $BOB_TOKEN" \
  -d '{"targetType":"message","targetId":"'$MESSAGE_ID'","reason":"spam","evidenceContent":"x"}'
# Expected: 400 "You've already reported this"

# Missing evidenceContent should be rejected:
curl -s -X POST http://localhost:5000/api/reports -H "Content-Type: application/json" -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"targetType":"message","targetId":"'$MESSAGE_ID'","reason":"spam"}'
# Expected: 400 "evidenceContent is required for message reports"
```

- [ ] **Step 4: Commit**

```bash
git add backend/models/Report.js backend/controllers/reportController.js
git commit -m "Support reporting messages with reporter-submitted evidence content"
```

---

### Task 9: Backend — in-app new-message notifications

**Files:**
- Modify: `backend/controllers/messageController.js`

**Interfaces:**
- Consumes: `Notification` model (existing, `type: 'message'` already in its enum).
- Produces: one `Notification` document per message recipient, created inside `sendMessage`.

- [ ] **Step 1: Add the import and creation call**

Edit `backend/controllers/messageController.js`, add the import alongside the existing ones at the top:
```js
import Notification from '../models/Notification.js';
```
In `sendMessage`, after the socket-emit block and before `res.status(201).json(...)`:
```js
    const recipients = conversation.participants.filter(
      p => p.toString() !== req.user._id.toString()
    );
    for (const recipientId of recipients) {
      const recipientUser = await User.findById(recipientId).select('settings.notifications.messages');
      if (recipientUser?.settings?.notifications?.messages === false) continue;
      await Notification.create({
        recipient: recipientId,
        sender: req.user._id,
        type: 'message',
        text: `${req.user.fullName} sent you a message`
      });
    }
```
This requires `User` to be imported in this file — it already is (`import User from '../models/User.js';`, confirmed at the top of `messageController.js`).

- [ ] **Step 2: Manual verification**

```bash
# Alice sends Bob a plaintext message:
curl -s -X POST http://localhost:5000/api/messages/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $ALICE_TOKEN" -F "type=text" -F "content=hey bob"

# As Bob, fetch notifications (existing endpoint; confirm exact path via backend/routes/notificationRoutes.js if it differs):
curl -s http://localhost:5000/api/notifications -H "Authorization: Bearer $BOB_TOKEN"
```
Expected: the response includes a notification with `type: "message"`, `text: "Chat Test A2 sent you a message"` (or whatever `fullName` Alice's test account used), and no message content anywhere in it.

- [ ] **Step 3: Commit**

```bash
git add backend/controllers/messageController.js
git commit -m "Create in-app notification on new message (sender name only, no content)"
```

---

### Task 10: Backend — generic new-message email

**Files:**
- Modify: `backend/utils/email.js`
- Modify: `backend/controllers/messageController.js`

**Interfaces:**
- Consumes: `sendEmail`, `baseEmailTemplate`, `APP_NAME` (existing, module-internal to `email.js`); `getSocketId` from `backend/config/socket.js`.
- Produces: `sendNewMessageEmail(user, senderName): Promise<boolean>` — exported from `email.js`.

- [ ] **Step 1: Add the email template**

Edit `backend/utils/email.js`, add a new exported function following the exact shape of the existing `sendNewLoginEmail` (place it near the other message-related templates, after `sendOTPEmail`):
```js
export const sendNewMessageEmail = async (user, senderName) => {
  await sendEmail({
    to: user.email,
    subject: `${senderName} sent you a message on ${APP_NAME}`,
    html: baseEmailTemplate(`
      <h2 class="title">New Message 💬</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text"><strong>${senderName}</strong> sent you a message on ${APP_NAME}.</p>
      <div style="text-align:center">
        <a href="${process.env.FRONTEND_URL}/messages" class="button">Open Messages</a>
      </div>
    `)
  });
};
```

- [ ] **Step 2: Wire up the trigger in `sendMessage`**

Edit `backend/controllers/messageController.js`. Add imports:
```js
import { sendNewMessageEmail } from '../utils/email.js';
import { getSocketId } from '../config/socket.js';
```
Extend the recipient loop added in Task 9 to also decide on email — replace that loop with:
```js
    const recipients = conversation.participants.filter(
      p => p.toString() !== req.user._id.toString()
    );
    for (const recipientId of recipients) {
      const recipientUser = await User.findById(recipientId).select('email fullName settings.notifications.messages');
      if (recipientUser?.settings?.notifications?.messages === false) continue;

      await Notification.create({
        recipient: recipientId,
        sender: req.user._id,
        type: 'message',
        text: `${req.user.fullName} sent you a message`
      });

      const isOnline = !!getSocketId(recipientId.toString());
      if (!isOnline) {
        const priorUnread = await Message.countDocuments({
          conversation: conversation._id,
          sender: { $ne: recipientId },
          'readBy.user': { $ne: recipientId },
          isDeleted: false,
          _id: { $ne: message._id }
        });
        if (priorUnread === 0) {
          await sendNewMessageEmail(recipientUser, req.user.fullName);
        }
      }
    }
```
(`isOnline` uses "has any active socket connection" as a proxy for "will see this in real time" — this repo's `config/socket.js` tracks online users globally, not per-conversation room membership, and adding per-room tracking is more infrastructure than this notification decision needs: a user connected anywhere already gets the in-app `Notification` from the block above, which is enough to avoid a redundant email.)

- [ ] **Step 3: Manual verification (live Resend send, matching the earlier Resend setup verification style)**

```bash
# Log Bob out of any socket connection (don't open the app / don't run the earlier socket test), then:
curl -s -X POST http://localhost:5000/api/messages/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $ALICE_TOKEN" -F "type=text" -F "content=are you there"
```
Expected: check the backend log/console for the Resend call succeeding (no `Email send error` logged), and confirm delivery by checking the recipient email inbox used for the Bob test account (or temporarily point Bob's test account email to a real inbox you control, mirroring how the Resend setup task's live test used `graphicsanimation786@gmail.com`).
```bash
# Send a second message before Bob reads the first:
curl -s -X POST http://localhost:5000/api/messages/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $ALICE_TOKEN" -F "type=text" -F "content=still there"
```
Expected: no second email (verify via Resend dashboard or backend logs — only one `sendNewMessageEmail` call across both sends).

- [ ] **Step 4: Commit**

```bash
git add backend/utils/email.js backend/controllers/messageController.js
git commit -m "Send generic new-message email to offline recipients (no content, first-unread only)"
```

---

### Task 11: Frontend — e2eAPI and key onboarding

**Files:**
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/context/AuthContext.jsx`

**Interfaces:**
- Consumes: `generateIdentity`, `generateOneTimePreKeys`, `sodiumReady` from `e2eCrypto.js` (Task 2); `getLocalIdentity`, `saveLocalIdentity`, `getUnusedOneTimePreKeys`, `saveOneTimePreKeys` from `e2eStorage.js` (Task 5).
- Produces: `e2eAPI.publishKeys`, `e2eAPI.getPreKeyBundle` — consumed by Task 12/13's `MessagesPage.jsx` changes.

- [ ] **Step 1: Add `e2eAPI`**

Edit `frontend/src/services/api.js`, add near `reportAPI` (after its closing `};` around line 157):
```js
export const e2eAPI = {
  publishKeys: (data) => API.post('/e2e/keys', data), // { identityKey, oneTimePreKeys }
  getPreKeyBundle: (userId) => API.get(`/e2e/prekey-bundle/${userId}`),
};
```

- [ ] **Step 2: Add key onboarding to `AuthContext`**

Edit `frontend/src/context/AuthContext.jsx` (confirmed current content: a `fetchMe` callback that runs on mount when a token exists, plus `login` and `oauthLogin` functions that each call `setUser(data.user)` directly after a successful auth call — all three are session-establishment points and each needs the onboarding call).

Add imports at the top, after the existing `import toast from 'react-hot-toast';`:
```js
import { sodiumReady, generateIdentity, generateOneTimePreKeys } from '../lib/e2eCrypto';
import { getLocalIdentity, saveLocalIdentity, getUnusedOneTimePreKeys, saveOneTimePreKeys } from '../lib/e2eStorage';
import { e2eAPI } from '../services/api';
```
Add the helper function above `AuthProvider` (module-level, after the imports and `const AuthContext = createContext(null);` line):
```js
async function ensureE2EKeys() {
  await sodiumReady();
  let identity = await getLocalIdentity();
  if (!identity) {
    identity = generateIdentity();
    await saveLocalIdentity(identity);
    const preKeys = generateOneTimePreKeys(20, 1);
    await saveOneTimePreKeys(preKeys);
    await e2eAPI.publishKeys({
      identityKey: identity.publicKey,
      oneTimePreKeys: preKeys.map(({ keyId, publicKey }) => ({ keyId, publicKey }))
    });
    return;
  }

  const unused = await getUnusedOneTimePreKeys();
  if (unused.length < 5) {
    const maxKeyId = unused.reduce((max, k) => Math.max(max, k.keyId), 0);
    const morePreKeys = generateOneTimePreKeys(20, maxKeyId + 1);
    await saveOneTimePreKeys(morePreKeys);
    await e2eAPI.publishKeys({
      identityKey: identity.publicKey,
      oneTimePreKeys: morePreKeys.map(({ keyId, publicKey }) => ({ keyId, publicKey }))
    });
  }
}
```
Call it (fire-and-forget — a key-setup failure shouldn't block login; the chat falls back to plaintext per the spec's error handling section until keys are successfully published) at each of the three session-establishment points:

In `fetchMe`, after `setUser(data.user);` (inside the `try` block, before the `catch`):
```js
      setUser(data.user);
      ensureE2EKeys().catch(err => console.error('E2E key setup failed:', err));
```

In `login`, after `setUser(data.user);` (inside the `if (data.token)` block):
```js
      setUser(data.user);
      ensureE2EKeys().catch(err => console.error('E2E key setup failed:', err));
```

In `oauthLogin`, after its own `setUser(data.user);` (same pattern, inside its `if (data.token)` block):
```js
      setUser(data.user);
      ensureE2EKeys().catch(err => console.error('E2E key setup failed:', err));
```

- [ ] **Step 3: Manual verification**

Run `cd frontend && npm run dev` and `cd backend && npm run dev`, log in as a test user in the browser, then in devtools:
- **Application → IndexedDB → `nexvibe-e2e`**: confirm the `identity` store has one row with `publicKey`/`privateKey`, and `oneTimePreKeys` has 20 rows.
- **Network tab**: confirm a `POST /api/e2e/keys` request fired once with a 200 response.
- Reload the page: confirm `POST /api/e2e/keys` does **not** fire again (identity already exists locally, prekey count still ≥ 5).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/api.js frontend/src/context/AuthContext.jsx
git commit -m "Generate and publish E2E identity/prekeys on login"
```

---

### Task 12: Frontend — encrypt on send

**Files:**
- Modify: `frontend/src/pages/main/MessagesPage.jsx`
- Create: `frontend/src/lib/e2eSession.js`

**Interfaces:**
- Consumes: `initSessionAsSender`, `ratchetEncrypt` from `e2eCrypto.js`; `getSession`, `saveSession`, `getLocalIdentity` from `e2eStorage.js`; `e2eAPI.getPreKeyBundle` from Task 11.
- Produces: `getOrCreateSenderSession(conversationId, recipientUserId): Promise<{session, handshakeHeader} | {session, handshakeHeader: null}>` — a thin orchestration helper, kept out of `MessagesPage.jsx` itself to keep that file focused on rendering (matches the "files that change together live together, split by responsibility" guidance — the crypto/session orchestration is a distinct responsibility from chat UI state).

- [ ] **Step 1: Write the session-orchestration helper**

Create `frontend/src/lib/e2eSession.js`:
```js
import { initSessionAsSender } from './e2eCrypto';
import { getSession, saveSession, getLocalIdentity } from './e2eStorage';
import { e2eAPI } from '../services/api';

// Returns the existing local session for this conversation if one exists,
// otherwise fetches the recipient's prekey bundle and starts a new one as
// the sender. `handshakeHeader` is non-null only when a session was just
// created here (the caller must merge it into the first ratchetEncrypt
// header) -- an existing/resumed session has already exchanged handshake
// info on an earlier message, so subsequent messages don't repeat it.
export async function getOrCreateSenderSession(conversationId, recipientUserId) {
  const existing = await getSession(conversationId);
  if (existing) return { session: existing, handshakeHeader: null };

  const identity = await getLocalIdentity();
  if (!identity) throw new Error('No local E2E identity yet');

  const { data } = await e2eAPI.getPreKeyBundle(recipientUserId);
  const bundle = { identityKey: data.identityKey, oneTimePreKey: data.oneTimePreKey };
  const { session, handshakeHeader } = initSessionAsSender(identity, bundle);
  await saveSession(conversationId, session);
  return { session, handshakeHeader };
}
```

- [ ] **Step 2: Wire encryption into `handleSend`**

Edit `frontend/src/pages/main/MessagesPage.jsx`. Add imports:
```js
import { ratchetEncrypt } from '../../lib/e2eCrypto';
import { getOrCreateSenderSession } from '../../lib/e2eSession';
import { saveSession } from '../../lib/e2eStorage';
```
Replace `handleSend` (currently lines 104-122):
```js
  const handleSend = async (e) => {
    e?.preventDefault();
    if (!text.trim() || !conversationId) return;
    const msgText = text;
    setText('');
    try {
      const fd = new FormData();
      fd.append('type', 'text');

      if (activeConv?.isEncrypted) {
        const other = getOtherParticipant(activeConv);
        const { session, handshakeHeader } = await getOrCreateSenderSession(conversationId, other._id);
        const { ciphertext, header, session: updatedSession } = ratchetEncrypt(session, msgText);
        await saveSession(conversationId, updatedSession);
        const fullHeader = handshakeHeader ? { ...header, ...handshakeHeader } : header;
        fd.append('encrypted', 'true');
        fd.append('encryptedContent', JSON.stringify({ ciphertext, header: fullHeader }));
      } else {
        fd.append('content', msgText);
      }

      const { data } = await messageAPI.sendMessage(conversationId, fd);
      setMessages(prev => [...prev, { ...data.message, content: msgText }]);
      setConversations(prev =>
        prev.map(c => c._id === conversationId
          ? { ...c, lastMessage: { ...data.message, content: msgText }, lastMessageAt: new Date().toISOString() }
          : c
        ).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      );
    } catch { toast.error('Failed to send'); setText(msgText); }
  };
```
(`{ ...data.message, content: msgText }` on the sender's own side: the server response for an encrypted message has an empty `content`, but the sender already has the plaintext they just typed — no need to decrypt your own outgoing message, just display what you sent. The `Message` render path at line 362 already reads `msg.content`, so this needs no template change on the sender's side.)

- [ ] **Step 3: Manual verification**

With both `frontend`/`backend` dev servers running and two browser profiles (or one normal + one incognito) logged in as two different test users who have both completed Task 11's key onboarding: open a direct conversation between them, send a message from one side. In a third terminal, query MongoDB directly (or add a temporary `console.log` in `sendMessage`) to confirm the stored `Message` document has `encrypted: true` and an `encryptedContent.ciphertext` that is **not** a readable/base64-decodable rendering of the typed text (i.e., it's actual ciphertext, not the plaintext just base64-encoded — spot-check by base64-decoding it and confirming the bytes are not the original message text).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/e2eSession.js frontend/src/pages/main/MessagesPage.jsx
git commit -m "Encrypt outgoing direct-message text before sending"
```

---

### Task 13: Frontend — decrypt on receive, lock banner, new-device disclosure

**Files:**
- Modify: `frontend/src/pages/main/MessagesPage.jsx`
- Modify: `frontend/src/lib/e2eSession.js`

**Interfaces:**
- Consumes: `ratchetDecrypt`, `initSessionAsReceiver`, `DecryptError` from `e2eCrypto.js`; `getSession`, `saveSession`, `getLocalIdentity`, `getUnusedOneTimePreKeys`, `consumeOneTimePreKey` from `e2eStorage.js`.
- Produces: `decryptIncomingMessage(conversationId, msg): Promise<{content: string} | {decryptError: true}>` — added to `e2eSession.js`, used by every place `MessagesPage.jsx` currently reads `msg.content` from server data (load, socket, conversation-list preview).

- [ ] **Step 1: Add the receiver-side session/decrypt helper**

Edit `frontend/src/lib/e2eSession.js`, add:
```js
import { initSessionAsReceiver, ratchetDecrypt, DecryptError } from './e2eCrypto';
import { getUnusedOneTimePreKeys, consumeOneTimePreKey } from './e2eStorage';

// Decrypts one message object as received from the API/socket. Returns
// { content } on success or { decryptError: true } on failure -- never
// throws, so callers can render a fallback instead of crashing the thread.
export async function decryptIncomingMessage(conversationId, msg) {
  if (!msg.encrypted) return { content: msg.content };
  try {
    let session = await getSession(conversationId);
    const header = msg.encryptedContent.header;

    if (!session && header.senderIdentityKey) {
      const identity = await getLocalIdentity();
      if (!identity) return { decryptError: true };
      const myPreKeys = await getUnusedOneTimePreKeys();
      session = initSessionAsReceiver(identity, myPreKeys, header);
      if (header.oneTimePreKeyId != null) {
        await consumeOneTimePreKey(header.oneTimePreKeyId);
      }
    }
    if (!session) return { decryptError: true };

    const { plaintext, session: updatedSession } = ratchetDecrypt(session, msg.encryptedContent.ciphertext, header);
    await saveSession(conversationId, updatedSession);
    return { content: plaintext };
  } catch (err) {
    if (err instanceof DecryptError) return { decryptError: true };
    return { decryptError: true };
  }
}
```

- [ ] **Step 2: Decrypt on `loadMessages`**

Edit `frontend/src/pages/main/MessagesPage.jsx`. Add import:
```js
import { decryptIncomingMessage } from '../../lib/e2eSession';
```
Replace `loadMessages` (currently lines 64-70):
```js
  const loadMessages = async (id) => {
    setMsgLoading(true);
    try {
      const { data } = await messageAPI.getMessages(id);
      const decrypted = await Promise.all(
        (data.messages || []).map(async msg => {
          const isMine = (msg.sender?._id || msg.sender) === user?._id;
          if (isMine || !msg.encrypted) return msg;
          const result = await decryptIncomingMessage(id, msg);
          return result.decryptError
            ? { ...msg, decryptError: true }
            : { ...msg, content: result.content };
        })
      );
      setMessages(decrypted);
    } catch {} finally { setMsgLoading(false); }
  };
```
(Own outgoing messages come back from `GET .../messages` with empty `content` too, same as the send response in Task 12 — but the sender-side list already has the correct local copy appended by `handleSend`; a page reload re-fetching history for `isMine` encrypted messages the sender didn't just send in this session is a known gap: the sender's own past encrypted messages can't be re-displayed without decrypting them too. Fix this by not special-casing `isMine` — decrypt every encrypted message uniformly, sender or not, since `ratchetDecrypt` only works for messages *received* from someone else's ratchet, not a device's own outgoing ones. Correct version, replacing the `isMine` short-circuit above:)
```js
  const loadMessages = async (id) => {
    setMsgLoading(true);
    try {
      const { data } = await messageAPI.getMessages(id);
      const decrypted = await Promise.all(
        (data.messages || []).map(async msg => {
          if (!msg.encrypted) return msg;
          const isMine = (msg.sender?._id || msg.sender) === user?._id;
          if (isMine) return { ...msg, content: '', decryptError: true, isOwnEncrypted: true };
          const result = await decryptIncomingMessage(id, msg);
          return result.decryptError
            ? { ...msg, decryptError: true }
            : { ...msg, content: result.content };
        })
      );
      setMessages(decrypted);
    } catch {} finally { setMsgLoading(false); }
  };
```
This is a real, disclosed Phase 1 gap consistent with the spec's single-device/no-history-of-own-sends-across-reloads limitation (own sent ciphertext isn't decryptable by the sender's own ratchet state after it has advanced past that point) — the render step below shows a distinct "You sent an encrypted message" placeholder for `isOwnEncrypted` rather than the generic decrypt-error copy, so it doesn't read as broken.

- [ ] **Step 3: Decrypt on socket receive**

Edit the socket-events `useEffect` (currently lines 73-89):
```js
  useEffect(() => {
    if (!on) return;
    const u1 = on('message:receive', async msg => {
      const isMine = (msg.sender?._id || msg.sender) === user?._id;
      let displayMsg = msg;
      if (msg.encrypted && !isMine) {
        const result = await decryptIncomingMessage(msg.conversation, msg);
        displayMsg = result.decryptError ? { ...msg, decryptError: true } : { ...msg, content: result.content };
      }
      if (msg.conversation === conversationId && !isMine) {
        setMessages(prev => [...prev, displayMsg]);
      }
      setConversations(prev =>
        prev.map(c => c._id === msg.conversation
          ? { ...c, lastMessage: displayMsg, lastMessageAt: msg.createdAt }
          : c
        ).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      );
    });
    const u2 = on('typing:start', ({ userId: uid }) => { if (uid !== user?._id) setIsTyping(true); });
    const u3 = on('typing:stop', ({ userId: uid }) => { if (uid !== user?._id) setIsTyping(false); });
    return () => { u1?.(); u2?.(); u3?.(); };
  }, [on, conversationId, user?._id]);
```
(`!isMine` guards `setMessages` here because `handleSend` in Task 12 already appended the sender's own message with its plaintext locally — without this guard, the sender would see their own message appended twice, once from `handleSend` and once from the server's socket echo. This mirrors the existing code's implicit assumption before this change, just made explicit now that the message needs conditional decryption.)

- [ ] **Step 4: Render decrypt failures and encrypted-conversation UI**

Edit the message-bubble render block (currently around lines 348-364), change the text-message branch:
```js
                      ) : msg.isOwnEncrypted ? (
                        <div className="px-4 py-2.5 rounded-2xl text-sm italic text-[var(--text-muted)] border border-[var(--border)]">
                          You sent an encrypted message
                        </div>
                      ) : msg.decryptError ? (
                        <div className="px-4 py-2.5 rounded-2xl text-sm italic text-[var(--text-muted)] border border-[var(--border)]">
                          🔒 Couldn't decrypt this message
                        </div>
                      ) : (
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words
                          ${isMine
                            ? 'bg-blue-500 text-white rounded-br-md'
                            : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md'}`}>
                          {msg.content}
                        </div>
                      )}
```
(This new branch goes between the existing `msg.isUnsent` branch and the `msg.type === 'image'` branch, i.e. right after the `msg.isUnsent` ternary arm.)

Add a lock banner to the chat header. In the chat-header block (around line 274, inside the `activeConv && (() => {...})()` IIFE), add after the closing `</Link>` and before the action-buttons `<div>`:
```jsx
                {activeConv.isEncrypted ? (
                  <div className="hidden md:flex items-center gap-1.5 text-xs text-[var(--text-muted)] px-2">
                    <span>🔒</span><span>End-to-end encrypted</span>
                  </div>
                ) : activeConv.type === 'direct' && (
                  <div className="hidden md:flex items-center gap-1.5 text-xs text-[var(--text-muted)] px-2">
                    <span>Encryption starts once the other person opens NexVibe</span>
                  </div>
                )}
```

Add a one-time new-device disclosure banner. Near the other derived values in the component body (e.g. right after the `getOtherParticipant`/`formatMsgTime` helper definitions, before the `return`), add:
```js
  const allEncryptedUnreadable = (() => {
    const relevant = messages.filter(m => m.encrypted && !m.isOwnEncrypted);
    return relevant.length > 0 && relevant.every(m => m.decryptError);
  })();
```
Render it inside the messages scroll container, immediately before the `messages.map((msg, i) => {...})` block (i.e. as a sibling that appears once above the list, only in the non-empty/non-loading branch):
```jsx
            ) : (
              <>
                {allEncryptedUnreadable && (
                  <div className="text-center text-xs text-[var(--text-muted)] py-2 px-4">
                    You're on a new device — older encrypted messages from before today can't be shown here.
                  </div>
                )}
                {messages.map((msg, i) => {
```
(This changes the existing `messages.map(...)` call's containing JSX fragment from a bare expression to a `<>...</>` fragment wrapping both the notice and the map — close the added `</>` at the very end of that ternary branch, right after the existing `messages.map(...)` closing `))}`.)

For the conversation-list preview (line 251, `lastMsg?.content || 'Start a conversation'`), since `conv.lastMessage` from `getConversations` is decrypted opportunistically by the socket handler above but not on initial load (the initial `GET /messages/conversations` response has raw `encryptedContent`, not plaintext, for any conversation whose last message wasn't just decrypted client-side this session), change line 251 to:
```jsx
                        {lastMsg?.isUnsent ? 'Message unsent'
                          : lastMsg?.type === 'image' ? '📷 Photo'
                          : lastMsg?.type === 'video' ? '🎥 Video'
                          : lastMsg?.encrypted ? '🔒 Encrypted message'
                          : lastMsg?.content || 'Start a conversation'}
```
This is a deliberate, simple choice over decrypting every conversation's last message just to render a list preview (which would mean running the receiver handshake for every thread on every app load, including ones the user hasn't opened yet) — the spec's Frontend section anticipated a generic placeholder as an acceptable fallback here.

- [ ] **Step 5: Manual verification**

Using the same two-profile setup as Task 12: send a message from Alice to Bob, confirm Bob's open chat window shows the real plaintext (decrypted client-side, confirmed by comparing against what Alice typed) and Bob's conversation list preview shows "🔒 Encrypted message" for that thread until Bob opens it (then compare with Alice's list, which should show "🔒 Encrypted message" too, since Alice's own client doesn't re-decrypt its own sends for the list either, per Step 4's design). Reload Bob's page and re-open the conversation — Bob's own device should still show Alice's earlier messages correctly (session persisted in IndexedDB), while messages *Bob* sent before the reload show "You sent an encrypted message" per Step 2's disclosed gap.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/e2eSession.js frontend/src/pages/main/MessagesPage.jsx
git commit -m "Decrypt incoming direct messages client-side; add lock banner and decrypt-failure fallback"
```

---

### Task 14: Frontend — report a message

**Files:**
- Modify: `frontend/src/components/common/ReportModal.jsx`
- Modify: `frontend/src/pages/main/MessagesPage.jsx`

**Interfaces:**
- Consumes: `reportAPI.createReport` (existing).
- Produces: nothing new consumed elsewhere — this is a leaf UI feature.

- [ ] **Step 1: Extend `ReportModal` to accept message reports**

Confirmed current content of `frontend/src/components/common/ReportModal.jsx`: `export default function ReportModal({ targetType, targetId, label, onClose })`, with a `handleSubmit` that calls:
```js
await reportAPI.createReport({ targetType, targetId, reason, note: reason === 'other' ? note : undefined });
```
Change the function signature (line 15) to add the new prop:
```js
export default function ReportModal({ targetType, targetId, label, onClose, evidenceContent }) {
```
Change the `handleSubmit` call (line 24) to include it:
```js
      await reportAPI.createReport({
        targetType, targetId, reason,
        note: reason === 'other' ? note : undefined,
        ...(evidenceContent ? { evidenceContent } : {})
      });
```

- [ ] **Step 2: Add a per-message report action**

Edit `frontend/src/pages/main/MessagesPage.jsx`. Add state near the other `useState` calls:
```js
  const [reportingMessage, setReportingMessage] = useState(null); // null | Message
```
Import the modal:
```js
import ReportModal from '../../components/common/ReportModal';
```
In the message-bubble block, add a small hover-reveal report affordance next to non-own, non-unsent messages. Wrap the existing per-message `<div className="max-w-[65%] ...">` block (the one containing the bubble, reactions, and timestamp) in a `group relative` wrapper so a report button can appear on hover without changing layout for the common case:

Change the outer message row `<div>` (the one with `className={\`flex gap-2 items-end ...\`}`) to add `group` to its class list:
```jsx
                  <div key={msg._id} className={`group flex gap-2 items-end ${isMine ? 'flex-row-reverse' : 'flex-row'} animate-fade-in`}>
```
Then, immediately after the closing `</div>` of the `max-w-[65%]` block and before the row's closing `</div>`, add (only rendered for messages from the other person, matching the existing self-report guards enforced server-side in Task 8):
```jsx
                    {!isMine && !msg.isUnsent && (
                      <button
                        onClick={() => setReportingMessage(msg)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-[var(--text-muted)] hover:text-red-500 flex-shrink-0 self-center"
                        title="Report message"
                      >
                        <FiMoreHorizontal className="w-4 h-4" />
                      </button>
                    )}
```
At the bottom of the component's JSX, alongside the existing `{newConvoModal && (...)}` block, add:
```jsx
      {reportingMessage && (
        <ReportModal
          targetType="message"
          targetId={reportingMessage._id}
          label="Report this message"
          evidenceContent={reportingMessage.content}
          onClose={() => setReportingMessage(null)}
        />
      )}
```

- [ ] **Step 3: Manual verification**

In the browser (Bob's profile), hover a message from Alice, click the report affordance, submit with a reason → confirm the success toast (matching `ReportModal`'s existing toast copy) and, via the Task 8 verification approach or a direct DB check, confirm a `Report` document was created with `targetType: 'message'` and `evidenceContent` equal to the plaintext Bob saw on screen.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/ReportModal.jsx frontend/src/pages/main/MessagesPage.jsx
git commit -m "Add per-message report action, submitting reporter's decrypted evidence"
```

---

### Task 15: Frontend — admin message-report rendering

**Files:**
- Modify: `backend/controllers/adminController.js`
- Modify: `frontend/src/pages/admin/AdminReports.jsx`

**Interfaces:**
- Consumes: `GET /api/admin/reports` response shape (existing endpoint, `getReports` in `adminController.js`) — extended in Step 1 to include `evidenceContent` and a populated `target` for `message`-type groups.

- [ ] **Step 1: Extend `getReports` to surface message-report evidence**

Confirmed current pipeline in `backend/controllers/adminController.js` (`getReports`, starting line 213): the `$group` stage explicitly lists accumulators (`reasons`, `reporterIds`, `notes`, etc. — it does not pass through arbitrary `Report` fields), and the per-group `Promise.all` branches on `gType === 'post'` vs. an `else` that always does a `User.findById` (i.e. it currently assumes every non-post report is a `user` report). Both need a `message` branch.

Add an accumulator to the `$group` stage (alongside the existing `notes: { $push: '$note' },` around line 231):
```js
          evidenceContents: { $push: '$evidenceContent' },
```
Add `Message` to the imports at the top — already present (`import { Message } from '../models/Message.js';`, line 3), no change needed there.

Change the target-resolution branch (lines 254-259):
```js
      if (gType === 'post') {
        target = await Post.findById(targetId).populate('author', 'username fullName avatar');
        if (target?.isDeleted) target = null;
      } else if (gType === 'user') {
        target = await User.findById(targetId).select('username fullName avatar isBanned');
      } else {
        target = await Message.findById(targetId).populate('sender', 'username fullName avatar');
      }
```

Add `evidenceContent` to the returned per-group object (in the `return { ... }` block around lines 267-281), alongside the existing `notes` line:
```js
        notes,
        evidenceContent: (g.evidenceContents || []).find(Boolean) || null,
```
(`.find(Boolean)` rather than `$first` in the aggregation itself, matching how `notes` is already collected as a pushed array and filtered client-side in this same function — a `message` group has exactly one report per `targetId` in practice since a given message can only be reported once per reporter and this UI shows one card per distinct message, so the array will contain at most one non-null value.)

- [ ] **Step 2: Fix `resolveReport` to accept `'message'` (Dismiss-only)**

Confirmed current code (`resolveReport`, line 293) rejects any `targetType` outside `['post', 'user']` — as written, this would 400 on every attempt to dismiss a message report, since the frontend's Step 3 below is about to add a Dismiss button that calls this same endpoint with `targetType: 'message'`. Fix the validation (line 296) and add a guard against the not-supported "remove" action for messages:
```js
    const { targetType, targetId, action } = req.body;
    if (!['post', 'user', 'message'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid targetType' });
    }
    if (!['dismiss', 'remove'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
    if (targetType === 'message' && action === 'remove') {
      return res.status(400).json({ success: false, message: 'Messages can only be dismissed, not removed' });
    }
```
No further change is needed in this function beyond that: the existing `let resolution = 'dismissed';` default (line 303) already handles the message-dismiss case correctly since `action === 'remove'` is now unreachable for `targetType === 'message'`, and the existing `Report.updateMany({ targetType, targetId, status: 'pending' }, ...)` call (line 322) already works for any `targetType` value without modification.

- [ ] **Step 3: Add the message branch to the admin UI**

Edit `frontend/src/pages/admin/AdminReports.jsx`. Add a `'message'` tab to `TYPE_TABS` (line 8-12):
```js
const TYPE_TABS = [
  { value: '', label: 'All' },
  { value: 'post', label: 'Posts' },
  { value: 'user', label: 'Users' },
  { value: 'message', label: 'Messages' },
];
```

In the per-group card rendering, the current structure is `g.targetMissing ? (...) : g.targetType === 'post' ? (...) : (...)` where the final `(...)` unconditionally assumes `'user'` (lines 118-149). Change the final branch to explicitly check `'user'` and add a `'message'` branch:
```jsx
              ) : g.targetType === 'user' ? (
                <>
                  <Avatar src={g.target.avatar} size={44} alt={g.target.fullName} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      @{g.target.username}
                      {g.target.isBanned && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">
                          Already banned
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">{g.target.fullName}</p>
                  </div>
                </>
              ) : (
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-muted)] mb-1">Reported message from @{g.target.sender?.username}</p>
                  <blockquote className="text-sm italic border-l-2 border-[var(--border)] pl-2 mb-1">
                    "{g.evidenceContent}"
                  </blockquote>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Reporter-submitted copy — not independently verified (message content is end-to-end encrypted)
                  </p>
                </div>
              )}
```
(This replaces the existing `<Avatar .../>` block — which is unchanged in content, just moved under an explicit `g.targetType === 'user'` check instead of being the implicit `else` — and adds the new message branch as the final `else`.)

Change the "View Post"/"View Profile" link (lines 171-176) to skip rendering for `message`-type groups (there is no `/p/:id` or `/:username` equivalent for a single message, and `g.target.username` doesn't exist on a message target — it would render a broken `/undefined` link otherwise):
```jsx
                {!g.targetMissing && g.targetType !== 'message' && (
                  <Link to={g.targetType === 'post' ? `/p/${g.targetId}` : `/${g.target.username}`} target="_blank"
                    className="text-xs text-center btn-outline px-3 py-1.5 rounded-lg">
                    {g.targetType === 'post' ? 'View Post' : 'View Profile'}
                  </Link>
                )}
```

Change the destructive-action button (lines 182-186) to also require `g.targetType !== 'message'` (only "Dismiss" is offered for message reports — the Task 15 Step 2 backend fix explicitly rejects `action: 'remove'` for `targetType: 'message'`, so hiding the button here matches what the backend actually allows):
```jsx
                    {!g.targetMissing && g.targetType !== 'message' && (
                      <button onClick={() => handleResolve(g, 'remove')} className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
                        {g.targetType === 'post' ? 'Remove Post' : 'Ban User'}
                      </button>
                    )}
```
The "Dismiss" button (lines 179-181) needs no change — it already calls `handleResolve(g, 'dismiss')` unconditionally for any `targetType`, and `handleResolve`'s `verb` computation (line 60) already resolves to `'Dismiss this report'` for `action === 'dismiss'` regardless of `targetType` (that branch of its ternary is checked first), so it needs no change either.

- [ ] **Step 4: Manual verification**

As an admin user, open `/admin/reports`, click the new "Messages" filter tab, find the message report created in Task 14 → confirm it renders the quoted `evidenceContent`, the sender's `@username`, the "not independently verified" caption, no broken "View" link, and only a "Dismiss" action (no remove/ban button). Click Dismiss → confirm it disappears from the pending queue and reappears under the "Resolved" status tab with resolution "Dismissed".

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/adminController.js frontend/src/pages/admin/AdminReports.jsx
git commit -m "Render message reports in the admin queue (evidence-only, dismiss-only)"
```

---

### Task 16: Full live end-to-end verification

**Files:** none (verification-only task, no code changes expected — if this task uncovers a bug, fix it in the file it belongs to and note the fix in the commit message, then re-run this task's checks)

**Interfaces:** none — this exercises the whole feature through the real HTTP/Socket.io surface, the same way the chat system and the Resend/Cloudinary setups were verified earlier in this project.

- [ ] **Step 1: Write and run a live two-user scripted check**

Reuse the pattern from the earlier chat-system functional test in this project (`socket.io-client` run from `frontend/` for module resolution). Write a temporary script (not committed) that:
1. Registers/logs in two fresh test users.
2. Calls the Task 11 key-onboarding logic for both (or inlines equivalent calls to `e2eAPI.publishKeys` directly, since this script runs outside React).
3. Creates a direct conversation between them, confirms `conversation.isEncrypted === true` once both have published keys.
4. Sends an encrypted message via the real send path (`initSessionAsSender` + `ratchetEncrypt`, matching Task 12's logic) over the real `POST /api/messages/conversations/:id/messages` endpoint.
5. Fetches the raw stored message via `GET /api/messages/conversations/:id/messages` as the OTHER user and asserts:
   - `message.encrypted === true`
   - `message.content` is empty/absent
   - `message.encryptedContent.ciphertext`, base64-decoded, does **not** contain the original plaintext substring anywhere in its bytes
   - Running it through `initSessionAsReceiver` + `ratchetDecrypt` (matching Task 13's logic) recovers the exact original plaintext
6. Confirms a `Notification` (`type: 'message'`) was created for the recipient with no message content in `text`.
7. Confirms `Report.create` with `targetType: 'message'` and an `evidenceContent` round-trips correctly through `GET /api/admin/reports` (using an admin test account).

Expected: every assertion passes. If any step fails, this indicates a mismatch between the crypto module's tested behavior (Tasks 1-4, which only test the module in isolation) and how it's actually wired through the real API/DB path (Tasks 6-13) — fix the integration bug in whichever task's file it belongs to.

- [ ] **Step 2: Confirm existing functionality is unaffected**

Re-run the original (pre-encryption) chat functional test from earlier in this project against a **group** conversation: confirm group messages remain plaintext (`encrypted: false`/unset), `Conversation.isEncrypted` stays falsy for the group, and typing indicators/reactions/read-receipts still work — this confirms Task 7's changes didn't regress the untouched group-chat path.

- [ ] **Step 3: Clean up test artifacts**

Delete the temporary verification script (don't commit it, matching how the earlier chat-system test script was removed after use). If Step 1 created any test users you don't want lingering in the dev database, note them for the user rather than deleting unilaterally (matching how the earlier chat-system test's `chattest_alice1`/`chattest_bob1` accounts were left for the user to decide on).

- [ ] **Step 4: Final commit (only if Step 1/2 required fixes)**

If no fixes were needed, there is nothing to commit for this task. If fixes were needed:
```bash
git add <fixed files>
git commit -m "Fix E2E integration bug found during full end-to-end verification: <specific bug>"
```
