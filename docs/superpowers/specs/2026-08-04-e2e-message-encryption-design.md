# End-to-End Encrypted Direct Messages (Phase 1) — Design

## Problem

The chat system (`backend/models/Message.js`, `backend/controllers/messageController.js`,
`frontend/src/pages/main/MessagesPage.jsx`) is fully functional (confirmed by a live
end-to-end test: conversation creation, REST send, real-time Socket.io delivery, read
receipts, reactions all work), but message content is stored and transmitted as
**plain text**. `Message.content` is a plain `String` in MongoDB with no
encrypt/decrypt step anywhere in `messageController.js`.

`frontend/src/pages/Security.jsx` explicitly claims *"Your private messages are
secured with end-to-end encryption"* — this is currently false. This spec makes
that claim true for 1-on-1 text conversations.

## Goals

- 1-on-1 (`Conversation.type === 'direct'`) text messages are encrypted client-side
  before they ever leave the browser, and decrypted client-side only. The server
  stores and relays ciphertext; it cannot read message content under any
  circumstance (not via DB access, not via a compromised server process at
  runtime — the server never possesses the keys needed to decrypt).
- Forward secrecy: compromise of a device's current key state does not expose
  previously-sent messages. Achieved via a Double Ratchet, using a simplified
  X3DH-style handshake to bootstrap the first session.
- Users can still report an abusive message (new capability — message reporting
  doesn't exist today at all, see [Report model](../../backend/models/Report.js):1-27
  only supports `targetType: 'post' | 'user'`). Reporting works by having the
  reporting user's own client submit the plaintext it has already decrypted, as
  evidence — the server never independently decrypts anything.
- Users get a notification (in-app + email) when they receive a new message, with
  **no message content** in either — sender name only. (New capability — confirmed
  by search that no such notification exists today: `sendMessage` in
  `messageController.js` never touches `Notification`, and `utils/email.js` has no
  "new message" template.)
- Existing chat functionality (typing indicators, read receipts, reactions, media
  messages, group chats) continues to work unchanged.

## Non-goals (explicitly deferred)

- **Group chat encryption.** Requires a sender-key scheme (each member's own
  ratchet, redistributed pairwise on membership change) — a distinct, larger
  design. Group conversations (`Conversation.type === 'group'`) are untouched by
  this spec and stay plaintext.
- **Media encryption.** Cloudinary needs plaintext bytes to generate thumbnails,
  transcode video, etc. Encrypting media means uploading opaque blobs and losing
  all of that processing — a separate trade-off decision, deferred.
- **Multi-device.** Each browser/device generates and holds its own identity key
  (below). Logging in on a new device does not carry old sessions over; messages
  encrypted before that device's identity key existed are not decryptable on it.
  This is disclosed in the UI (see Frontend section).
- **Safety-number / key-verification UI.** This is a trust-on-first-use (TOFU)
  system: the server hands out the recipient's public identity key on session
  start, and a compromised server could in principle substitute its own key at
  that moment (the same limitation every E2E system without an out-of-band
  verification step has). No fingerprint-comparison UI is built in this phase.
- **True OS-level push notifications** (browser tab closed). No Web Push
  infrastructure (VAPID keys, service worker, subscriptions) exists in this repo
  today, and building it is a separate feature independent of encryption. This
  phase covers in-app notifications (toast/badge while a tab is open, via the
  existing `Notification` collection + Socket.io) and a generic email fallback.

## Cryptographic design

All cryptographic operations run in the browser using **`libsodium-wrappers`**
(new frontend dependency) — an audited, WASM-compiled build of libsodium/NaCl.
No cryptographic primitive is implemented by hand; only the *protocol
state machine* (X3DH handshake bootstrap, then Double Ratchet) is custom code,
built from Signal's public specifications:
<https://signal.org/docs/specifications/x3dh/> and
<https://signal.org/docs/specifications/doubleratchet/>.

This is a deliberate, disclosed simplification versus a full Signal Protocol
implementation — researched during design because no actively-maintained,
widely-audited **standalone** JS Double Ratchet library exists as of 2026
(`@matrix-org/olm`/libolm is deprecated in favor of `vodozemac`, which is
tightly coupled to the Matrix protocol and has had its own reported crypto
issues; standalone options like `2key-ratchet` and `signal-protocol` are 5-9
years unmaintained). Building the state machine from the public spec on top of
audited primitives is the accepted practice in this situation.

