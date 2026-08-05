import { initSessionAsSender, initSessionAsReceiver, ratchetDecrypt, DecryptError } from './e2eCrypto';
import { getSession, getLocalIdentity, saveSession, getUnusedOneTimePreKeys, consumeOneTimePreKey } from './e2eStorage';
import { e2eAPI } from '../services/api';

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
// if the send fails before reaching the server.
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
