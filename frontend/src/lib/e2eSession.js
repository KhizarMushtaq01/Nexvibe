import { initSessionAsSender, initSessionAsReceiver, ratchetDecrypt, DecryptError } from './e2eCrypto';
import { getSession, getLocalIdentity, saveSession, getUnusedOneTimePreKeys, consumeOneTimePreKey } from './e2eStorage';
import { e2eAPI } from '../services/api';

// ── Per-conversation async mutex ────────────────────────────────────────────
// Every read-modify-write of a conversation's ratchet session (thread load,
// socket receive, send) must be serialized against every OTHER such span for
// the same conversation. Without this, two spans both read the session before
// either writes it back and the later write silently discards the earlier
// ratchet advance, desynchronizing the session.
const sessionLocks = new Map();

export function withSessionLock(conversationId, fn) {
  const prev = sessionLocks.get(conversationId) || Promise.resolve();
  const next = prev.then(fn, fn);
  // Store a never-rejecting tail so a failed span doesn't poison the chain.
  sessionLocks.set(conversationId, next.then(() => {}, () => {}));
  return next;
}

// Returns the existing local session for this conversation if one exists,
// otherwise fetches the recipient's prekey bundle and starts a new one as
// the sender. `handshakeHeader` is non-null only when a session was just
// created here (the caller must merge it into the first ratchetEncrypt
// header) -- an existing/resumed session has already exchanged handshake
// info on an earlier message, so subsequent messages don't repeat it.
//
// IMPORTANT: This function does NOT persist new sessions to IndexedDB. The
// caller is responsible for calling saveSession(conversationId, session)
// after successfully sending the message. This prevents orphaned handshakes
// if the send fails before reaching the server. The caller must also hold
// withSessionLock(conversationId) across the whole read-encrypt-send-save
// span (see MessagesPage handleSend).
export async function getOrCreateSenderSession(conversationId, recipientUserId) {
  const existing = await getSession(conversationId);
  if (existing) return { session: existing, handshakeHeader: null };

  const identity = await getLocalIdentity();
  if (!identity) throw new Error('No local E2E identity yet');

  const { data } = await e2eAPI.getPreKeyBundle(recipientUserId);
  const bundle = { identityKey: data.identityKey, oneTimePreKey: data.oneTimePreKey };
  const { session, handshakeHeader } = initSessionAsSender(identity, bundle);
  // Don't save new session here; caller must persist after successful send
  return { session, handshakeHeader };
}

// Builds a fresh receiver-side session from a handshake header. Returns null
// when this device has no local identity.
//
// This deliberately does NOT consume the one-time prekey the header names: the
// header is peer-controlled (the sender builds it client-side), so consuming
// before the decrypt is verified would let a burst of garbage messages, each
// naming a different keyId, permanently delete this device's private prekey
// halves. The server still advertises those keyIds to OTHER users, whose
// handshakes would then find no matching private key and become permanently
// undecryptable. Callers must call consumePreKeyAfterSuccess() only once a
// decrypt with the returned session has actually succeeded.
async function buildReceiverSessionFromHeader(header) {
  const identity = await getLocalIdentity();
  if (!identity) return null;
  const myPreKeys = await getUnusedOneTimePreKeys();
  return initSessionAsReceiver(identity, myPreKeys, header);
}

// Deletes the local private half of a one-time prekey that has now been proven
// used by a successfully decrypted handshake message. A storage failure here
// must not turn an already-decrypted message into a decrypt error.
async function consumePreKeyAfterSuccess(preKeyId) {
  if (preKeyId == null) return;
  try {
    await consumeOneTimePreKey(preKeyId);
  } catch { /* leaving a spent prekey behind is harmless; losing one is not */ }
}

// Per-message memo of decrypt results, keyed by message _id. Decrypting a
// message advances the receiving ratchet chain and (on the first message of
// a session) deletes the one-time prekey the handshake named -- both are
// single-use side effects that must happen exactly once per message. But
// this function gets called more than once for the *same* message in
// perfectly ordinary circumstances: React StrictMode's dev-mode double
// invoke of the thread-load effect, a GET-fetched history that includes a
// message the socket also just delivered live, or a re-render that re-fetches
// the same page of messages. withSessionLock only serializes those calls
// against each other -- it doesn't make a second decrypt of an
// already-consumed message succeed, since the ratchet has already moved past
// it and (for a first message) its prekey is already gone. Memoizing by
// message id makes every call after the first a cache hit instead of a
// doomed re-decrypt.
const decryptResultCache = new Map();

// Decrypts one message object as received from the API/socket. Returns
// { content } on success or { decryptError: true } on failure -- never
// throws, so callers can render a fallback instead of crashing the thread.
//
// The whole read-decrypt-save span runs under the conversation's session lock
// so concurrent callers (thread load, socket receive, send) can't interleave.
export async function decryptIncomingMessage(conversationId, msg) {
  if (!msg.encrypted) return { content: msg.content };
  if (msg._id && decryptResultCache.has(msg._id)) return decryptResultCache.get(msg._id);

  return withSessionLock(conversationId, async () => {
    // Re-check inside the lock: a concurrent call for the same message may
    // have just finished (and cached its result) while this call was queued.
    if (msg._id && decryptResultCache.has(msg._id)) return decryptResultCache.get(msg._id);
    const remember = (result) => { if (msg._id) decryptResultCache.set(msg._id, result); return result; };
    try {
      const header = msg.encryptedContent?.header;
      if (!header) return remember({ decryptError: true });

      let session = await getSession(conversationId);
      const hadSession = !!session;
      // Non-null only when the session below was just built from this header;
      // the named prekey is deleted only after a decrypt has verified it.
      let preKeyIdToConsume = null;

      if (!session) {
        if (!header.senderIdentityKey) return remember({ decryptError: true });
        session = await buildReceiverSessionFromHeader(header);
        if (!session) return remember({ decryptError: true });
        preKeyIdToConsume = header.oneTimePreKeyId ?? null;
      }

      try {
        const { plaintext, session: updatedSession } = ratchetDecrypt(session, msg.encryptedContent.ciphertext, header);
        await saveSession(conversationId, updatedSession);
        await consumePreKeyAfterSuccess(preKeyIdToConsume);
        return remember({ content: plaintext });
      } catch (err) {
        // Recovery path: the sender may have lost its session (e.g. a send that
        // was persisted server-side but reported as failed, so the sender never
        // saved its ratchet state) and re-run the X3DH handshake against a fresh
        // prekey bundle. Our stale session can never decrypt that message, so if
        // this looks like a fresh handshake, rebuild the session from its header
        // and retry once. Only attempted when a session already existed -- on the
        // no-session path we just built one from this very header, so a retry
        // would rebuild the identical session and fail identically.
        if (!hadSession || !header.senderIdentityKey) throw err;
        const freshSession = await buildReceiverSessionFromHeader(header);
        if (!freshSession) throw err;
        const { plaintext, session: updatedSession } = ratchetDecrypt(freshSession, msg.encryptedContent.ciphertext, header);
        await saveSession(conversationId, updatedSession);
        await consumePreKeyAfterSuccess(header.oneTimePreKeyId ?? null);
        return remember({ content: plaintext });
      }
    } catch (err) {
      if (err instanceof DecryptError) return remember({ decryptError: true });
      return remember({ decryptError: true });
    }
  });
}