### Identity and prekeys (per device)

On first use of the chat feature on a device, the client generates via
`sodium.crypto_box_keypair()` (X25519):
- **Identity key pair** — long-lived for that device.
- **A batch of one-time prekey pairs** (default 20) — each single-use.

Private keys never leave the device (stored in IndexedDB, see Frontend
section). Public keys are uploaded to the server via a new endpoint and stored
on the `User` document — the server's role is purely a directory/relay for
public keys, exactly like it already is for everything else in this app.

### Handshake (simplified X3DH)

When Alice sends Bob the first message of a new session:
1. Alice fetches Bob's prekey bundle: his public identity key `IK_B` and one
   unused public one-time prekey `OPK_B` (server marks it consumed and won't
   hand it out again).
2. Alice generates a fresh ephemeral key pair `EK_A` (`crypto_box_keypair()`).
3. Alice computes three raw ECDH outputs via `sodium.crypto_scalarmult`:
   - `DH1 = ECDH(IK_A_priv, OPK_B_pub)`
   - `DH2 = ECDH(EK_A_priv, IK_B_pub)`
   - `DH3 = ECDH(EK_A_priv, OPK_B_pub)`
4. Shared secret `SK = HKDF(DH1 || DH2 || DH3)` (HKDF via
   `sodium.crypto_kdf_hkdf_sha256_extract`/`_expand`; if the installed
   `libsodium-wrappers` version doesn't expose that pair under those exact
   names, `crypto_generichash` keyed appropriately is an acceptable equivalent
   for constructing the same extract-then-expand pattern — confirm the
   available API during implementation).
5. `SK` seeds the Double Ratchet's root key. Alice's first message includes,
   unencrypted alongside the ciphertext: her identity public key `IK_A`, her
   ephemeral public key `EK_A`, and which of Bob's one-time prekey IDs she
   used. None of this is secret — it's exactly what Bob needs to derive the
   same `SK` on his side (`DH1' = ECDH(OPK_B_priv, IK_A_pub)`, etc. — mirrored).

This omits a *signed* prekey (full X3DH has one, to let the server-published
prekey itself carry proof of possession by the identity key). Given one-time
prekeys are single-use and consumed atomically by the server, and given TOFU
already bounds the trust model here (see Non-goals), this simplification does
not introduce a new class of attack beyond what TOFU already accepts. If the
server runs out of unused one-time prekeys for a user (client hasn't
replenished in time), the bundle omits `OPK_B` and the handshake proceeds with
just `DH2`/`DH3` — weaker (no contribution from a per-recipient one-time
secret) but still forward-secret via the ephemeral key; this mirrors Signal's
own documented fallback behavior.

### Double Ratchet (ongoing messages)

Standard Signal Double Ratchet state machine, implemented from the public
spec: each message advances a symmetric-key ratchet (deriving a fresh message
key via HKDF from the current chain key, then advancing the chain key), and a
Diffie-Hellman ratchet step happens whenever the conversation's turn changes
(i.e. the first time you reply after receiving). Each message is encrypted
with `sodium.crypto_aead_xchacha20poly1305_ietf_encrypt`, using the message's
plaintext-but-not-secret header (DH ratchet public key, previous chain
length, message number) as associated data — so the header is authenticated
but not itself encrypted (this is required: the recipient needs the header to
know which key to derive before it can decrypt).

Out-of-order delivery (a message arrives before an earlier one, e.g. due to
network jitter) is handled per spec: skipped message keys are cached (keyed
by ratchet public key + message number) so a late-arriving earlier message
can still be decrypted; the cache is capped (e.g. 1000 entries) to bound
memory.

Ratchet state per conversation lives **only** in the browser (IndexedDB) —
the server never sees it, never stores it, and it is never part of any API
payload except the small public header attached to each message.

## Data model changes

### `backend/models/User.js`

Add (near the existing OAuth/security fields):
```js
e2e: {
  identityKey: String,          // base64 public X25519 key
  oneTimePreKeys: [{
    keyId: Number,
    publicKey: String,          // base64
    used: { type: Boolean, default: false }
  }]
}
```
No private key material ever reaches this schema — only what the server needs
to hand out bundles.

### `backend/models/Message.js`

