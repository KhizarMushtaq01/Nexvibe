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
