# Chat List Long-Press Multi-Select — Design

## Problem

`MessagesPage.jsx` renders the conversation list as plain rows with a single
`onClick` that navigates into the chat. There is no way to act on a
conversation itself (delete, mute, mark unread, flag, move to a folder) —
only on individual messages inside it. Instagram solves this with a
long-press-driven selection mode: holding a row opens a quick-action sheet
for that one chat; selecting more than one switches to a checkbox list with
a top Cancel bar and a bottom bulk-action bar. This change builds that same
interaction, backed by real, working endpoints (not just UI).

Two reference screenshots (Instagram) anchor the exact UI:
- Single selection → bottom sheet titled with the chat's name, listing
  Move to General / Mark as Unread / Flag / Delete / Mute Messages / Mute
  Call Notifications.
- Multiple selection → checkbox on every row, top bar becomes
  Cancel + disabled search + Primary/General/Requests tabs, bottom bar
  shows More · General (N) · Delete (N).

## Goals

- Long-press (touch and mouse) any conversation row to enter selection
  mode; smooth, no accidental triggers while scrolling.
- While in selection mode, tapping a row toggles its checkbox instead of
  opening the chat.
- Exactly one selected → auto-show the single-chat action sheet.
- Two or more selected → show the checkbox list + top/bottom bulk bars.
- All actions are real and persisted via new backend endpoints: delete,
  mark unread, flag, mute messages (existing), mute call notifications,
  move to General/Primary.
