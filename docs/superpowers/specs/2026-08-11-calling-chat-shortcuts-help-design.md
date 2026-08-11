# Audio/Video Calling, Chat Shortcuts & Help Sub-Pages — Design

## Problem

Three unfinished surfaces in the app, all reachable from the same user
journey (open a chat → call someone, or open Settings → look for help):

1. **Calls don't exist.** `MessagesPage.jsx:544-552` renders a phone icon,
   a video icon and a three-dot icon as bare `<button>` elements with no
   `onClick` at all. Meanwhile `backend/config/socket.js:59-98` already
   ships call signaling (`call:initiate`, `call:answer`, `call:reject`,
   `call:end`, `ice:candidate`) that nothing in the frontend has ever
   used. There is no WebRTC client code anywhere in the repo.
2. **The chat header's three-dot button does nothing.** The conversation
   *list* got a long-press action sheet in the previous change
   (`ConversationActionsSheet.jsx`), but inside an open chat there is no
   way to reach any of those actions, or any chat-specific ones.
3. **Settings → Help is five dead links.** `SettingsPage.jsx:537` maps
   `['Help Center', 'Privacy and Security Help', 'Support Inbox',
   'Report a problem', 'About']` to `<a href="#">`. Separately, real
   public pages (`Help.jsx`, `Privacy.jsx`, `Cookies.jsx`, `Terms.jsx`)
   already exist but are unreachable from inside the app.

## Goals

- Audio and video call buttons that actually place a call, using real
  WebRTC media (`getUserMedia` + `RTCPeerConnection`), not a simulation.
- 1-on-1 **and** group calls, up to 8 participants, audio or video.
- An incoming-call screen with Decline / Answer, plus answer-as-audio and
  answer-with-video options.
- An active-call screen with the other caller's profile image at the top,
  and End call / Mute / Speaker / Message controls.
- A working three-dot menu in the chat header with real chat shortcuts
  and quick settings — every entry persists.
- Settings → Help sub-pages that actually render (Help Center/FAQ,
  Privacy Policy, Cookies Policy, Terms, Community Guidelines, About) and
  a "Report a problem" form that submits to the backend, with a fully
  functional admin panel tab to triage those submissions.
- Every screen responsive across phone, tablet and desktop, in light and
  dark themes.

## Non-goals (deferred, not part of this change)

- **No SFU / media server.** Group calls are mesh (peer-to-peer between
  every pair). See "Mesh cost" below for the accepted limits.
- **No TURN server provisioning.** ICE config is env-driven so a TURN
  server can be dropped in later; without one, users behind symmetric
  NAT will see a clear "Couldn't connect" error rather than a hang.
- **No call recording, screen sharing, or call-from-profile.** Calls
  start from a conversation only.
- **No server-side message search.** Text messages are E2E encrypted, so
  the server cannot read them. Search is client-side (see below).
- **No shared-media gallery and no disappearing-messages toggle** in the
  three-dot menu — the user explicitly did not select that group.
- **No E2E encryption of call media beyond WebRTC's own DTLS-SRTP**,
  which is mandatory in WebRTC and is what we rely on.

---

## Part 1 — Calling

### 1.1 Architecture

A global `CallProvider` React context mounted inside `DialogProvider` in
`App.jsx` (it needs `useAuth`, `useSocket` and router access, all of
which are already above that point in the tree). It renders a
`<CallOverlay />` sibling to `<AppRoutes />`.

Rejected alternatives, and why:
- *Call state inside `MessagesPage`* — the call would be torn down on any
  navigation, and an incoming call would never surface while the user is
  on the feed.
- *A dedicated `/call/:id` route* — navigating away still kills the call,
  and it makes the "Message" button (which must keep the call alive while
  showing the chat) impossible.

### 1.2 New files

| File | Responsibility |
|---|---|
| `frontend/src/context/CallContext.jsx` | Call state machine, socket wiring, public API |
| `frontend/src/lib/webrtc.js` | Pure logic: ICE config, peer factory, glare rule, media constraints |
| `frontend/src/lib/ringtone.js` | Web Audio API ringtone/ringback generator |
| `frontend/src/components/call/CallOverlay.jsx` | Portal root; picks incoming vs active vs minimized |
| `frontend/src/components/call/IncomingCallScreen.jsx` | Ringing UI, Decline / Answer |
| `frontend/src/components/call/ActiveCallScreen.jsx` | Header, participant grid, controls |
| `frontend/src/components/call/CallControls.jsx` | The control bar |
| `frontend/src/components/call/ParticipantTile.jsx` | One participant's video/avatar + badges |
| `frontend/src/components/call/MinimizedCallPill.jsx` | Floating pill while browsing |
| `frontend/src/hooks/useCallDuration.js` | Ticking call timer |

