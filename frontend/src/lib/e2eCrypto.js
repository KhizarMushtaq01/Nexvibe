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
  const ratchetHeader = {
    dhPublicKey: header.dhPublicKey,
    previousChainLength: header.previousChainLength,
    messageNumber: header.messageNumber
  };

  const skipCacheKey = `${ratchetHeader.dhPublicKey}|${ratchetHeader.messageNumber}`;
  if (session.skippedMessageKeys[skipCacheKey]) {
    const messageKey = session.skippedMessageKeys[skipCacheKey];
    delete session.skippedMessageKeys[skipCacheKey];
    const plaintext = aeadDecrypt(messageKey, ciphertext, ratchetHeader);
    return { plaintext, session };
  }

  const incomingDh = sodium.from_base64(ratchetHeader.dhPublicKey);
  const isNewRatchetKey = !session.dhRemotePublicKey ||
    sodium.to_base64(session.dhRemotePublicKey) !== ratchetHeader.dhPublicKey;

  if (isNewRatchetKey) {
    skipMessageKeys(session, ratchetHeader.previousChainLength);
    performDhRatchetStep(session, incomingDh);
  }

  skipMessageKeys(session, ratchetHeader.messageNumber);
  const { messageKey, nextChainKey } = chainStep(session.receivingChain.key);
  session.receivingChain.key = nextChainKey;
  session.receivingChain.n = ratchetHeader.messageNumber + 1;

  const plaintext = aeadDecrypt(messageKey, ciphertext, ratchetHeader);
  return { plaintext, session };
}
