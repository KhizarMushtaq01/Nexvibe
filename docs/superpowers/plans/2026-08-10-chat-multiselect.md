# Chat List Long-Press Multi-Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Long-press any conversation row in `MessagesPage.jsx` to enter a selection mode — exactly one selected shows an Instagram-style quick-action sheet (Move to General/Primary, Mark as Unread, Flag, Delete, Mute Messages, Mute Call Notifications); two or more selected shows a checkbox list with a top Cancel bar and a bottom bulk-action bar (More / General·Primary (N) / Delete (N)) — all backed by real, persisted backend endpoints, plus new Primary/General/Requests tabs.

**Architecture:** New per-user array fields on the existing `Conversation` model (`forcedUnreadBy`, `flaggedBy`, `callMutedBy`, `folderBy`, `pendingFor`), five new REST endpoints following the codebase's existing participant-check-then-mutate-array controller pattern, and a `frontend/src/components/message/` folder of small presentational components wired into `MessagesPage.jsx`'s existing `useState`-based (no Redux/Context) data flow.

**Tech Stack:** Express + Mongoose (backend), React 18 + Tailwind + react-icons/fi + react-hot-toast (frontend), Vitest for the one pure-function unit test.

## Global Constraints

- Backend has **no test runner configured anywhere** (zero `.test.js` files under `backend/`) — do not add one; every new endpoint is verified manually (curl/browser), matching the rest of `messageController.js`.
- Frontend has `vitest` configured but **no `@testing-library/react`** and no existing component/hook tests — only pure `lib/` modules are unit-tested. `longPress.js` must be a plain function module (no React APIs) so it fits this convention without adding a new dependency.
- No Redux/Zustand/new React Context — follow `MessagesPage.jsx`'s existing `useState` + direct `messageAPI` calls convention.
- No new bulk-specific backend routes — bulk actions call the existing single-conversation endpoints in parallel via `Promise.all` from the frontend.
- Destructive actions (delete) must go through the existing `useConfirm()` dialog (`frontend/src/context/DialogContext.jsx`), never `window.confirm`.
- Match existing Tailwind conventions: CSS variables (`--bg-primary`, `--text-primary`, `--border`, etc.), the `.modal-overlay` / bottom-sheet shell already used by `PostOptionsMenu.jsx` and `ConfirmDialog.jsx`, icons from `react-icons/fi`.
- Full spec: `docs/superpowers/specs/2026-08-10-chat-multiselect-design.md`.

---

## Task 1: Conversation schema additions

**Files:**
- Modify: `backend/models/Message.js:100-106`

**Interfaces:**
- Produces: `Conversation.forcedUnreadBy`, `Conversation.flaggedBy`, `Conversation.callMutedBy` (`[{user, until}]`), `Conversation.folderBy` (`[{user, folder}]`, `folder` enum `'primary'|'general'`), `Conversation.pendingFor` — all `[ObjectId]` unless noted, used by every later backend task.

- [ ] **Step 1: Add the new fields to the schema**

In `backend/models/Message.js`, replace:

```js
  archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  
}, { timestamps: true });
```

with:

```js
  archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  forcedUnreadBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  flaggedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  callMutedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    until: Date
  }],
  folderBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    folder: { type: String, enum: ['primary', 'general'], default: 'primary' }
  }],
  pendingFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]

}, { timestamps: true });
```

- [ ] **Step 2: Sanity-check the schema loads**

Run from `backend/`:
```bash
node --input-type=module -e "import('./models/Message.js').then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
```
Expected: prints `OK`, exit code 0. (Defining a Mongoose schema/model doesn't require a live DB connection, so this doesn't need Mongo running.)

- [ ] **Step 3: Commit**

```bash
git add backend/models/Message.js
git commit -m "feat: add conversation fields for unread/flag/call-mute/folder/requests"
```

---

## Task 2: Request detection on conversation creation

**Files:**
- Modify: `backend/controllers/messageController.js:34-65` (`getOrCreateConversation`)

**Interfaces:**
- Consumes: `Conversation.pendingFor` (Task 1), `User.following` (existing field).
- Produces: new direct conversations now get `pendingFor: [recipientId]` when the recipient doesn't follow the sender. Task 5/6 (`getConversations`) reads `pendingFor` to compute the `folder` field.

- [ ] **Step 1: Update `getOrCreateConversation`**

Replace the whole function body in `backend/controllers/messageController.js`:

```js
export const getOrCreateConversation = async (req, res) => {
  try {
    const { participantId } = req.body;
    if (!participantId) return res.status(400).json({ success: false, message: 'Participant required' });

    if (participantId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot message yourself' });
    }

    let conversation = await Conversation.findOne({
      type: 'direct',
      participants: { $all: [req.user._id, participantId], $size: 2 }
    })
      .populate('participants', 'username fullName avatar isVerified isOnline lastSeen e2e.identityKey')
      .populate('lastMessage');

    if (!conversation) {
      const recipient = await User.findById(participantId).select('following');
      if (!recipient) return res.status(404).json({ success: false, message: 'User not found' });

      // A message from someone the recipient doesn't follow is a request,
      // matching Instagram's actual rule.
      const recipientFollowsSender = recipient.following.some(id => id.toString() === req.user._id.toString());

      conversation = await Conversation.create({
        participants: [req.user._id, participantId],
        type: 'direct',
        pendingFor: recipientFollowsSender ? [] : [participantId]
      });
      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'username fullName avatar isVerified isOnline lastSeen e2e.identityKey');
    }

    await activateEncryptionIfReady(conversation);

    res.json({ success: true, conversation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 2: Manual verification**

With the backend dev server running (`npm run dev` from the repo root, or `cd backend && npm run dev`), log in as two test users A and B where B does not follow A. As A, call:
```bash
curl -s -X POST http://localhost:5000/api/messages/conversations \
  -H "Content-Type: application/json" -H "Cookie: <A's session cookie>" \
  -d '{"participantId":"<B_USER_ID>"}'