- Add the Primary / General / Requests tabs (don't currently exist,
  front or back end) since the multi-select bottom bar's UI depends on
  them (the "General (N)" button's destination is tab-relative) and the
  user explicitly asked for them.
- Fully responsive (mobile bottom-sheet / desktop centered-modal, reusing
  the existing `PostOptionsMenu` responsive pattern) and error-free.

## Non-goals (deferred, not part of this change)

- No explicit Accept/Decline UI for message requests — a request is
  auto-accepted the moment the recipient replies (matches Instagram's
  actual behavior). A dedicated accept/decline screen is not part of the
  two reference screenshots and isn't requested.
- No new bulk-specific backend endpoints — bulk actions call the same
  per-conversation endpoints in parallel (`Promise.all`) from the
  frontend. Keeps the backend surface small; conversation counts in a
  DM inbox are never large enough to need a dedicated bulk route.
- No drag-to-select, no keyboard multi-select (shift/ctrl+click) — only
  long-press and per-row tap-to-toggle, matching the mobile-first
  Instagram pattern the screenshots show.
- No changes to message-level selection/actions (already out of scope,
  this is conversation-level only).

## Backend

### `Conversation` schema additions (`backend/models/Message.js`)

Follows the existing `mutedBy`/`archivedBy` per-user-array convention:

```js
forcedUnreadBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
flaggedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
callMutedBy: [{
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  until: Date,
}],
folderBy: [{
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  folder: { type: String, enum: ['primary', 'general'], default: 'primary' },
}],
pendingFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
```

`deletedBy` already exists on the schema and is already applied as a read
filter in `getConversations` — only the write path is missing.

### New/updated routes (`backend/routes/messageRoutes.js` + `messageController.js`)

```
DELETE /messages/conversations/:id              deletedBy: add req.user._id if absent
POST   /messages/conversations/:id/mark-unread   forcedUnreadBy: toggle
POST   /messages/conversations/:id/flag          flaggedBy: toggle
POST   /messages/conversations/:id/mute-calls    callMutedBy: upsert {user, until}, mirrors existing /mute
POST   /messages/conversations/:id/folder        body {folder: 'primary'|'general'} -> folderBy: upsert
```

All four follow the exact pattern already used by
`muteConversation`/`archiveConversation` in `messageController.js`: find the
conversation, verify `req.user._id` is a participant (403 otherwise), mutate
the per-user array, save, return the updated conversation.

### `getOrCreate` (conversation creation) — request detection

`User.settings.privacy.messageRequests` (`'everyone' | 'followers' |
'noOne'`) already exists on the schema but `getOrCreateConversation` never
reads it — a half-wired preference, same situation as `deletedBy` was. This
change finally applies it: when a **new direct conversation** is created,
if the recipient's `messageRequests` is `'followers'` and the initiator is
not in the recipient's `followers` array, push the recipient into
`pendingFor` (a request). `'noOne'` rejects conversation creation outright
(403) rather than creating a pending request. `'everyone'` (default) never
creates a request. No new relationship model needed — `User.followers` /
`User.following` already exist.

### `sendMessage` — auto-accept on reply

After saving a message, if `req.user._id` is present in
`conversation.pendingFor`, pull them out. This is the only "accept"
mechanism — replying accepts the request, matching Instagram.

### `getConversations` response additions

For the requesting user, compute and include per-conversation:
- `folder`: `'request'` if requester is in `pendingFor`, else the matching
  `folderBy` entry's value, else `'primary'` (default).
- `isFlagged`: requester present in `flaggedBy`.
- `unreadCount`: existing derived count, but forced to at least 1 if
  requester is in `forcedUnreadBy` (and `forcedUnreadBy` is cleared the next
  time `getMessages` is called for that conversation by that user — same
  place the existing read-receipt logic already lives).
- `isCallMuted`: requester present in `callMutedBy` with `until` in the
  future (or no `until`, meaning indefinite) — same shape as the existing
  `mutedBy` check already used for `isMuted`.

## Frontend

### New: `frontend/src/hooks/useLongPress.js`

Reusable hook: `const handlers = useLongPress(onLongPress, { delay: 500 })`.
Attaches `onTouchStart/onTouchEnd/onTouchMove` and
`onMouseDown/onMouseUp/onMouseLeave`. Cancels the pending timer on
`touchmove`/`mouseleave` beyond a small threshold so list-scrolling never
misfires a long-press. Returns a spread-able handlers object, no other
component needs to know about timers.

### New: `frontend/src/components/message/`

- **`ChatListItem.jsx`** — extracted from the current inline `.map()` in
  `MessagesPage.jsx`. Adds: `useLongPress` wiring, a checkbox circle
  (rendered only when `selectionMode` is true, `absolute` positioned over
  the avatar like Instagram, animated fade/scale-in), and a flag icon
  badge next to the timestamp when `isFlagged`. `onClick` behavior branches
  on `selectionMode`: toggle selection vs. navigate.
- **`ConversationActionsSheet.jsx`** — single-chat quick-action sheet
  (screenshot 1). Built on the exact same shell as
  `PostOptionsMenu.jsx`/`ConfirmDialog.jsx` (`.modal-overlay` +
  `absolute bottom-0 ... lg:relative lg:w-[400px] ... animate-slide-up`).
  Title = other participant's name (or group name). Actions array:
  Move to General/Primary (label flips based on current folder) → Mark as
  Unread → Flag/Unflag (label flips based on `isFlagged`) → Delete
  (danger, goes through `useConfirm()`) → Mute/Unmute Messages (label
  flips based on `isMuted`) → Mute/Unmute Call Notifications. Dismissing
  the sheet (backdrop tap) exits selection mode entirely.
- **`SelectionTopBar.jsx`** — replaces the search row while
  `selectionMode` is true: "Cancel" (left) + "`N` selected" + the tabs
  row stays mounted underneath, search input disabled/hidden.
- **`SelectionBottomBar.jsx`** — fixed bar (mobile) / inline bar
  (desktop) with More · `{tab === 'general' ? 'Primary' : 'General'} (N)`
  · Delete (N). "More" opens a small `ConversationActionsSheet`-shell menu
  with bulk-safe actions only: Mark as Read/Unread, Mute Messages, Mute
  Call Notifications (Flag and folder-move are covered by the dedicated
  General/Delete buttons, so More stays short).
- **`MessageTabs.jsx`** — Primary / General / Requests, each with a count
  badge, filtering the already-fetched `conversations` array client-side
  by the `folder` field the backend now returns (no extra network calls
  per tab switch).

### `MessagesPage.jsx` changes

New state: `selectionMode` (bool), `selectedIds` (`Set`), `activeTab`
(`'primary' | 'general' | 'requests'`, default `'primary'`). Selection
handlers (`enterSelection`, `toggleSelect`, `exitSelection`) are plain
functions in the page component — no new Context, matching the existing
`useState` + direct `messageAPI` calls convention (no Redux/Zustand
elsewhere in the app). `selectedIds.size === 0` while `selectionMode` is
true auto-exits selection mode.

Bulk action handlers call the relevant single-conversation endpoint for
every id in `selectedIds` via `Promise.all`, then patch local state and
`toast.success`/`toast.error` — same try/catch-per-handler convention used
everywhere else in this file.

### Responsiveness

No new breakpoint logic: `ConversationActionsSheet` and the bulk "More"
menu reuse `PostOptionsMenu`'s existing `lg:` responsive shell (bottom
sheet under `lg`, centered modal at `lg` and above). `SelectionTopBar`
and `SelectionBottomBar` are plain flex bars that already fit the
existing `md:`/`lg:` container widths `MessagesPage.jsx` uses for its
list pane, so no dedicated mobile/desktop variants are needed there
either.

## Error handling

Every new mutation follows the file's existing pattern: optimistic local
update where cheap (e.g., removing deleted conversations from the list
immediately), rolled back on catch with `toast.error('Failed to ...')`.
Delete (single or bulk) goes through the existing `useConfirm()` dialog
before firing, consistent with how other destructive actions in the app
behave (never a raw `window.confirm`).

## Testing

- Backend: controller tests for the four new endpoints (participant-only
  auth check, toggle correctness, `pendingFor` add-on-create and
  clear-on-reply) alongside the existing `messageController` test file's
  conventions.
- Frontend: `useLongPress` unit test (fires after delay, cancels on
  move/leave). Manual verification in-browser (via the `run` skill) for
  the actual gesture feel on both a touch-emulated mobile viewport and
  desktop mouse, since long-press timing/feel isn't meaningfully
  verifiable through component tests alone.