`lib/webrtc.js` holds everything testable without a DOM: it is the unit
under test, and `CallContext` is the thin orchestration layer over it.

### 1.3 State machine

`CallContext` exposes a single `call` object; `call.status` is one of:

```
idle
outgoing    caller has dialed, waiting for anyone to answer
incoming    callee is being rung
connecting  answered; ICE negotiating
active      at least one peer connection is 'connected'
ended       terminal; auto-returns to idle after ~2s of "Call ended"
```

Transitions:

| From | Event | To |
|---|---|---|
| `idle` | `startCall()` | `outgoing` |
| `idle` | `call:incoming` | `incoming` |
| `outgoing` | first `call:accepted` | `connecting` |
| `outgoing` | all peers rejected / 30s timeout | `ended` |
| `incoming` | `answer()` | `connecting` |
| `incoming` | `decline()` / 30s timeout | `ended` |
| `connecting` | first peer `connectionState === 'connected'` | `active` |
| `connecting` | all peers `failed` | `ended` (error copy) |
| `active` | `endCall()` / last peer leaves | `ended` |
| any | user logs out / socket disconnects >15s | `ended` |

Guards: `startCall()` and `answer()` are no-ops unless `status === 'idle'`
(for start) — a second inbound call while busy is answered automatically
with `call:busy`, and the caller sees "User is busy".

### 1.4 Signaling protocol

The existing socket events are 1-on-1-shaped (one `receiverId`, one
implicit call). They are extended to carry a `callId` and explicit
per-peer routing so the same handlers serve mesh calls. All events live in
`backend/config/socket.js`.

Client → server:

| Event | Payload | Server behaviour |
|---|---|---|
| `call:initiate` | `{ callId, conversationId, participantIds[], type }` | Emit `call:incoming` to every online participant; reply `call:ring-status` to the caller listing who was offline |
| `call:accept` | `{ callId, toUserId }` | Relay `call:accepted` `{ callId, fromUserId }` |
| `call:reject` | `{ callId, toUserId }` | Relay `call:rejected` `{ callId, fromUserId }` |
| `call:busy` | `{ callId, toUserId }` | Relay `call:busy` |
| `call:offer` | `{ callId, toUserId, sdp }` | Relay `call:offer` `{ callId, fromUserId, sdp }` |
| `call:answer` | `{ callId, toUserId, sdp }` | Relay `call:answer` `{ callId, fromUserId, sdp }` |
| `ice:candidate` | `{ callId, toUserId, candidate }` | Relay to that user |
| `call:leave` | `{ callId }` | Broadcast `call:peer-left` `{ callId, userId }` to the call's other members |
| `call:media-state` | `{ callId, audioEnabled, videoEnabled }` | Broadcast `call:peer-media-state` |

The server keeps an in-memory `activeCalls: Map<callId, Set<userId>>`
alongside the existing `onlineUsers` map, so `call:leave` and `disconnect`
can notify the right people. It is deliberately in-memory: a lost call on
server restart is acceptable, and it keeps this out of MongoDB.

**Authorization:** every handler verifies `socket.userId` is a member of
`activeCalls.get(callId)` (or, for `call:initiate`, a participant of the
conversation) before relaying. Without this check any client could inject
SDP into a stranger's call. `call:initiate` looks the conversation up and
rejects if `socket.userId` is not a participant, and caps
`participantIds` at 8.

Backward compatibility with the old event shapes is **not** preserved —
nothing consumes them today, so they are replaced outright rather than
kept as dead branches.

### 1.5 Mesh topology and glare

Every participant holds one `RTCPeerConnection` per other participant,
keyed in a `Map<userId, RTCPeerConnection>`.

- When B accepts a call that already has A in it, B receives the current
  member list and both sides need exactly one offer between them.
- **Glare rule:** for any pair, the peer whose `userId` string compares
  lower is the offerer; the other waits for the offer. This is
  deterministic on both sides with no extra round trip, and removes the
  need for perfect-negotiation rollback handling.