```
Expected: response `conversation.pendingFor` (visible if you also `GET /api/messages/conversations` as B afterward and inspect the raw doc, or temporarily log it) contains B's id. Repeat with a pair where B *does* follow A — `pendingFor` should be empty. (Task 5 exposes this as a computed `folder` field for easier inspection; this step just confirms the raw write path works before that exists.)

- [ ] **Step 3: Commit**

```bash
git add backend/controllers/messageController.js
git commit -m "feat: mark new conversations as pending when recipient doesn't follow sender"
```

---

## Task 3: Auto-accept a pending request on reply

**Files:**
- Modify: `backend/controllers/messageController.js:149-156` (`sendMessage`, top of the function)

**Interfaces:**
- Consumes: `Conversation.pendingFor` (Task 1).
- Produces: replying to a pending conversation clears the sender from `pendingFor`, which Task 5's `getConversations` folder computation depends on to move it out of "Requests".

- [ ] **Step 1: Add the auto-accept mutation**

In `backend/controllers/messageController.js`, in `sendMessage`, replace:

```js
    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    let mediaData = {};
```

with:

```js
    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Replying to a pending request accepts it, matching Instagram's rule.
    // No-op (and no extra save) if the sender isn't in pendingFor.
    conversation.pendingFor?.pull(req.user._id);

    let mediaData = {};
```

- [ ] **Step 2: Manual verification**

Using the same pending conversation from Task 2's verification, have B (the pending recipient) send a message:
```bash
curl -s -X POST "http://localhost:5000/api/messages/conversations/<CONV_ID>/messages" \
  -H "Cookie: <B's session cookie>" -F "type=text" -F "content=hi"
```
Then `GET /api/messages/conversations` as B and confirm the conversation's `folder` is no longer `'request'` once Task 5 is done (for now, this step just confirms the endpoint still returns 201 and doesn't error — full folder verification happens in Task 5's step).

- [ ] **Step 3: Commit**

```bash
git add backend/controllers/messageController.js
git commit -m "feat: auto-accept pending conversation requests on reply"
```

---

## Task 4: Clear forced-unread when a thread is opened

**Files:**
- Modify: `backend/controllers/messageController.js:98-109` (`getMessages`)

**Interfaces:**
- Consumes: `Conversation.forcedUnreadBy` (Task 1).
- Produces: opening a conversation (`GET .../messages`) clears the viewer from `forcedUnreadBy`, so a "Mark as Unread" badge doesn't persist forever once the user actually reads the thread.

- [ ] **Step 1: Clear the flag on open**

In `backend/controllers/messageController.js`, in `getMessages`, replace:

```js
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Opening a thread is the other entry point (besides get-or-create) where
    // encryption can become possible, so run the activation check here too.
    const isEncrypted = await activateEncryptionIfReady(conversation);
```

with:

```js
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (conversation.forcedUnreadBy?.some(id => id.toString() === req.user._id.toString())) {
      conversation.forcedUnreadBy.pull(req.user._id);
      await conversation.save();
    }

    // Opening a thread is the other entry point (besides get-or-create) where
    // encryption can become possible, so run the activation check here too.
    const isEncrypted = await activateEncryptionIfReady(conversation);
```

- [ ] **Step 2: Manual verification**

This is fully exercised once Task 5 (mark-unread endpoint) and Task 8 (frontend list) exist — defer functional verification to Task 16's end-to-end pass. For now, just confirm the file still parses and the backend restarts cleanly (`nodemon` auto-restarts; check its terminal output for a stack trace).

- [ ] **Step 3: Commit**

```bash
git add backend/controllers/messageController.js
git commit -m "feat: clear forced-unread flag when a conversation is opened"
```

---

## Task 5: getConversations response additions (folder, isFlagged, isMuted, isCallMuted, unreadCount)

**Files:**
- Modify: `backend/controllers/messageController.js:69-94` (`getConversations`)

**Interfaces:**
- Consumes: `pendingFor`, `folderBy`, `flaggedBy`, `mutedBy` (existing), `callMutedBy` (all from Task 1, `mutedBy` pre-existing).
- Produces: each conversation object in the `GET /messages/conversations` response gains `folder: 'primary'|'general'|'request'`, `isFlagged: boolean`, `isMuted: boolean`, `isCallMuted: boolean`, and `unreadCount` now accounts for forced-unread. Every later frontend task (7 onward) reads these fields directly by name.

- [ ] **Step 1: Replace `getConversations`**

```js
export const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
      deletedBy: { $ne: req.user._id }
    })
      .populate('participants', 'username fullName avatar isVerified isOnline lastSeen')
      .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'username fullName' } })
      .sort({ lastMessageAt: -1 });

    const uid = req.user._id.toString();
    const now = Date.now();

    const convWithExtras = await Promise.all(conversations.map(async (conv) => {
      const realUnreadCount = await Message.countDocuments({
        conversation: conv._id,
        sender: { $ne: req.user._id },
        readBy: { $not: { $elemMatch: { user: req.user._id } } },
        isDeleted: false
      });

      const isPending = conv.pendingFor?.some(id => id.toString() === uid);
      const folderEntry = conv.folderBy?.find(f => f.user.toString() === uid);
      const folder = isPending ? 'request' : (folderEntry?.folder || 'primary');

      const isFlagged = !!conv.flaggedBy?.some(id => id.toString() === uid);

      const muteEntry = conv.mutedBy?.find(m => m.user.toString() === uid);
      const isMuted = !!muteEntry && (!muteEntry.until || new Date(muteEntry.until).getTime() > now);

      const callMuteEntry = conv.callMutedBy?.find(m => m.user.toString() === uid);
      const isCallMuted = !!callMuteEntry && (!callMuteEntry.until || new Date(callMuteEntry.until).getTime() > now);

      const isForcedUnread = conv.forcedUnreadBy?.some(id => id.toString() === uid);
      const unreadCount = isForcedUnread ? Math.max(realUnreadCount, 1) : realUnreadCount;

      return { ...conv.toObject(), unreadCount, folder, isFlagged, isMuted, isCallMuted };
    }));

    res.json({ success: true, conversations: convWithExtras });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 2: Manual verification**

With the backend running:
```bash
curl -s http://localhost:5000/api/messages/conversations -H "Cookie: <session cookie>" | node -e "process.stdin.resume(); let d=''; process.stdin.on('data', c=>d+=c); process.stdin.on('end', () => { const j = JSON.parse(d); console.log(j.conversations.map(c => ({ id: c._id, folder: c.folder, isFlagged: c.isFlagged, isMuted: c.isMuted, isCallMuted: c.isCallMuted, unreadCount: c.unreadCount }))); });"
```
Expected: every conversation object has `folder` (one of `primary`/`general`/`request`), and boolean `isFlagged`/`isMuted`/`isCallMuted`. The conversation from Task 2/3 where B replied should now show `folder: 'primary'` (no longer `'request'`) for B.

- [ ] **Step 3: Commit**