`content` stays as-is for backward compatibility (existing plaintext messages,
and non-`direct` conversations, are unaffected). Add:
```js
encrypted: { type: Boolean, default: false },
encryptedContent: {
  ciphertext: String,   // base64
  header: {
    dhPublicKey: String,     // base64, this message's ratchet public key
    previousChainLength: Number,
    messageNumber: Number,
    // handshake-only fields, present only on a session's first message:
    senderIdentityKey: String,
    senderEphemeralKey: String,
    oneTimePreKeyId: Number
  }
}
```
When `encrypted: true`, `content` is left empty and `sendMessage` skips
anything that assumes readable text (there isn't anything today besides
storing it — confirmed no server-side text processing like profanity
filtering or search indexing exists on `Message.content`).

### `backend/models/Message.js` — `Conversation`

`isEncrypted` already exists on the schema (`backend/models/Message.js:88`)
but nothing sets or reads it today. Phase 1 gives it a real meaning: `true`
once both participants of a `direct` conversation have published an
`identityKey`. It is set the first time `getOrCreateConversation` runs after
both sides have keys (checked and updated lazily — see Backend section), and
read by the frontend to decide whether to run the encrypt/decrypt path for
that conversation.

### `backend/models/Report.js`

```js
targetType: { type: String, enum: ['post', 'user', 'message'], required: true },
evidenceContent: { type: String, maxlength: 2000 } // only used when targetType === 'message'
```
`evidenceContent` is what the reporting user's client currently has decrypted
and displayed for that message — submitted at report time, not fetched by the
server independently (the server cannot decrypt it independently). The admin
UI labels this clearly as "reporter-submitted copy, not independently
verified" (see Frontend section) — this is a real, disclosed limitation
(a reporter could in theory submit doctored text), the same one Signal's own
flagged-message evidence has.

### `backend/models/Notification.js`

No schema change — `type: 'message'` already exists in the enum
(`backend/models/Notification.js:12`) but is never used by any controller
today. This phase is what wires it up.

## Backend — key management endpoints

New file `backend/routes/e2eRoutes.js`, mounted at `/api/e2e` in
`backend/server.js` (same pattern as the other route mounts).

### `POST /api/e2e/keys` (`protect`)
Body: `{ identityKey, oneTimePreKeys: [{ keyId, publicKey }, ...] }`.
- Sets `req.user.e2e.identityKey = identityKey`.
- Appends the new one-time prekeys to `req.user.e2e.oneTimePreKeys` (client
  calls this both on first setup and later to replenish — see Frontend
  onboarding).
- Called on first setup for a device, and periodically thereafter when the
  client's local count of *known-unused* prekeys drops below a threshold
  (e.g. 5), generating and uploading a fresh batch of 20.

### `GET /api/e2e/prekey-bundle/:userId` (`protect`)
- 404 if the target user has no `identityKey` published yet (they haven't
  opened the app since this feature shipped — conversation stays unencrypted
  until they do, see Backend — message send/receive changes below).
- Atomically claims one unused one-time prekey:
  ```js
  const user = await User.findOneAndUpdate(
    { _id: userId, 'e2e.oneTimePreKeys.used': false },
    { $set: { 'e2e.oneTimePreKeys.$.used': true } },
    { new: false } // read the prekey from the pre-update doc
  );
  ```
  If no unused prekey exists, returns the bundle without one (documented
  fallback in the Cryptographic design section above) rather than erroring.
- Response: `{ identityKey, oneTimePreKey: { keyId, publicKey } | null }`.

## Backend — message send/receive changes

`messageController.js`'s `sendMessage`:
- Accepts either the existing `content` (plaintext — used for group
  conversations, or direct conversations where the recipient hasn't published
  keys yet) or `encrypted: true` + `encryptedContent` (direct conversations
  once both sides have keys).
- If `encrypted`, sets `Message.encrypted = true`, stores
  `encryptedContent` as given, leaves `content` empty. Does **not** attempt to
  interpret it in any way.
- `conversation.lastMessage` / `conversation.lastMessageAt` update exactly as
  today — the conversation-list preview is a client-side concern (see
  Frontend section), not a server one.
- Socket emission (`io.to(conversationId).emit('message:receive', populated)`)
  is unchanged — it already just relays whatever the `Message` document
  contains, encrypted or not.