**Mesh cost (accepted trade-off):** at 8 participants each client
maintains 7 peer connections and uploads 7 copies of its own stream. That
is fine for audio, and heavy for video. Mitigation, not elimination:

- 1-on-1 video constraints: `1280×720`, 30fps.
- Group (3+) video constraints: `320×240`, 15fps, and
  `sender.setParameters({ maxBitrate: 150_000 })` on each video sender.
- Any participant can drop to audio-only with the camera button, which
  removes their video track from all senders.

### 1.6 ICE configuration

`lib/webrtc.js` builds `iceServers` from Vite env vars:

```
VITE_STUN_URLS       comma-separated; default "stun:stun.l.google.com:19302"
VITE_TURN_URL        optional
VITE_TURN_USERNAME   optional
VITE_TURN_CREDENTIAL optional
```

If all peer connections reach `iceConnectionState === 'failed'`, the call
ends with the message "Couldn't connect — this network needs a TURN
server." — an honest error, not a silent hang.

Note that `VITE_*` values are baked into the client bundle and therefore
public. Long-lived static TURN credentials should not be used in
production; the env vars are the pragmatic option for now, and the
follow-up is a short-lived-credential endpoint. This is documented in the
plan, not implemented here.

### 1.7 Permissions and device errors

`getUserMedia` is called *before* `call:initiate` (caller) and before
`call:accept` (callee), so a permission denial never leaves the other
side ringing. Each failure maps to specific copy:

| Error | UI |
|---|---|
| `NotAllowedError` | "Camera/microphone permission denied. Enable it in your browser settings." |
| `NotFoundError` | "No microphone found." / for video: silently fall back to audio-only |
| `NotReadableError` | "Your camera or microphone is being used by another app." |
| Insecure context (no HTTPS) | Call buttons disabled with a tooltip explaining calls need HTTPS |

### 1.8 Incoming call screen

Full-screen overlay, dark gradient background, above everything
(`z-[100]`, rendered via portal to `document.body`).

- Caller's avatar at 128px (group: group avatar or a stacked avatar
  cluster), display name, and "Incoming voice call…" / "Incoming video
  call…". For groups: "Ali, Sara +2".
- Ringtone: a Web Audio oscillator pair (440Hz/480Hz, 2s on / 4s off)
  generated in `lib/ringtone.js` — no audio asset to ship or 404. Also
  fires `navigator.vibrate([500, 1000])` in a loop where supported.
  Autoplay policy: if the `AudioContext` is suspended (no prior user
  gesture on the page), the ringtone is skipped and the visual overlay
  plus vibration still fire — the call is never blocked by audio policy.
- Primary row: **Decline** (red circle) and **Answer** (green circle).
- Secondary row, only for video calls: **Answer as audio** and **Answer
  with video** — so a video call can be picked up without the camera.
- Auto-decline after 30s → `call:rejected` with `reason: 'timeout'` →
  logged as a missed call.

### 1.9 Active call screen

**Top bar** — the other caller's profile image (56px), their name, the
live duration timer (`mm:ss`, `h:mm:ss` past an hour), and a connection
quality dot driven by `RTCPeerConnection.getStats()` packet loss
(green / amber / red). In a group call this becomes a horizontally
scrollable row of participant avatars. A minimize (chevron-down) button
sits at the top-left.

**Body**
- *Audio call, 1-on-1*: large centered avatar; a subtle pulsing ring
  driven by a Web Audio `AnalyserNode` on the remote stream when the
  other person is speaking.
- *Video call, 1-on-1*: remote video full-bleed (`object-cover`); local
  video in a small draggable corner tile, mirrored, tap to swap.
- *Group*: responsive grid of `ParticipantTile`s —
  2 → 1×2 (stacked on mobile), 3–4 → 2×2, 5–8 → 3×3 (2 columns on
  mobile with vertical scroll). Each tile shows the participant's video
  or avatar, their name, a mute badge, and a speaking ring.

**Control bar**

