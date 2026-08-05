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

// Builds a fresh receiver-side session from a handshake header, consuming the
// named one-time prekey. Returns null when this device has no local identity.
async function initReceiverSessionFromHeader(header) {
  const identity = await getLocalIdentity();
  if (!identity) return null;
  const myPreKeys = await getUnusedOneTimePreKeys();
  const session = initSessionAsReceiver(identity, myPreKeys, header);
  if (header.oneTimePreKeyId != null) {
    await consumeOneTimePreKey(header.oneTimePreKeyId);
  }
  return session;
}

// Decrypts one message object as received from the API/socket. Returns
// { content } on success or { decryptError: true } on failure -- never
// throws, so callers can render a fallback instead of crashing the thread.
//
// The whole read-decrypt-save span runs under the conversation's session lock
// so concurrent callers (thread load, socket receive, send) can't interleave.
export async function decryptIncomingMessage(conversationId, msg) {
  if (!msg.encrypted) return { content: msg.content };

  return withSessionLock(conversationId, async () => {
    try {
      const header = msg.encryptedContent?.header;
      if (!header) return { decryptError: true };

      let session = await getSession(conversationId);
      const hadSession = !!session;

      if (!session) {
        if (!header.senderIdentityKey) return { decryptError: true };
        session = await initReceiverSessionFromHeader(header);
        if (!session) return { decryptError: true };
      }

      try {
        const { plaintext, session: updatedSession } = ratchetDecrypt(session, msg.encryptedContent.ciphertext, header);
        await saveSession(conversationId, updatedSession);
        return { content: plaintext };
      } catch (err) {
        // Recovery path: the sender may have lost its session (e.g. a send that
        // was persisted server-side but reported as failed, so the sender never
        // saved its ratchet state) and re-run the X3DH handshake against a fresh
        // prekey bundle. Our stale session can never decrypt that message, so if
        // this looks like a fresh handshake, rebuild the session from its header
        // and retry once. Only attempted when a session already existed -- on the
        // no-session path we just built one from this very header, so retrying
        // would only re-consume prekeys.
        if (!hadSession || !header.senderIdentityKey) throw err;
        const freshSession = await initReceiverSessionFromHeader(header);
        if (!freshSession) throw err;
        const { plaintext, session: updatedSession } = ratchetDecrypt(freshSession, msg.encryptedContent.ciphertext, header);
        await saveSession(conversationId, updatedSession);
        return { content: plaintext };
      }
    } catch (err) {
      if (err instanceof DecryptError) return { decryptError: true };
      return { decryptError: true };
    }
  });
}