`getOrCreateConversation`: after creating or finding a `direct` conversation,
if `conversation.isEncrypted` is not already `true`, check whether both
participants now have `e2e.identityKey` set, and if so, set and save
`isEncrypted: true`. (A conversation created before one participant had keys
transparently upgrades to encrypted the next time either side opens it, once
both have published keys — no migration step needed.)

`getMessages`: unchanged — it already returns whatever fields exist on each
`Message` document; `encrypted`/`encryptedContent` just ride along like any
other field for the frontend to interpret.

## Backend — message reporting

Extends the existing `backend/controllers/reportController.js` (`createReport`)
rather than adding a new file, matching how `post`/`user` are both handled in
one function today:

- `targetType` validation extends to `['post', 'user', 'message']`.
- New branch for `'message'`:
  ```js
  const target = await Message.findById(targetId);
  if (!target) return res.status(404).json({ success: false, message: 'Message not found' });
  const conversation = await Conversation.findById(target.conversation);
  if (!conversation?.participants.some(p => p.toString() === req.user._id.toString())) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  if (target.sender.toString() === req.user._id.toString()) {
    return res.status(400).json({ success: false, message: "You can't report your own message" });
  }
  if (!req.body.evidenceContent?.trim()) {
    return res.status(400).json({ success: false, message: 'evidenceContent is required for message reports' });
  }
  ```
- `Report.create` includes `evidenceContent: req.body.evidenceContent` for
  message reports (ignored/absent for post and user reports, matching the
  existing `note` field's already-optional pattern).
- The duplicate-report guard (`Report.findOne({ reporter, targetType, targetId, status: 'pending' })`)
  applies unchanged.

## Backend — new-message notifications

In `messageController.js`'s `sendMessage`, after the message is created and
socket-emitted, for each conversation participant other than the sender:

**In-app** (always, regardless of online status — matches how every other
notification type in this app already behaves, e.g. `like`/`comment` in
`postController.js`):
```js
await Notification.create({
  recipient: participantId,
  sender: req.user._id,
  type: 'message',
  text: `${req.user.fullName} sent you a message`
});
```
No `content`/`encryptedContent` is read or referenced — this works
identically whether the message is encrypted or not, by construction.

**Email** (generic, only when likely to be missed): send
`sendNewMessageEmail(recipientUser, req.user.fullName)` only if both:
1. The recipient is not currently connected via Socket.io to this
   conversation's room — check with the existing `getSocketId`/online-users
   helpers already exported from `config/socket.js` (a participant actively
   viewing the thread doesn't need an email for a message they're already
   seeing arrive in real time).
2. This message is the *first* unread message in this conversation for that
   recipient since their last read (i.e. their unread count for this
   conversation was 0 immediately before this message) — reuses the same
   `Message.countDocuments({ conversation, sender: { $ne: recipientId }, 'readBy.user': { $ne: recipientId } })`
   pattern already used in `getUnreadCount`/`getConversations`, checked
   *before* creating the new message. This avoids one email per message in a
   burst — matches the existing product's general "batch, don't spam"
   posture (e.g. how `getConversations` already aggregates unread counts
   rather than listing every message).

New template in `backend/utils/email.js`, following the existing template
functions' exact shape (e.g. `sendNewLoginEmail`):
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
No message content anywhere in the email, by construction — this is not a
filtering step applied to a richer email, the template simply never receives
the content in the first place, so there's nothing to leak.

Respect `user.settings.notifications.messages` (already exists,
`backend/models/User.js:147`, default `true`) as the on/off switch for both
the in-app notification and the email — matches how notification prefs are
presumably meant to gate this category already existing in the schema.

## Frontend — crypto module

New file `frontend/src/lib/e2e.js`. Pure functions, no React — a thin
wrapper around `libsodium-wrappers` (new dependency) implementing exactly the
protocol in the Cryptographic design section:
- `generateIdentity()` → `{ identityKey, identityPrivateKey }`
- `generateOneTimePreKeys(count)` → array of `{ keyId, publicKey, privateKey }`
- `initSessionAsSender(myPrivateKeys, theirBundle)` → session state + first
  message's handshake header
- `initSessionAsReceiver(myPrivateKeys, incomingHeader)` → session state
  (mirrors the sender's derivation using the header's public values)
- `ratchetEncrypt(session, plaintext)` → `{ ciphertext, header, newSession }`
- `ratchetDecrypt(session, ciphertext, header)` → `{ plaintext, newSession }`
  (throws a typed `DecryptError` on failure, e.g. skipped-key limit exceeded
  or corrupted state — caller decides how to surface it, see Error handling)

### Key storage

New file `frontend/src/lib/e2eStorage.js` — a small IndexedDB wrapper (no new
dependency needed; IndexedDB is a native browser API) with two object stores:
- `identity` — this device's identity key pair + unused one-time prekey
  private keys (indexed by `keyId`, removed once the server confirms the
  matching public key was consumed — detected on next full sync, not
  strictly on the critical path of every message).
- `sessions` — one ratchet state record per `conversationId`.

Everything in this module stays local; nothing here is ever sent in an API
call except the public keys, which flow through `e2eAPI` below.

### `frontend/src/services/api.js` additions
```js
export const e2eAPI = {
  publishKeys: (data) => API.post('/e2e/keys', data), // { identityKey, oneTimePreKeys }
  getPreKeyBundle: (userId) => API.get(`/e2e/prekey-bundle/${userId}`),
};
```
Extend `reportAPI.createReport` usage (no signature change needed — it
already accepts an arbitrary body object, so `evidenceContent` just becomes
another key callers may pass).

### Onboarding (key generation)

In `frontend/src/context/AuthContext.jsx`, whose `useEffect` (line 25) already
establishes the session and calls `setUser(data.user)` on app load: after that
succeeds, check `e2eStorage` for an existing local identity; if absent,
generate one, `e2eAPI.publishKeys(...)`, and persist locally. If the local prekey count drops below 5 (checked at the same
point), generate and publish 20 more. This mirrors the "first use silently
sets things up" pattern already used elsewhere in the app (e.g. how a
`Conversation` is lazily created on first message rather than requiring an
explicit setup step).