```bash
git add backend/controllers/messageController.js
git commit -m "feat: return folder, flag, mute, and call-mute state from getConversations"
```

---

## Task 6: New conversation-level action endpoints

**Files:**
- Modify: `backend/controllers/messageController.js` (add 5 new exported functions, after `archiveConversation`, before `getUnreadCount`)
- Modify: `backend/routes/messageRoutes.js`

**Interfaces:**
- Consumes: `deletedBy`, `forcedUnreadBy`, `flaggedBy`, `callMutedBy`, `folderBy` (Task 1); `Message.updateMany` read-receipt pattern (existing, copied from `getMessages`).
- Produces: `deleteConversation`, `markConversationUnread`, `flagConversation`, `muteCallNotifications`, `setConversationFolder` — consumed directly by Task 7's `api.js` additions.

- [ ] **Step 1: Add the five controller functions**

In `backend/controllers/messageController.js`, insert after `archiveConversation` (before the `// @desc    Get unread message count` comment):

```js
// @desc    Delete a conversation (for the requesting user only)
// @route   DELETE /api/messages/conversations/:conversationId
export const deleteConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (!conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (!conversation.deletedBy.includes(req.user._id)) {
      conversation.deletedBy.push(req.user._id);
      await conversation.save();
    }

    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Set a conversation's read/unread state (per-user)
// @route   POST /api/messages/conversations/:conversationId/mark-unread
export const markConversationUnread = async (req, res) => {
  try {
    const { unread } = req.body;
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (!conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (unread) {
      if (!conversation.forcedUnreadBy.includes(req.user._id)) {
        conversation.forcedUnreadBy.push(req.user._id);
        await conversation.save();
      }
    } else {
      conversation.forcedUnreadBy.pull(req.user._id);
      await conversation.save();
      // A blind toggle can't distinguish "genuinely has unread messages"
      // from "only force-flagged" -- explicitly mark real messages read too
      // so "Mark as Read" actually clears a non-zero unread count.
      await Message.updateMany(
        {
          conversation: conversation._id,
          sender: { $ne: req.user._id },
          'readBy.user': { $ne: req.user._id }
        },
        { $addToSet: { readBy: { user: req.user._id, readAt: new Date() } } }
      );
    }

    res.json({ success: true, isUnread: !!unread });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle flag on a conversation
// @route   POST /api/messages/conversations/:conversationId/flag
export const flagConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (!conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const isFlagged = conversation.flaggedBy.includes(req.user._id);
    isFlagged
      ? conversation.flaggedBy.pull(req.user._id)
      : conversation.flaggedBy.push(req.user._id);

    await conversation.save();
    res.json({ success: true, isFlagged: !isFlagged });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mute/unmute call notifications for a conversation
// @route   POST /api/messages/conversations/:conversationId/mute-calls
export const muteCallNotifications = async (req, res) => {
  try {
    const { duration } = req.body; // hours
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (!conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const existing = conversation.callMutedBy.find(m => m.user.toString() === req.user._id.toString());
    if (existing) {
      conversation.callMutedBy = conversation.callMutedBy.filter(m => m.user.toString() !== req.user._id.toString());
    } else {
      conversation.callMutedBy.push({
        user: req.user._id,
        until: duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null
      });
    }

    await conversation.save();
    res.json({ success: true, isCallMuted: !existing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Move a conversation between the Primary and General folders
// @route   POST /api/messages/conversations/:conversationId/folder
export const setConversationFolder = async (req, res) => {
  try {
    const { folder } = req.body;
    if (!['primary', 'general'].includes(folder)) {
      return res.status(400).json({ success: false, message: "folder must be 'primary' or 'general'" });
    }

    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    if (!conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const existing = conversation.folderBy.find(f => f.user.toString() === req.user._id.toString());
    if (existing) {
      existing.folder = folder;
    } else {
      conversation.folderBy.push({ user: req.user._id, folder });
    }

    await conversation.save();
    res.json({ success: true, folder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 2: Wire the routes**

In `backend/routes/messageRoutes.js`, replace:

```js
msgRouter.post('/conversations/:conversationId/mute', protect, msg.muteConversation);
msgRouter.post('/conversations/:conversationId/archive', protect, msg.archiveConversation);
msgRouter.delete('/:messageId', protect, msg.deleteMessage);
```

with:

```js
msgRouter.post('/conversations/:conversationId/mute', protect, msg.muteConversation);
msgRouter.post('/conversations/:conversationId/archive', protect, msg.archiveConversation);
msgRouter.delete('/conversations/:conversationId', protect, msg.deleteConversation);
msgRouter.post('/conversations/:conversationId/mark-unread', protect, msg.markConversationUnread);
msgRouter.post('/conversations/:conversationId/flag', protect, msg.flagConversation);
msgRouter.post('/conversations/:conversationId/mute-calls', protect, msg.muteCallNotifications);
msgRouter.post('/conversations/:conversationId/folder', protect, msg.setConversationFolder);
msgRouter.delete('/:messageId', protect, msg.deleteMessage);
```

- [ ] **Step 3: Manual verification**

With the backend running and a valid session cookie + an existing `CONV_ID` you're a participant of:
```bash
curl -s -X POST "http://localhost:5000/api/messages/conversations/<CONV_ID>/flag" -H "Cookie: <cookie>"
curl -s -X POST "http://localhost:5000/api/messages/conversations/<CONV_ID>/mute-calls" -H "Cookie: <cookie>"
curl -s -X POST "http://localhost:5000/api/messages/conversations/<CONV_ID>/folder" -H "Content-Type: application/json" -H "Cookie: <cookie>" -d '{"folder":"general"}'
curl -s -X POST "http://localhost:5000/api/messages/conversations/<CONV_ID>/mark-unread" -H "Content-Type: application/json" -H "Cookie: <cookie>" -d '{"unread":true}'
curl -s -X DELETE "http://localhost:5000/api/messages/conversations/<CONV_ID>" -H "Cookie: <cookie>"
```
Expected: each returns `{"success":true,...}` with 2xx status. Re-run `GET /api/messages/conversations` — the deleted conversation should be absent from the list.

- [ ] **Step 4: Commit**

```bash
git add backend/controllers/messageController.js backend/routes/messageRoutes.js
git commit -m "feat: add delete/mark-unread/flag/mute-calls/folder conversation endpoints"
```

---

## Task 7: `longPress.js` pure utility (TDD)

**Files:**
- Create: `frontend/src/lib/longPress.js`
- Test: `frontend/src/lib/longPress.test.js`

**Interfaces:**
- Produces: `createLongPressHandlers(onLongPress, { delay?, moveThreshold? })` → `{ onTouchStart, onTouchMove, onTouchEnd, onMouseDown, onMouseMove, onMouseUp, onMouseLeave }`. Consumed by Task 11's `ChatListItem.jsx`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/longPress.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLongPressHandlers } from './longPress.js';

describe('createLongPressHandlers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires onLongPress after the delay on touch', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500 });

    handlers.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('fires onLongPress after the delay on mouse', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500 });

    handlers.onMouseDown({ clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire if released before the delay', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500 });

    handlers.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    vi.advanceTimersByTime(300);
    handlers.onTouchEnd();
    vi.advanceTimersByTime(300);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('cancels if the touch moves past the threshold before the delay', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500, moveThreshold: 10 });

    handlers.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    handlers.onTouchMove({ touches: [{ clientX: 20, clientY: 0 }] });
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not cancel for small movement within the threshold', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500, moveThreshold: 10 });

    handlers.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    handlers.onTouchMove({ touches: [{ clientX: 3, clientY: 3 }] });
    vi.advanceTimersByTime(500);

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('cancels on mouse leave', () => {
    const onLongPress = vi.fn();
    const handlers = createLongPressHandlers(onLongPress, { delay: 500 });

    handlers.onMouseDown({ clientX: 0, clientY: 0 });
    handlers.onMouseLeave();
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`: `npx vitest run src/lib/longPress.test.js`
Expected: FAIL — `Failed to resolve import "./longPress.js"` (file doesn't exist yet).

- [ ] **Step 3: Implement `longPress.js`**

Create `frontend/src/lib/longPress.js`:

```js
export function createLongPressHandlers(onLongPress, { delay = 500, moveThreshold = 10 } = {}) {
  let timer = null;
  let startX = 0;
  let startY = 0;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const start = (x, y) => {
    clear();
    startX = x;
    startY = y;
    timer = setTimeout(() => {
      timer = null;
      onLongPress();
    }, delay);
  };

  const moved = (x, y) => {
    if (!timer) return;
    const dx = Math.abs(x - startX);
    const dy = Math.abs(y - startY);
    if (dx > moveThreshold || dy > moveThreshold) clear();
  };

  return {
    onTouchStart: (e) => {
      const touch = e.touches[0];
      start(touch.clientX, touch.clientY);
    },
    onTouchMove: (e) => {
      const touch = e.touches[0];
      moved(touch.clientX, touch.clientY);
    },
    onTouchEnd: clear,
    onMouseDown: (e) => start(e.clientX, e.clientY),
    onMouseMove: (e) => moved(e.clientX, e.clientY),
    onMouseUp: clear,
    onMouseLeave: clear
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/longPress.test.js`
Expected: PASS, 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/longPress.js frontend/src/lib/longPress.test.js
git commit -m "feat: add createLongPressHandlers utility with tests"
```

---

## Task 8: `messageAPI` client additions

**Files:**
- Modify: `frontend/src/services/api.js:189-203`

**Interfaces:**
- Consumes: the 5 endpoints from Task 6.
- Produces: `messageAPI.deleteConversation(id)`, `.markConversationUnread(id, unread)`, `.flagConversation(id)`, `.muteCallNotifications(id, duration?)`, `.setConversationFolder(id, folder)` — consumed by Tasks 10, 14, 15.

- [ ] **Step 1: Add the methods**

In `frontend/src/services/api.js`, replace:

```js
  muteConversation: (id, duration) => API.post(`/messages/conversations/${id}/mute`, { duration }),
  archiveConversation: (id) => API.post(`/messages/conversations/${id}/archive`),
  getUnreadCount: () => API.get('/messages/unread-count'),
};
```

with:

```js
  muteConversation: (id, duration) => API.post(`/messages/conversations/${id}/mute`, { duration }),
  archiveConversation: (id) => API.post(`/messages/conversations/${id}/archive`),
  deleteConversation: (id) => API.delete(`/messages/conversations/${id}`),
  markConversationUnread: (id, unread) => API.post(`/messages/conversations/${id}/mark-unread`, { unread }),
  flagConversation: (id) => API.post(`/messages/conversations/${id}/flag`),
  muteCallNotifications: (id, duration) => API.post(`/messages/conversations/${id}/mute-calls`, { duration }),
  setConversationFolder: (id, folder) => API.post(`/messages/conversations/${id}/folder`, { folder }),
  getUnreadCount: () => API.get('/messages/unread-count'),
};
```

- [ ] **Step 2: Verify no syntax errors**

Run from `frontend/`: `npx vite build --mode development 2>&1 | head -50` (or just start the dev server and confirm no overlay error). Expected: no import/syntax errors from `api.js`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.js
git commit -m "feat: add conversation action methods to messageAPI"
```