| Control | Behaviour |
|---|---|
| End call | Close every peer connection, `stop()` every local track, emit `call:leave`, write the call log |
| Mute | `audioTrack.enabled = false` + broadcast `call:media-state`; peers show a mute badge |
| Speaker | `HTMLMediaElement.setSinkId()` to switch output device. Feature-detected — if `setSinkId` is missing (Firefox, iOS Safari) the button is **not rendered**, rather than shown as a lie |
| Message | Minimize the call to the pill and `navigate` to the conversation; the call keeps running |
| Camera | Toggle the video track; on a call that started as audio, this adds a video track and renegotiates with every peer |
| Flip camera | `enumerateDevices()`-gated: rendered only when more than one `videoinput` exists |

**Minimized mode** — `MinimizedCallPill`: a draggable rounded pill
(avatar + timer + end button) fixed above the bottom nav, tap to restore.
Media elements are **not unmounted** when minimizing — the `<video>`
elements move with the overlay, which stays mounted the whole time; only
its layout changes. This is what keeps the stream alive.

### 1.10 Call logging

When a call reaches `ended`, the **initiator** (or, if the initiator
dropped, the longest-connected remaining participant) POSTs
`POST /messages/conversations/:id/call-log` with
`{ callType: 'audio'|'video', outcome: 'completed'|'missed'|'declined'|'failed', duration }`.