### `MessagesPage.jsx` integration

- `loadMessages`: for each returned message where `msg.encrypted`, run it
  through `ratchetDecrypt` (creating the session first via
  `initSessionAsReceiver` if this is the first encrypted message seen for
  that conversation and no local session exists yet) before putting it in
  `messages` state; attach the decrypted text as `msg.content` so the
  existing render path (`msg.content` at line 362) needs no change. On
  decrypt failure, set `msg.content` to a sentinel the render path checks for
  (e.g. `msg.decryptError = true`) and render "🔒 Couldn't decrypt this
  message" instead of the bubble text.
- `handleSend`: if `activeConv.isEncrypted`, before building the `FormData`,
  ensure a session exists (fetch a prekey bundle and `initSessionAsSender` if
  not), `ratchetEncrypt` the text, and send `encrypted: true` +
  `encryptedContent` fields instead of `content`. Persist the updated session
  state (`newSession`) back to `e2eStorage` after every encrypt/decrypt —
  the ratchet advances on every message and losing state mid-conversation
  breaks future decryption.
- Socket handler (`on('message:receive', ...)`, line 75): same decrypt step
  as `loadMessages`, applied to the single incoming message before appending
  to `messages` state.
- Conversation list (line 220-262): `lastMsg?.content` (line 251) needs the
  same treatment — decrypt `conv.lastMessage` client-side before rendering
  the preview text, or show a generic "🔒 Encrypted message" placeholder if
  no local session exists yet for that conversation (e.g. right after login
  before the first message of that thread has been opened/decrypted once).
- Chat header (around line 271): when `activeConv.isEncrypted`, show a small
  lock icon + "Messages are end-to-end encrypted" line, matching this app's
  existing pattern of inline contextual banners (e.g. the `warning` class in
  `baseEmailTemplate`, adapted for in-app use).
- New-device disclosure: if `activeConv.isEncrypted` and no local session
  exists *and* decryption of the conversation's messages fails across the
  board (i.e., not just one out-of-order message but everything), show a
  one-time inline note: "You're on a new device — older encrypted messages
  from before today can't be shown here." rather than silently rendering a
  wall of "couldn't decrypt" bubbles with no explanation.

### Report UI