---

## Task 9: `ActionSheet.jsx` generic bottom-sheet component

**Files:**
- Create: `frontend/src/components/message/ActionSheet.jsx`

**Interfaces:**
- Produces: `<ActionSheet title? actions={[{label, danger?, onClick}]} onClose />` — a generic version of `PostOptionsMenu.jsx`'s inline sheet markup, with an optional title row. Consumed by Task 10 (`ConversationActionsSheet`) and Task 14 (`SelectionBottomBar`'s "More" menu).

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/message/ActionSheet.jsx
export default function ActionSheet({ title, actions, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute bottom-0 left-0 right-0 lg:relative lg:w-[400px] bg-[var(--bg-primary)] rounded-t-3xl lg:rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
        {title && (
          <div className="px-5 py-4 border-b border-[var(--border)] text-center">
            <p className="font-bold text-sm truncate">{title}</p>
          </div>
        )}
        {actions.map((action, i) => (
          <button key={i} onClick={action.onClick}
            className={`w-full py-4 px-6 text-center text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]
              ${action.danger ? 'text-red-500 font-bold' : action.label === 'Cancel' ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}
              ${i < actions.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run from `frontend/`: confirm the dev server (or `vite build`) doesn't error on this new file (it has no consumers yet, so this is just a syntax/import check).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/message/ActionSheet.jsx
git commit -m "feat: add generic ActionSheet bottom-sheet component"
```

---

## Task 10: `ConversationActionsSheet.jsx`

**Files:**
- Create: `frontend/src/components/message/ConversationActionsSheet.jsx`

**Interfaces:**
- Consumes: `ActionSheet` (Task 9), `messageAPI.{setConversationFolder,markConversationUnread,flagConversation,deleteConversation,muteConversation,muteCallNotifications}` (Task 8), `useConfirm` from `frontend/src/context/DialogContext.jsx` (existing).
- Produces: `<ConversationActionsSheet conversation title onClose onUpdate onDelete />` where `conversation` is one conversation object from the list state (must include `_id`, `folder`, `unreadCount`, `isFlagged`, `isMuted`, `isCallMuted`), `onUpdate(id, patch)` patches that conversation in the parent's list state, `onDelete(id)` removes it. Consumed by Task 15 (`MessagesPage.jsx`).

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/message/ConversationActionsSheet.jsx
import toast from 'react-hot-toast';
import { messageAPI } from '../../services/api';
import { useConfirm } from '../../context/DialogContext';
import ActionSheet from './ActionSheet';

export default function ConversationActionsSheet({ conversation, title, onClose, onUpdate, onDelete }) {
  const confirmDialog = useConfirm();
  const id = conversation._id;
  const isUnread = conversation.unreadCount > 0;

  const actions = [
    {
      label: conversation.folder === 'general' ? 'Move to Primary' : 'Move to General',
      onClick: async () => {
        const nextFolder = conversation.folder === 'general' ? 'primary' : 'general';
        try {
          await messageAPI.setConversationFolder(id, nextFolder);
          onUpdate(id, { folder: nextFolder });
          toast.success(nextFolder === 'general' ? 'Moved to General' : 'Moved to Primary');
          onClose();
        } catch { toast.error('Failed to move conversation'); }
      }
    },
    {
      label: isUnread ? 'Mark as Read' : 'Mark as Unread',
      onClick: async () => {
        const nextUnread = !isUnread;
        try {
          await messageAPI.markConversationUnread(id, nextUnread);
          onUpdate(id, { unreadCount: nextUnread ? Math.max(conversation.unreadCount, 1) : 0 });
          toast.success(nextUnread ? 'Marked as unread' : 'Marked as read');
          onClose();
        } catch { toast.error('Failed to update'); }
      }
    },
    {
      label: conversation.isFlagged ? 'Unflag' : 'Flag',
      onClick: async () => {
        try {
          const { data } = await messageAPI.flagConversation(id);
          onUpdate(id, { isFlagged: data.isFlagged });
          toast.success(data.isFlagged ? 'Flagged' : 'Unflagged');
          onClose();
        } catch { toast.error('Failed to update'); }
      }
    },
    {
      label: 'Delete', danger: true,
      onClick: async () => {
        if (!(await confirmDialog({ message: 'Delete this chat? This cannot be undone.', danger: true, confirmLabel: 'Delete' }))) return;
        try {
          await messageAPI.deleteConversation(id);
          onDelete(id);
          toast.success('Chat deleted');
        } catch { toast.error('Failed to delete'); }
      }
    },
    {
      label: conversation.isMuted ? 'Unmute Messages' : 'Mute Messages',
      onClick: async () => {
        try {
          const { data } = await messageAPI.muteConversation(id);
          onUpdate(id, { isMuted: data.isMuted });
          toast.success(data.isMuted ? 'Messages muted' : 'Messages unmuted');
          onClose();
        } catch { toast.error('Failed to update'); }
      }
    },
    {
      label: conversation.isCallMuted ? 'Unmute Call Notifications' : 'Mute Call Notifications',
      onClick: async () => {
        try {
          const { data } = await messageAPI.muteCallNotifications(id);
          onUpdate(id, { isCallMuted: data.isCallMuted });
          toast.success(data.isCallMuted ? 'Call notifications muted' : 'Call notifications unmuted');
          onClose();
        } catch { toast.error('Failed to update'); }
      }
    },
    { label: 'Cancel', onClick: onClose },
  ];

  return <ActionSheet title={title} actions={actions} onClose={onClose} />;
}
```

- [ ] **Step 2: Verify it builds**

Confirm the dev server doesn't error on this file (no consumers yet — pure syntax/import check).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/message/ConversationActionsSheet.jsx
git commit -m "feat: add single-conversation quick-action sheet"
```

---

## Task 11: `ChatListItem.jsx`

**Files:**
- Create: `frontend/src/components/message/ChatListItem.jsx`

**Interfaces:**
- Consumes: `createLongPressHandlers` (Task 7), `Avatar` (`frontend/src/components/common/Avatar.jsx`, existing).
- Produces: `<ChatListItem conv isActive currentUserId selectionMode isSelected onOpen onLongPress onToggleSelect formatMsgTime />`. Consumed by Task 15 (`MessagesPage.jsx`), replacing its inline `conversations.map(...)` row JSX.

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/message/ChatListItem.jsx
import { useRef } from 'react';
import { FiCamera, FiVideo, FiLock, FiFlag, FiCheck } from 'react-icons/fi';
import Avatar from '../common/Avatar';
import { createLongPressHandlers } from '../../lib/longPress';

export default function ChatListItem({
  conv, isActive, currentUserId, selectionMode, isSelected,
  onOpen, onLongPress, onToggleSelect, formatMsgTime
}) {
  const other = conv.type === 'group' ? null : conv.participants?.find(p => (p._id || p) !== currentUserId);
  const lastMsg = conv.lastMessage;

  const pressHandlers = useRef(createLongPressHandlers(() => onLongPress(conv._id))).current;

  const handleClick = () => {
    if (selectionMode) onToggleSelect(conv._id);
    else onOpen(conv._id);
  };

  return (
    <div
      onClick={handleClick}
      {...pressHandlers}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors select-none
        ${isActive ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-secondary)]'}`}>
      <div className="relative flex-shrink-0">
        <Avatar
          src={conv.type === 'group' ? conv.groupAvatar : other?.avatar}
          size={56} alt={conv.type === 'group' ? conv.groupName : other?.fullName} />
        {other?.isOnline && !selectionMode && (
          <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[var(--bg-primary)]" />
        )}
        {selectionMode && (
          <div className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all animate-scale-in
            ${isSelected ? 'bg-blue-500 border-[var(--bg-primary)]' : 'bg-[var(--bg-primary)] border-[var(--text-muted)]'}`}>
            {isSelected && <FiCheck className="w-3 h-3 text-white" />}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-sm truncate flex items-center gap-1 ${conv.unreadCount ? 'font-bold' : 'font-semibold'}`}>
            {conv.type === 'group' ? conv.groupName : other?.username}
            {conv.isFlagged && <FiFlag className="w-3 h-3 text-red-500 flex-shrink-0" />}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0 ml-2">
            {conv.lastMessageAt && formatMsgTime(conv.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className={`text-xs truncate flex items-center gap-1 ${conv.unreadCount ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]'}`}>
            {lastMsg?.isUnsent ? 'Message unsent'
              : lastMsg?.type === 'image' ? <><FiCamera className="w-3 h-3 flex-shrink-0" /> Photo</>
              : lastMsg?.type === 'video' ? <><FiVideo className="w-3 h-3 flex-shrink-0" /> Video</>
              : lastMsg?.encrypted ? <><FiLock className="w-3 h-3 flex-shrink-0" /> Encrypted message</>
              : lastMsg?.content || 'Start a conversation'}
          </p>
          {conv.unreadCount > 0 && (
            <span className="ml-2 w-5 h-5 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
              {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Confirm the dev server doesn't error on this file (no consumers yet — pure syntax/import check).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/message/ChatListItem.jsx
git commit -m "feat: add ChatListItem with long-press and selection checkbox"
```

---

## Task 12: `MessageTabs.jsx`

**Files:**
- Create: `frontend/src/components/message/MessageTabs.jsx`

**Interfaces:**
- Produces: `<MessageTabs activeTab onChange counts />` where `activeTab` is `'primary'|'general'|'requests'`, `counts` is `{primary, general, requests}`. Consumed by Task 15.

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/message/MessageTabs.jsx
const TABS = [
  { key: 'primary', label: 'Primary' },
  { key: 'general', label: 'General' },
  { key: 'requests', label: 'Requests' },
];

export default function MessageTabs({ activeTab, onChange, counts }) {
  return (
    <div className="flex border-b border-[var(--border)]">
      {TABS.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 py-2.5 text-sm font-semibold text-center border-b-2 transition-colors
            ${activeTab === tab.key
              ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>
          {tab.label}
          {counts?.[tab.key] > 0 && ` (${counts[tab.key]})`}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Confirm the dev server doesn't error on this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/message/MessageTabs.jsx
git commit -m "feat: add Primary/General/Requests message tabs"
```

---

## Task 13: `SelectionTopBar.jsx`

**Files:**
- Create: `frontend/src/components/message/SelectionTopBar.jsx`

**Interfaces:**
- Produces: `<SelectionTopBar count onCancel />`. Consumed by Task 15.

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/message/SelectionTopBar.jsx
export default function SelectionTopBar({ count, onCancel }) {
  return (
    <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)]">
      <button onClick={onCancel} className="text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--text-secondary)] transition-colors">
        Cancel
      </button>
      <span className="font-bold text-sm">{count} selected</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Confirm the dev server doesn't error on this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/message/SelectionTopBar.jsx
git commit -m "feat: add selection-mode top bar"
```

---

## Task 14: `SelectionBottomBar.jsx`

**Files:**
- Create: `frontend/src/components/message/SelectionBottomBar.jsx`

**Interfaces:**
- Consumes: `ActionSheet` (Task 9).
- Produces: `<SelectionBottomBar count activeTab onDelete onMoveFolder onMarkRead onMarkUnread onMuteMessages onMuteCalls />`. Consumed by Task 15.

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/message/SelectionBottomBar.jsx
import { useState } from 'react';
import ActionSheet from './ActionSheet';

export default function SelectionBottomBar({
  count, activeTab, onDelete, onMoveFolder,
  onMarkRead, onMarkUnread, onMuteMessages, onMuteCalls
}) {
  const [showMore, setShowMore] = useState(false);
  const targetFolder = activeTab === 'general' ? 'primary' : 'general';
  const targetLabel = activeTab === 'general' ? 'Primary' : 'General';

  const moreActions = [
    { label: 'Mark as Read', onClick: () => { onMarkRead(); setShowMore(false); } },
    { label: 'Mark as Unread', onClick: () => { onMarkUnread(); setShowMore(false); } },
    { label: 'Mute Messages', onClick: () => { onMuteMessages(); setShowMore(false); } },
    { label: 'Mute Call Notifications', onClick: () => { onMuteCalls(); setShowMore(false); } },
    { label: 'Cancel', onClick: () => setShowMore(false) },
  ];

  return (
    <div className="flex items-center justify-around border-t border-[var(--border)] bg-[var(--bg-primary)] py-3 px-2 flex-shrink-0">
      <button onClick={() => setShowMore(true)} className="text-sm font-semibold text-[var(--text-primary)] px-3 py-1.5">
        More
      </button>
      <button onClick={() => onMoveFolder(targetFolder)} className="text-sm font-semibold text-[var(--text-primary)] px-3 py-1.5">
        {targetLabel} ({count})
      </button>
      <button onClick={onDelete} className="text-sm font-bold text-red-500 px-3 py-1.5">
        Delete ({count})
      </button>

      {showMore && (
        <ActionSheet title={`${count} selected`} actions={moreActions} onClose={() => setShowMore(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Confirm the dev server doesn't error on this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/message/SelectionBottomBar.jsx
git commit -m "feat: add selection-mode bulk-action bottom bar"
```

---

## Task 15: Wire everything into `MessagesPage.jsx`

**Files:**
- Modify: `frontend/src/pages/main/MessagesPage.jsx`

**Interfaces:**
- Consumes: `ChatListItem` (11), `ConversationActionsSheet` (10), `SelectionTopBar` (13), `SelectionBottomBar` (14), `MessageTabs` (12), `messageAPI.*` (8), `useConfirm` (existing `DialogContext`).

- [ ] **Step 1: Add imports**

At the top of `frontend/src/pages/main/MessagesPage.jsx`, replace:

```js
import { messageAPI, searchAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import Avatar from '../../components/common/Avatar';
import ReportModal from '../../components/common/ReportModal';
```

with:

```js
import { messageAPI, searchAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useConfirm } from '../../context/DialogContext';
import Avatar from '../../components/common/Avatar';
import ReportModal from '../../components/common/ReportModal';
import ChatListItem from '../../components/message/ChatListItem';
import ConversationActionsSheet from '../../components/message/ConversationActionsSheet';
import SelectionTopBar from '../../components/message/SelectionTopBar';
import SelectionBottomBar from '../../components/message/SelectionBottomBar';
import MessageTabs from '../../components/message/MessageTabs';
```

- [ ] **Step 2: Add selection/tab state and derived values**

Replace:

```js
export default function MessagesPage() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { on, joinRoom, leaveRoom, emit } = useSocket();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
```

with:

```js
export default function MessagesPage() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { on, joinRoom, leaveRoom, emit } = useSocket();
  const navigate = useNavigate();
  const confirmDialog = useConfirm();
  const [conversations, setConversations] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('primary');
```

Then, right after the existing `getOtherParticipant` function definition (`const getOtherParticipant = (conv) => { ... };`), add:

```js
  const conversationDisplayName = (conv) => {
    if (conv.type === 'group') return conv.groupName;
    const other = getOtherParticipant(conv);
    return other?.username || other?.fullName || 'Conversation';
  };

  const enterSelection = (id) => { setSelectionMode(true); setSelectedIds(new Set([id])); };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const exitSelection = () => { setSelectionMode(false); setSelectedIds(new Set()); };

  const updateConv = (id, patch) =>
    setConversations(prev => prev.map(c => (c._id === id ? { ...c, ...patch } : c)));

  const removeConv = (id) => setConversations(prev => prev.filter(c => c._id !== id));

  const folderOf = (conv) => conv.folder || 'primary';
  const tabToFolder = { primary: 'primary', general: 'general', requests: 'request' };
  const filteredConversations = conversations.filter(c => folderOf(c) === tabToFolder[activeTab]);
  const tabCounts = {
    primary: conversations.filter(c => folderOf(c) === 'primary').length,
    general: conversations.filter(c => folderOf(c) === 'general').length,
    requests: conversations.filter(c => folderOf(c) === 'request').length,
  };
  const selectedConv = selectedIds.size === 1
    ? conversations.find(c => c._id === [...selectedIds][0])
    : null;

  const bulkDelete = async () => {
    if (!(await confirmDialog({ message: `Delete ${selectedIds.size} chats? This cannot be undone.`, danger: true, confirmLabel: 'Delete' }))) return;
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map(id => messageAPI.deleteConversation(id)));
      setConversations(prev => prev.filter(c => !ids.includes(c._id)));
      toast.success('Chats deleted');
      exitSelection();
    } catch { toast.error('Failed to delete chats'); }
  };

  const bulkMoveFolder = async (folder) => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map(id => messageAPI.setConversationFolder(id, folder)));
      setConversations(prev => prev.map(c => (ids.includes(c._id) ? { ...c, folder } : c)));
      toast.success(folder === 'general' ? 'Moved to General' : 'Moved to Primary');
      exitSelection();
    } catch { toast.error('Failed to move chats'); }
  };

  const bulkMarkRead = async () => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map(id => messageAPI.markConversationUnread(id, false)));
      setConversations(prev => prev.map(c => (ids.includes(c._id) ? { ...c, unreadCount: 0 } : c)));
      toast.success('Marked as read');
      exitSelection();
    } catch { toast.error('Failed to update'); }
  };

  const bulkMarkUnread = async () => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map(id => messageAPI.markConversationUnread(id, true)));
      setConversations(prev => prev.map(c => (ids.includes(c._id) ? { ...c, unreadCount: Math.max(c.unreadCount, 1) } : c)));
      toast.success('Marked as unread');
      exitSelection();
    } catch { toast.error('Failed to update'); }
  };

  const bulkMuteMessages = async () => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map(id => messageAPI.muteConversation(id)));
      toast.success('Updated mute settings');
      exitSelection();
    } catch { toast.error('Failed to update'); }
  };

  const bulkMuteCalls = async () => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map(id => messageAPI.muteCallNotifications(id)));
      toast.success('Updated call notification settings');
      exitSelection();
    } catch { toast.error('Failed to update'); }
  };
```

- [ ] **Step 3: Replace the header + search bar with the selection-aware version**

Replace:

```jsx
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)]">
            <h1 className="font-bold text-lg">{user?.username}</h1>
            <button onClick={() => setNewConvoModal(true)}
              className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
              <FiEdit className="w-5 h-5" />
            </button>
          </div>

          {/* Search bar */}
          <div className="px-4 py-2.5">
            <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] rounded-xl px-3 py-2">
              <FiSearch className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
              <input placeholder="Search messages" className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]" />
            </div>
          </div>
```

with:

```jsx
          {/* Header */}
          {selectionMode ? (
            <SelectionTopBar count={selectedIds.size} onCancel={exitSelection} />
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)]">
                <h1 className="font-bold text-lg">{user?.username}</h1>
                <button onClick={() => setNewConvoModal(true)}
                  className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
                  <FiEdit className="w-5 h-5" />
                </button>
              </div>

              {/* Search bar */}
              <div className="px-4 py-2.5">
                <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] rounded-xl px-3 py-2">
                  <FiSearch className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                  <input placeholder="Search messages" className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]" />
                </div>
              </div>
            </>
          )}

          <MessageTabs activeTab={activeTab} onChange={setActiveTab} counts={tabCounts} />
```

- [ ] **Step 4: Replace the conversation list body**

Replace:

```jsx
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 px-4 gap-3">
                <div className="w-20 h-20 rounded-full border-2 border-[var(--border)] flex items-center justify-center">
                  <FiMessageCircle className="w-9 h-9 text-[var(--text-muted)]" />
                </div>
                <p className="font-bold">Your messages</p>
                <p className="text-sm text-[var(--text-secondary)] text-center">Send private photos and messages to friends.</p>
                <button onClick={() => setNewConvoModal(true)} className="btn-primary px-5 py-2 rounded-xl text-sm mt-1">
                  Send message
                </button>
              </div>
            ) : conversations.map(conv => {
              const other = getOtherParticipant(conv);
              const isActive = conv._id === conversationId;
              const lastMsg = conv.lastMessage;
              return (
                <div key={conv._id}
                  onClick={() => navigate(`/messages/${conv._id}`)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                    ${isActive ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-secondary)]'}`}>
                  <div className="relative flex-shrink-0">
                    <Avatar
                      src={conv.type === 'group' ? conv.groupAvatar : other?.avatar}
                      size={56} alt={conv.type === 'group' ? conv.groupName : other?.fullName} />
                    {other?.isOnline && (
                      <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[var(--bg-primary)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm truncate ${conv.unreadCount ? 'font-bold' : 'font-semibold'}`}>
                        {conv.type === 'group' ? conv.groupName : other?.username}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0 ml-2">
                        {conv.lastMessageAt && formatMsgTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={`text-xs truncate flex items-center gap-1 ${conv.unreadCount ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]'}`}>
                        {lastMsg?.isUnsent ? 'Message unsent'
                          : lastMsg?.type === 'image' ? <><FiCamera className="w-3 h-3 flex-shrink-0" /> Photo</>
                          : lastMsg?.type === 'video' ? <><FiVideo className="w-3 h-3 flex-shrink-0" /> Video</>
                          : lastMsg?.encrypted ? <><FiLock className="w-3 h-3 flex-shrink-0" /> Encrypted message</>
                          : lastMsg?.content || 'Start a conversation'}
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 w-5 h-5 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
                          {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
```

with:

```jsx
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 px-4 gap-3">
                <div className="w-20 h-20 rounded-full border-2 border-[var(--border)] flex items-center justify-center">
                  <FiMessageCircle className="w-9 h-9 text-[var(--text-muted)]" />
                </div>
                <p className="font-bold">Your messages</p>
                <p className="text-sm text-[var(--text-secondary)] text-center">Send private photos and messages to friends.</p>
                <button onClick={() => setNewConvoModal(true)} className="btn-primary px-5 py-2 rounded-xl text-sm mt-1">
                  Send message
                </button>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex items-center justify-center py-16 px-4">
                <p className="text-sm text-[var(--text-muted)]">No conversations here</p>
              </div>
            ) : filteredConversations.map(conv => (
              <ChatListItem
                key={conv._id}
                conv={conv}
                isActive={conv._id === conversationId}
                currentUserId={user?._id}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(conv._id)}
                onOpen={(id) => navigate(`/messages/${id}`)}
                onLongPress={enterSelection}
                onToggleSelect={toggleSelect}
                formatMsgTime={formatMsgTime}
              />
            ))}
          </div>

          {selectionMode && (
            <SelectionBottomBar
              count={selectedIds.size}
              activeTab={activeTab}
              onDelete={bulkDelete}
              onMoveFolder={bulkMoveFolder}
              onMarkRead={bulkMarkRead}
              onMarkUnread={bulkMarkUnread}
              onMuteMessages={bulkMuteMessages}
              onMuteCalls={bulkMuteCalls}
            />
          )}
        </div>
      )}
```

- [ ] **Step 5: Render the single-selection action sheet**

Find the existing `{/* Report message modal */}` block near the end of the JSX (just before the final closing `</div>` of the component's top-level return):

```jsx
      {/* Report message modal */}
      {reportingMessage && (
        <ReportModal
          targetType="message"
          targetId={reportingMessage._id}
          label="Report this message"
          evidenceContent={reportingMessage.content}
          onClose={() => setReportingMessage(null)}
        />
      )}
    </div>
  );
}
```

Replace with:

```jsx
      {/* Report message modal */}
      {reportingMessage && (
        <ReportModal
          targetType="message"
          targetId={reportingMessage._id}
          label="Report this message"
          evidenceContent={reportingMessage.content}
          onClose={() => setReportingMessage(null)}
        />
      )}

      {/* Single-conversation quick-action sheet */}
      {selectedConv && (
        <ConversationActionsSheet
          conversation={selectedConv}
          title={conversationDisplayName(selectedConv)}
          onClose={exitSelection}
          onUpdate={updateConv}
          onDelete={(id) => { removeConv(id); exitSelection(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Manual verification (build + smoke check)**

Run from `frontend/`: start the dev server (`npm run dev`) and confirm the Messages page (`/messages`) loads with no console errors and the conversation list renders. Full interactive verification (long-press, sheet, bulk bar, tabs) happens in Task 16.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/main/MessagesPage.jsx
git commit -m "feat: wire long-press multi-select and tabs into MessagesPage"
```

---

## Task 16: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start both servers**

From the repo root: `npm run dev` (starts backend on :5000 and frontend on :5173 via `concurrently`).

- [ ] **Step 2: Desktop mouse long-press flow**

In a browser at `http://localhost:5173/messages` (desktop viewport), with at least 2 existing conversations:
- Mouse-down and hold on a conversation row for ~500ms → selection mode activates, checkboxes fade in, that row is checked, and the `ConversationActionsSheet` opens showing the chat's name and all 6 actions.
- Click the sheet backdrop → sheet and selection mode both close, list returns to normal.
- Long-press again, then click a *different* row (not the pressed one) → it should toggle to checked, count becomes 2, sheet closes (since count > 1), and `SelectionBottomBar` (More / General(2) / Delete(2)) appears at the bottom along with `SelectionTopBar` (Cancel / "2 selected") at the top.
- Click "Cancel" → returns to normal mode, no rows checked.

- [ ] **Step 3: Action verification**

- Long-press a conversation → click "Flag" in the sheet → toast confirms, re-open the sheet on the same conversation → label now reads "Unflag", and a small flag icon appears next to the chat name in the list.
- Long-press → "Delete" → confirm dialog appears → confirm → conversation disappears from the list and from the backend (`GET /api/messages/conversations` no longer includes it).
- Long-press → "Move to General" → toast confirms → switch to the "General" tab → the conversation now appears there; switch back to "Primary" → it's gone from Primary.
- Long-press → "Mute Call Notifications" → re-open sheet → label reads "Unmute Call Notifications".
- Select 2+ conversations → click "More" → "Mark as Unread" → both rows show an unread badge and bold name; re-open "More" → "Mark as Read" → badges clear.

- [ ] **Step 4: Requests tab**

Using two test accounts where B does not follow A: as A, start a new conversation with B (via the "New message" pencil icon) and send a message. As B, open `/messages` → the conversation should appear under the "Requests" tab, not "Primary". As B, reply to it → refresh → it now appears under "Primary" and is gone from "Requests".

- [ ] **Step 5: Mobile viewport / touch**

Using the browser's device toolbar (e.g. Chrome DevTools, ~375px width, touch simulation on) or a real touch device: repeat the long-press flow from Step 2 using touch-and-hold instead of mouse-hold. Confirm: no accidental selection while scrolling the list with a swipe, the bottom bar and top bar render full-width and don't overlap the message-input area, and the sheet renders as a bottom sheet (not a centered modal) at this width.

- [ ] **Step 6: Regression check**

Confirm normal (non-selection) behavior still works: tapping/clicking a conversation row (when not in selection mode) still navigates to and opens that chat; sending a message still works; the "New message" modal still works.

- [ ] **Step 7: Report results**

No commit for this task — if all checks pass, the feature is complete. If any check fails, fix the specific issue in the relevant task's file and re-verify.
