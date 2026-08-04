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