`frontend/src/pages/main/MessagesPage.jsx`: add a per-message context action
("Report") alongside wherever message actions will need to live (there isn't
an existing per-message menu today — this phase adds the minimal one:
long-press/right-click or a small `FiMoreHorizontal` affordance on hover,
following the visual pattern of `PostOptionsMenu.jsx`'s bottom-sheet). Reuses
the existing `frontend/src/components/common/ReportModal.jsx` (already built
for post/user reports per the prior Reports feature) — extend its `targetType`
prop to accept `'message'`, and when it is, pass along the currently-rendered
(already-decrypted) `msg.content` as `evidenceContent` in the
`reportAPI.createReport` call.

`frontend/src/pages/admin/AdminReports.jsx`: add a `message` branch alongside
the existing `post`/`user` rendering (around line 120) — shows the reported
message's `evidenceContent` in a quoted block with a small caption "Reporter-
submitted copy — not independently verified" (the server cannot decrypt the
original to cross-check it), plus sender/recipient usernames and a
"View Conversation" link for an admin to open `/messages/:conversationId` in
their own account if they have reason to investigate further (they still
cannot read past messages there either, since admin accounts are not
conversation participants — this link is a convenience for context like
confirming the conversation exists and who's in it, not for reading history).

## Error handling

- `ratchetDecrypt` failure (corrupted local state, message from a session
  this device never had, skipped-key cache exceeded) never throws up into a
  crash — every call site catches it and renders the "🔒 Couldn't decrypt"
  state per message, consistent with this app's existing catch-and-toast
  pattern (`MessagesPage.jsx`'s `handleSend`/`handleFileSelect`).
- `POST /api/e2e/keys` and `GET /api/e2e/prekey-bundle/:userId` follow the
  existing try/catch → `500` with `error.message` pattern used throughout the
  backend.
- If `e2eAPI.getPreKeyBundle` 404s (recipient has never opened the app since
  this feature shipped), `handleSend` falls back to plaintext `content` for
  that message and the conversation stays `isEncrypted: false` until the
  recipient's device publishes keys — this is a real, disclosed gap (no
  attempt to encrypt is made rather than blocking sending) and is called out
  explicitly in the chat header ("Encryption starts once the other person
  opens NexVibe" — shown when the conversation is `direct` but not yet
  `isEncrypted`).
- IndexedDB unavailable (rare — private/incognito modes in some browsers
  restrict it) → chat falls back to plaintext with a header notice, rather
  than being unusable.

## Testing

No automated test suite exists in this repo (confirmed: neither
`package.json` has a `test` script) — matches the existing testing posture
noted in the prior Reports design spec. Verification is manual plus one
scripted crypto self-check:

1. **Crypto module round-trip** (`node` script, no server needed, similar to
   how the Cloudinary/Resend setup was smoke-tested earlier in this project):
   simulate Alice and Bob generating identities/prekeys, Alice running
   `initSessionAsSender`, Bob running `initSessionAsReceiver` from Alice's
   header, and confirm several `ratchetEncrypt`/`ratchetDecrypt` round trips
   in both directions recover the original plaintext. Include one
   out-of-order case (encrypt 3 messages, decrypt them 3-1-2) to confirm
   skipped-key handling works.
2. **Live end-to-end test** (repeat of the earlier chat functional test, this
   time asserting encryption): two real users, a direct conversation, send a
   message — confirm the `Message` document in MongoDB has `encrypted: true`
   and `encryptedContent.ciphertext` that does **not** contain the plaintext
   substring anywhere, and that fetching it back through the recipient's
   session correctly decrypts to the original text.
3. Open the same conversation as the recipient in a second "device" (fresh
   IndexedDB / incognito profile, fresh identity key) → confirm old messages
   show the "can't be shown here" notice rather than crashing, and that a
   *new* message sent from that device round-trips correctly (new session,
   new handshake).
4. Report a message → confirm the `Report` document has
   `targetType: 'message'`, the correct `evidenceContent`, and that the
   admin queue (`/admin/reports`) renders it with the "not independently
   verified" caption.
5. Send a message to an offline recipient (no active socket) → confirm one
   `Notification` (`type: 'message'`) is created and one email is sent
   (verify via the Resend test flow already used for the Resend setup);
   send a second message before the first is read → confirm no second
   email (unread-count-was-already->0 guard).
6. Confirm a `group` conversation is entirely unaffected — messages remain
   plaintext, `isEncrypted` stays `false`/unset on the `Conversation`.