The server writes a `Message` with `type: 'call'` (already permitted by
the model's enum, `models/Message.js:7`) and a new `callInfo` subdocument
`{ callType, outcome, duration, participants[] }`. Rendered in the thread
as a centered system row: "📞 Audio call · 4:12", "Missed video call",
"Call declined".

On `outcome: 'missed'`, a `Notification` is created for each participant
who never answered — unless that conversation is in their
`callMutedBy` list, which the previous change already added.

### 1.11 Where the buttons live

`MessagesPage.jsx:544-552`: the phone and video buttons get
`onClick={() => startCall(conversation, 'audio' | 'video')}`. They are
enabled for both direct and group conversations, disabled (with a
tooltip) when the conversation has more than 8 participants, when the
page is not in a secure context, or when a call is already in progress.

---

## Part 2 — Chat header three-dot menu

A new `frontend/src/components/message/ChatActionsSheet.jsx` reusing the
existing `ActionSheet` (`components/message/ActionSheet.jsx`), which
already handles the mobile bottom-sheet / desktop centered-modal
responsive split.

Entries, grouped in the sheet with small section labels:

**Chat controls**
- View profile → `/{username}` (direct) or a group members list (group)
- Search in chat → opens the in-chat search bar (see below)
- Mute messages — `messageAPI.muteConversation` *(exists)*
- Mute call notifications — `messageAPI.muteCallNotifications` *(exists)*
- Move to Primary/General — `messageAPI.setConversationFolder` *(exists)*
- Mark as unread — `messageAPI.markConversationUnread` *(exists)*
- Flag — `messageAPI.flagConversation` *(exists)*

**Appearance**
- Chat theme → a color-swatch picker, 6 gradient presets + default
- Nickname → set a per-member nickname (direct: the other person and
  yourself; group: any member)

**Safety**
- Block user (direct only) — `userAPI.blockUser` *(exists)*, behind a
  confirm dialog
- Report (direct only) — existing `ReportModal` with
  `targetType: 'user'`, so no `Report` model change is needed. Group
  chats omit this; individual members are reportable from their profile
- Clear chat — soft-clear for me only
- Delete chat — `messageAPI.deleteConversation` *(exists)*, confirm first
- Leave group (group only) — `messageAPI.leaveGroup` *(exists)*

### 2.1 New backend surface

Only three endpoints are new; everything else already exists.

| Endpoint | Effect |
|---|---|
| `PUT /messages/conversations/:id/theme` | Sets `Conversation.theme` (enum: `default, sunset, ocean, forest, grape, mono`). Shared by all participants, Messenger-style |
| `PUT /messages/conversations/:id/nickname` | Upserts into `Conversation.nicknames: [{ user, nickname }]`; `nickname` max 30 chars, empty string clears it. Shared |
| `DELETE /messages/conversations/:id/messages` | Clear chat **for me only**: pushes the caller into every message's `deletedFor`, and clears their unread count. Does not affect the other participant's copy |

All three verify the caller is a participant of the conversation.

Schema additions to `Conversation` in `backend/models/Message.js`:

```js
theme: { type: String, enum: [...], default: 'default' },
nicknames: [{ user: { type: ObjectId, ref: 'User' }, nickname: { type: String, maxlength: 30 } }],
```

The theme maps to a Tailwind gradient class pair applied to outgoing
message bubbles and the chat header accent. Nicknames replace the
displayed name in the chat header, message group labels, and the
conversation list row — falling back to the real name when unset.

### 2.2 Search in chat — and an honest constraint

Search is **client-side**. This app E2E-encrypts text messages
(`Conversation.isEncrypted`, `e2eController.js`), so the server stores
ciphertext it cannot match against. A server-side `$text` search would
silently return nothing for exactly the conversations users care most
about.

Behaviour: a search bar slides into the chat header; typing filters the
messages already loaded in memory (the same decrypted array the thread
renders), highlighting matches and showing "3 of 12" with up/down
navigation that scrolls to each hit. When the loaded window is exhausted,
a "Search older messages" button pages in the next batch via the existing
`getMessages(conversationId, page)` and re-runs the filter. The user is
told plainly when older messages haven't been searched yet.

This single code path works for encrypted and unencrypted conversations
alike.

---

## Part 3 — Settings → Help sub-pages

### 3.1 Shared content source

Content moves out of the public page components into:

```
frontend/src/content/faq.js          the FAQ categories + questions
frontend/src/content/legal/privacy.js
frontend/src/content/legal/cookies.js
frontend/src/content/legal/terms.js
frontend/src/content/legal/guidelines.js
frontend/src/content/legal/about.js
```

Each legal module exports `{ title, lastUpdated, sections: [{ heading, body }] }`
as structured data (not raw HTML), rendered by a shared
`components/common/LegalDocument.jsx`. Structured data over HTML strings
means no `dangerouslySetInnerHTML` anywhere and consistent typography.

Both the **public** pages (`/privacy`, `/cookies`, `/terms`, `/help`,
wrapped in `PublicHeader`) and the **in-app** Settings pages render from
these same modules, so the two can never drift apart.

The FAQ's search + category-filter + accordion logic is extracted from
`Help.jsx` into a reusable `components/common/FaqBrowser.jsx`, used by
both the public help page and the in-app Help Center.

### 3.2 Settings navigation

`SettingsPage.jsx`'s `HelpSection` becomes a real index, and a new nested
route `/settings/help/:page` renders the sub-page with a mobile back
arrow, matching the existing `mobileShowSection` pattern.

| Item | Route | Renders |
|---|---|---|
| Help Center | `/settings/help/center` | `FaqBrowser`, all categories |
| Privacy & Security Help | `/settings/help/privacy-help` | `FaqBrowser` locked to the privacy category |
| Privacy Policy | `/settings/help/privacy` | `LegalDocument` |
| Cookies Policy | `/settings/help/cookies` | `LegalDocument` |
| Terms of Service | `/settings/help/terms` | `LegalDocument` |
| Community Guidelines | `/settings/help/guidelines` | `LegalDocument` |
| Report a problem | `/settings/help/report` | The feedback form |
| About | `/settings/help/about` | Version, links, credits |

"Support Inbox" is dropped from the list — there is no support-ticket
threading system, and a link to an empty inbox is the same dead end we
are removing. "Report a problem" submissions are the replacement.

### 3.3 Report a problem

The existing `Report` model's `targetType` enum is `['post','user','message']`
(`models/Report.js:6`) — bug reports are not about a target, so reusing it
would mean corrupting that enum. A separate small model instead:

```js
// backend/models/Feedback.js
{
  user: ObjectId ref User,
  category: enum ['bug','abuse','payment','account','suggestion','other'],
  description: String (required, max 2000),
  screenshot: { url, publicId },          // optional, via existing Cloudinary upload
  appVersion: String,
  userAgent: String,                      // captured server-side, not trusted from body
  status: enum ['open','in_progress','resolved','wont_fix'], default 'open',
  adminNote: String,
  handledBy: ObjectId ref User,
  handledAt: Date,
  timestamps: true
}
```

- `POST /api/feedback` (`protect`, rate-limited to 5/hour per user via the
  existing `rateLimiters.js` pattern, screenshot through the existing
  `upload.js` multer + Cloudinary pipeline, images only, ≤5MB).
- `GET /api/feedback/mine` — the submitter's own history, shown under the
  form so a report doesn't vanish into nothing.

The form: category select, description textarea with a live character
counter, optional screenshot with preview and remove, submit with a
disabled/pending state, success toast plus the new item appearing in the
history list below.

### 3.4 Admin panel tab

Fully functional, following the existing `AdminReviews` pattern exactly.

- **Backend**: `GET /admin/feedback` (paginated; filters `status`,
  `category`, free-text `q` on description; sorted newest first),
  `PATCH /admin/feedback/:id` (set `status` and/or `adminNote`, stamps
  `handledBy`/`handledAt`), `DELETE /admin/feedback/:id`. All behind the
  same `...isAdmin` guard array used by `adminRoutes.js:24-25`.
- **Frontend**: `pages/admin/AdminFeedback.jsx`, a `/admin/feedback`
  route in `App.jsx`, and a "Feedback" nav entry in
  `components/admin/AdminLayout.jsx` (`FiInbox`).
- **UI**: status filter tabs with counts (Open / In progress / Resolved /
  Won't fix), a table of rows (user avatar + username, category chip,
  truncated description, relative time, status chip) that expand to show
  the full description, the screenshot (click to enlarge), user agent and
  app version, plus a status dropdown, an admin-note textarea, Save, and
  Delete behind a confirm dialog. Empty and loading states included.
- The dashboard gets an "Open feedback" count card, matching the existing
  cards on `AdminDashboard`.

---

## Responsive design

Every new surface is mobile-first and uses the existing
`--bg-primary/secondary/tertiary`, `--border`, `--text-*` CSS variables,
so light and dark themes come for free.

| Surface | Phone | Tablet | Desktop |
|---|---|---|---|
| Incoming call | Full-screen, buttons in the lower third, `env(safe-area-inset-bottom)` padding, 64px tap targets | Full-screen, centered 480px column | Centered 420px card over a dimmed backdrop |
| Active call | Full-screen; controls in a bottom bar; landscape moves controls to a right-hand vertical rail | Full-screen with a wider grid | Centered 900px stage, floating control bar |
| Group grid | 1 col (2 people) / 2 cols, vertical scroll | 2–3 cols | up to 3 cols |
| Minimized pill | Above the bottom nav, draggable, snaps to edges | same | top-right corner |
| Chat actions sheet | Bottom sheet, scrollable, `max-h-[70vh]` | Bottom sheet | Centered modal (existing `ActionSheet` behaviour) |
| Help sub-pages | Full-width with back arrow, existing `mobileShowSection` pattern | Two-pane | Two-pane, `max-w-[935px]` |
| Admin feedback | Card list (table collapses to stacked cards) | Table, fewer columns | Full table |

Long usernames truncate rather than overflow; the control bar wraps to two
rows below 360px rather than shrinking targets.

---

## Testing

Unit tests (the pure logic — no DOM, no real network):

- `lib/webrtc.js` — ICE config assembly from env, the glare rule's
  determinism and symmetry across a pair, media constraint selection
  (1-on-1 vs group, audio vs video), the ≤8 participant cap.
- The call state machine — every transition in the §1.3 table, including
  the guards: answering while busy, a second inbound call, socket drop
  during `active`, all-peers-rejected, and the 30s timeouts.
- Server signaling handlers — membership authorization (a non-member's
  `call:offer` is dropped), `activeCalls` bookkeeping on join/leave/
  disconnect, and the participant cap.
- Call log outcome selection — completed / missed / declined / failed,
  and which participant is responsible for writing it.
- `Feedback` validation — category enum, description length, rate limit.

Manually verified: the call screens across two browsers, permission
denial paths, the three-dot menu's actions persisting across reload, the
Help sub-pages in both themes, and the admin feedback tab end to end.

---

## Risks

1. **Mesh at 8 with video is genuinely heavy.** Mitigated by low group
   video constraints and bitrate caps; not solved. An SFU is the real
   answer if group video becomes a core feature.
2. **No TURN server means some networks can't connect.** Surfaced as an
   explicit error rather than a hang, and the config is ready for a TURN
   server to be added.
3. **`VITE_*` TURN credentials ship in the client bundle.** Acceptable
   for now with no TURN configured; a short-lived-credential endpoint is
   the documented follow-up before production TURN.
4. **`setSinkId` is unsupported in Firefox and iOS Safari**, so the
   Speaker button will be absent there. Feature detection over a fake
   button is the deliberate choice.
5. **In-memory `activeCalls` doesn't survive a server restart or scale to
   multiple server instances.** Single-instance deployment is the current
   reality; a Redis adapter is the scale-out path.
