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
