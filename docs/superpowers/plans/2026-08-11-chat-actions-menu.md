# Chat Header Actions Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three-dot button in the chat header open a working actions sheet — chat controls, appearance (theme + nicknames) and safety actions — where every entry persists to the backend.

**Architecture:** A new `ChatActionsSheet` built on the existing `ActionSheet` component, wired to the conversation endpoints that already exist plus three new ones (theme, nickname, clear chat). In-chat message search is client-side over the already-decrypted message array, because this app E2E-encrypts message text and the server cannot match on it.

**Tech Stack:** React 18 + Tailwind + react-icons/fi + react-hot-toast (frontend), Express + Mongoose (backend), Vitest for pure-module tests.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-08-11-calling-chat-shortcuts-help-design.md`. Read it before starting.
- **Depends on nothing else** — this plan is independent of the calling plan and can be built before or after it. The only overlap is `MessagesPage.jsx:550-552` (the three-dot button), which the calling plan leaves untouched.
- **Testing convention:** this repo unit-tests only pure modules (`frontend/src/lib/*.test.js`); there is no `@testing-library/react`. Do not add component tests or new dependencies.
- **Frontend test command:** run from `frontend/`: `npx vitest run src/lib/<file>.test.js`
- **Every action must persist.** No entry may be a toast-only placeholder. If an action cannot be made real, it does not ship.
- **Authorization:** every new backend endpoint must go through the existing `loadParticipantConversation` helper (`backend/controllers/messageController.js:29`), which 404s an unknown conversation and 403s a non-participant.
- **Styling:** existing CSS variables only (`var(--bg-primary)`, `var(--bg-tertiary)`, `var(--border)`, `var(--text-muted)`, …). Icons from `react-icons/fi`.
- **Commit after every task.**

---

### Task 1: Backend — chat theme, nicknames and clear-chat

**Files:**
- Modify: `backend/models/Message.js` (add `theme` and `nicknames` to `conversationSchema`)
- Modify: `backend/controllers/messageController.js` (add three controllers)
- Modify: `backend/routes/messageRoutes.js` (add three routes)
- Create: `backend/lib/chatTheme.js`
- Test: `backend/lib/chatTheme.test.js`

**Interfaces:**
- Consumes: existing `loadParticipantConversation`.
- Produces:
  - `CHAT_THEMES: string[]` and `isValidTheme(name) => boolean` from `backend/lib/chatTheme.js`
  - `PUT /api/messages/conversations/:conversationId/theme` body `{ theme }` → `{ success, theme }`
  - `PUT /api/messages/conversations/:conversationId/nickname` body `{ userId, nickname }` → `{ success, nicknames }`
  - `DELETE /api/messages/conversations/:conversationId/messages` → `{ success, cleared: number }`

- [ ] **Step 1: Add Vitest to the backend if it is not already there**

Check `backend/package.json` for a `test` script. If absent, run from `backend/`: `npm install --save-dev vitest@^4.1.10`, then add to `scripts`:

```json
    "test": "vitest run"
```

(If the calling plan already landed, this is done — skip.)

- [ ] **Step 2: Write the failing test**

Create `backend/lib/chatTheme.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { CHAT_THEMES, isValidTheme, sanitizeNickname } from './chatTheme.js';

describe('CHAT_THEMES', () => {
  it('offers the default plus five presets', () => {
    expect(CHAT_THEMES).toEqual(['default', 'sunset', 'ocean', 'forest', 'grape', 'mono']);
  });
});

describe('isValidTheme', () => {
  it('accepts a known theme', () => expect(isValidTheme('ocean')).toBe(true));
  it('rejects an unknown theme', () => expect(isValidTheme('neon')).toBe(false));
  it('rejects a non-string', () => expect(isValidTheme(null)).toBe(false));
  it('does not accept a prototype key as a theme', () => expect(isValidTheme('constructor')).toBe(false));
});

describe('sanitizeNickname', () => {
  it('trims surrounding whitespace', () => expect(sanitizeNickname('  Ali  ')).toBe('Ali'));
  it('collapses internal whitespace runs', () => expect(sanitizeNickname('Ali    Khan')).toBe('Ali Khan'));
  it('truncates to 30 characters', () => expect(sanitizeNickname('x'.repeat(50))).toHaveLength(30));
  it('returns an empty string for whitespace only, which clears the nickname', () => {
    expect(sanitizeNickname('   ')).toBe('');
  });
  it('returns an empty string for a non-string', () => expect(sanitizeNickname(undefined)).toBe(''));
  it('strips control characters that would break rendering', () => {
    expect(sanitizeNickname('Ali\nKhan')).toBe('Ali Khan');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `backend/`: `npx vitest run lib/chatTheme.test.js`
Expected: FAIL — cannot resolve `./chatTheme.js`.

- [ ] **Step 4: Write the implementation**

Create `backend/lib/chatTheme.js`:

```js
export const CHAT_THEMES = ['default', 'sunset', 'ocean', 'forest', 'grape', 'mono'];

// Array membership rather than an object lookup, so keys inherited from
// Object.prototype ('constructor', 'toString') can never validate.
export const isValidTheme = (name) => typeof name === 'string' && CHAT_THEMES.includes(name);

/**
 * Nicknames are rendered in the header, the thread and the chat list, so
 * control characters and newlines have to go -- they would break layout
 * and could be used to spoof UI text.
 */
// Written as a code-point filter rather than a regex character class so
// there are no escape sequences to mangle: anything below space, plus DEL,
// becomes a space, which the whitespace collapse below then folds away.
const controlCharsToSpace = (s) =>
  [...s].map(ch => {
    const code = ch.charCodeAt(0);
    return (code < 32 || code === 127) ? ' ' : ch;
  }).join('');

export const sanitizeNickname = (raw) => {
  if (typeof raw !== 'string') return '';
  return controlCharsToSpace(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `backend/`: `npx vitest run lib/chatTheme.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 6: Extend the Conversation schema**

In `backend/models/Message.js`, inside `conversationSchema`, add after the `pendingFor` field (line 121):

```js
  // Shared by every participant, matching how Messenger treats chat themes
  // and nicknames -- changing one changes it for everyone in the chat.
  theme: { type: String, enum: ['default', 'sunset', 'ocean', 'forest', 'grape', 'mono'], default: 'default' },
  nicknames: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    nickname: { type: String, maxlength: 30 }
  }]
```

- [ ] **Step 7: Add the three controllers**

In `backend/controllers/messageController.js`, add the import at the top:

```js
import { isValidTheme, sanitizeNickname } from '../lib/chatTheme.js';
```

and append these functions at the end of the file:

```js
export const setConversationTheme = async (req, res) => {
  try {
    const { theme } = req.body;
    if (!isValidTheme(theme)) {
      return res.status(400).json({ success: false, message: 'Unknown theme' });
    }

    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    conversation.theme = theme;
    await conversation.save();

    res.json({ success: true, theme });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const setNickname = async (req, res) => {
  try {
    const { userId } = req.body;
    const nickname = sanitizeNickname(req.body.nickname);

    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    // A nickname can only be set for someone actually in this chat.
    if (!conversation.participants.some(p => p.toString() === String(userId))) {
      return res.status(400).json({ success: false, message: 'That user is not in this chat' });
    }

    conversation.nicknames = conversation.nicknames.filter(n => n.user.toString() !== String(userId));
    // An empty nickname means "clear it", so only push a non-empty one.
    if (nickname) conversation.nicknames.push({ user: userId, nickname });

    await conversation.save();
    res.json({ success: true, nicknames: conversation.nicknames });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// "Clear chat" hides the history for the caller only. The other participant
// keeps their copy -- deleting their messages out from under them is not
// something one side gets to decide.
export const clearConversationMessages = async (req, res) => {
  try {
    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    const result = await Message.updateMany(
      { conversation: conversation._id, deletedFor: { $ne: req.user._id } },
      { $addToSet: { deletedFor: req.user._id } }
    );

    // Unread is derived by counting messages this user has not read
    // (getConversations, messageController.js:129-134) -- that query does NOT
    // exclude `deletedFor`, so without also marking them read a cleared chat
    // would sit in the list showing a permanent unread badge for messages the
    // user can no longer open.
    await Message.updateMany(
      {
        conversation: conversation._id,
        sender: { $ne: req.user._id },
        readBy: { $not: { $elemMatch: { user: req.user._id } } }
      },
      { $push: { readBy: { user: req.user._id, readAt: new Date() } } }
    );

    conversation.forcedUnreadBy.pull(req.user._id);
    await conversation.save();

    res.json({ success: true, cleared: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

Note: `theme` and `nicknames` are shared, not per-user, so they must **not** be added to `PRIVATE_PER_USER_FIELDS` (`messageController.js:16`) — that list is stripped from every conversation response, and these two need to reach the client.

- [ ] **Step 8: Add the routes**

In `backend/routes/messageRoutes.js`, after line 22:

```js
msgRouter.put('/conversations/:conversationId/theme', protect, msg.setConversationTheme);
msgRouter.put('/conversations/:conversationId/nickname', protect, msg.setNickname);
msgRouter.delete('/conversations/:conversationId/messages', protect, msg.clearConversationMessages);
```

- [ ] **Step 9: Verify the endpoints by hand**

Start the app (`npm run dev` from the repo root). Logged in with a browser session, open devtools console on the app and run:

```js
await fetch('/api/messages/conversations/<CONVERSATION_ID>/theme', {
  method: 'PUT', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ theme: 'ocean' })
}).then(r => r.json());
```

Expected: `{ success: true, theme: 'ocean' }`. Repeat with `{ theme: 'neon' }` and expect a 400. Repeat with a conversation id you are not a participant of and expect a 403.

- [ ] **Step 10: Commit**

```bash
git add backend/lib/chatTheme.js backend/lib/chatTheme.test.js backend/models/Message.js backend/controllers/messageController.js backend/routes/messageRoutes.js backend/package.json backend/package-lock.json
git commit -m "feat: add chat theme, nickname and clear-chat endpoints"
```

---

### Task 2: Frontend theme presets and API client methods

**Files:**
- Create: `frontend/src/lib/chatTheme.js`
- Test: `frontend/src/lib/chatTheme.test.js`
- Modify: `frontend/src/services/api.js` (three new `messageAPI` methods)

**Interfaces:**
- Consumes: the endpoints from Task 1.
- Produces:
  - `CHAT_THEMES: Array<{ key, label, bubble, swatch }>`
  - `bubbleClassFor(themeKey) => string` — Tailwind classes for an outgoing bubble
  - `swatchClassFor(themeKey) => string`
  - `nicknameFor(conversation, userId) => string | null`
  - `displayNameFor(conversation, user) => string`
  - `messageAPI.setChatTheme`, `messageAPI.setNickname`, `messageAPI.clearChat`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/chatTheme.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { CHAT_THEMES, bubbleClassFor, swatchClassFor, nicknameFor, displayNameFor } from './chatTheme.js';

describe('CHAT_THEMES', () => {
  it('has six presets, each with a key, label, bubble and swatch', () => {
    expect(CHAT_THEMES).toHaveLength(6);
    for (const t of CHAT_THEMES) {
      expect(t.key).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.bubble).toBeTruthy();
      expect(t.swatch).toBeTruthy();
    }
  });

  it('starts with the default theme', () => expect(CHAT_THEMES[0].key).toBe('default'));

  it('has unique keys', () => {
    const keys = CHAT_THEMES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('bubbleClassFor', () => {
  it('returns the matching preset classes', () => {
    expect(bubbleClassFor('ocean')).toBe(CHAT_THEMES.find(t => t.key === 'ocean').bubble);
  });

  it('falls back to the default for an unknown or missing theme', () => {
    const fallback = CHAT_THEMES[0].bubble;
    expect(bubbleClassFor('neon')).toBe(fallback);
    expect(bubbleClassFor(undefined)).toBe(fallback);
    expect(bubbleClassFor(null)).toBe(fallback);
  });
});

describe('swatchClassFor', () => {
  it('returns the matching swatch', () => {
    expect(swatchClassFor('sunset')).toBe(CHAT_THEMES.find(t => t.key === 'sunset').swatch);
  });
  it('falls back to the default swatch', () => expect(swatchClassFor('nope')).toBe(CHAT_THEMES[0].swatch));
});

describe('nicknameFor', () => {
  const conv = { nicknames: [{ user: 'u1', nickname: 'Chotu' }, { user: { _id: 'u2' }, nickname: 'Boss' }] };

  it('finds a nickname stored with a plain id', () => expect(nicknameFor(conv, 'u1')).toBe('Chotu'));
  it('finds a nickname stored with a populated user', () => expect(nicknameFor(conv, 'u2')).toBe('Boss'));
  it('returns null when the user has no nickname', () => expect(nicknameFor(conv, 'u3')).toBeNull());
  it('returns null for a conversation with no nicknames array', () => expect(nicknameFor({}, 'u1')).toBeNull());
  it('returns null for a missing conversation', () => expect(nicknameFor(null, 'u1')).toBeNull());
});

describe('displayNameFor', () => {
  const conv = { nicknames: [{ user: 'u1', nickname: 'Chotu' }] };

  it('prefers the nickname', () => {
    expect(displayNameFor(conv, { _id: 'u1', username: 'ali', fullName: 'Ali Khan' })).toBe('Chotu');
  });

  it('falls back to the username', () => {
    expect(displayNameFor(conv, { _id: 'u9', username: 'ali', fullName: 'Ali Khan' })).toBe('ali');
  });

  it('falls back to the full name when there is no username', () => {
    expect(displayNameFor(conv, { _id: 'u9', fullName: 'Ali Khan' })).toBe('Ali Khan');
  });

  it('degrades to "Unknown" rather than rendering undefined', () => {
    expect(displayNameFor(conv, {})).toBe('Unknown');
    expect(displayNameFor(conv, null)).toBe('Unknown');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`: `npx vitest run src/lib/chatTheme.test.js`
Expected: FAIL — cannot resolve `./chatTheme.js`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/chatTheme.js`:

```js
// Chat themes recolour the outgoing message bubble only -- the surrounding
// chrome stays on the app's CSS variables so light/dark keeps working.
// Keys must stay in sync with backend/lib/chatTheme.js and the enum on
// conversationSchema.theme.

export const CHAT_THEMES = [
  { key: 'default', label: 'Default', bubble: 'bg-blue-500 text-white',                                    swatch: 'bg-blue-500' },
  { key: 'sunset',  label: 'Sunset',  bubble: 'bg-gradient-to-br from-pink-500 to-orange-400 text-white',  swatch: 'bg-gradient-to-br from-pink-500 to-orange-400' },
  { key: 'ocean',   label: 'Ocean',   bubble: 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white',    swatch: 'bg-gradient-to-br from-cyan-500 to-blue-600' },
  { key: 'forest',  label: 'Forest',  bubble: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white', swatch: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
  { key: 'grape',   label: 'Grape',   bubble: 'bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white', swatch: 'bg-gradient-to-br from-violet-500 to-fuchsia-600' },
  { key: 'mono',    label: 'Mono',    bubble: 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900', swatch: 'bg-neutral-800' },
];

const themeOf = (key) => CHAT_THEMES.find(t => t.key === key) || CHAT_THEMES[0];

export const bubbleClassFor = (key) => themeOf(key).bubble;
export const swatchClassFor = (key) => themeOf(key).swatch;

const idOf = (value) => String(value?._id ?? value ?? '');

export const nicknameFor = (conversation, userId) => {
  const entry = conversation?.nicknames?.find(n => idOf(n.user) === String(userId));
  return entry?.nickname || null;
};

export const displayNameFor = (conversation, user) =>
  nicknameFor(conversation, user?._id) || user?.username || user?.fullName || 'Unknown';
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `frontend/`: `npx vitest run src/lib/chatTheme.test.js`
Expected: PASS, 16 tests.

- [ ] **Step 5: Add the API client methods**

In `frontend/src/services/api.js`, inside `messageAPI` after `getUnreadCount` (line 207):

```js
  setChatTheme: (id, theme) => API.put(`/messages/conversations/${id}/theme`, { theme }),
  setNickname: (id, userId, nickname) => API.put(`/messages/conversations/${id}/nickname`, { userId, nickname }),
  clearChat: (id) => API.delete(`/messages/conversations/${id}/messages`),
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/chatTheme.js frontend/src/lib/chatTheme.test.js frontend/src/services/api.js
git commit -m "feat: add chat theme presets, nickname helpers and API client methods"
```

---

### Task 3: Section support in `ActionSheet`

The current `ActionSheet` renders a flat list. The chat menu has three labelled groups, so it needs section headers — added in a way that leaves every existing caller working unchanged.

**Files:**
- Modify: `frontend/src/components/message/ActionSheet.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ActionSheet` accepts an action entry of the form `{ section: string }` which renders as a header row instead of a button. Existing entries (`{ label, onClick, danger }`) behave exactly as before.

- [ ] **Step 1: Add the section branch**

In `frontend/src/components/message/ActionSheet.jsx`, replace the `actions.map(...)` block with:

```jsx
        {actions.map((action, i) => (
          action.section ? (
            // A section header, not a choice -- rendered as a non-interactive
            // label so the sheet can group related actions.
            <div key={`section-${i}`}
              className="px-6 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] bg-[var(--bg-secondary)]">
              {action.section}
            </div>
          ) : (
            <button key={i} onClick={action.onClick} disabled={action.disabled}
              className={`w-full py-4 px-6 text-center text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed
                ${action.danger ? 'text-red-500 font-bold' : action.label === 'Cancel' ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}
                ${i < actions.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
              {action.label}
            </button>
          )
        ))}
```

- [ ] **Step 2: Verify the existing sheet still works**

Run from `frontend/`: `npm run build` → succeeds.

Then in the app, long-press a conversation row in the message list and confirm the existing `ConversationActionsSheet` looks and behaves exactly as before (no section headers, all six actions work).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/message/ActionSheet.jsx
git commit -m "feat: support section headers and disabled entries in ActionSheet"
```

---

### Task 4: `ChatActionsSheet`

**Files:**
- Create: `frontend/src/components/message/ChatActionsSheet.jsx`
- Create: `frontend/src/components/message/ChatThemePicker.jsx`
- Create: `frontend/src/components/message/NicknameDialog.jsx`

**Interfaces:**
- Consumes: `ActionSheet` (Task 3), `chatTheme.js` + `messageAPI` (Task 2), existing `useConfirm`, `ReportModal`, `userAPI.blockUser`.
- Produces:
  ```jsx
  <ChatActionsSheet
    conversation      // the active conversation object
    currentUserId
    onClose
    onUpdate={(id, patch) => void}   // merge a patch into the conversation
    onDelete={(id) => void}          // conversation removed entirely
    onClearMessages={() => void}     // wipe the loaded message array
    onSearch={() => void}            // open the in-chat search bar
  />
  ```

- [ ] **Step 1: Write the theme picker**

Create `frontend/src/components/message/ChatThemePicker.jsx`:

```jsx
import { useState } from 'react';
import toast from 'react-hot-toast';
import { messageAPI } from '../../services/api';
import { CHAT_THEMES, swatchClassFor } from '../../lib/chatTheme';
import { FiCheck, FiX } from 'react-icons/fi';

export default function ChatThemePicker({ conversation, onClose, onUpdate }) {
  const [saving, setSaving] = useState(null);
  const current = conversation.theme || 'default';

  const pick = async (key) => {
    if (key === current) { onClose(); return; }
    setSaving(key);
    try {
      await messageAPI.setChatTheme(conversation._id, key);
      onUpdate(conversation._id, { theme: key });
      toast.success('Chat theme updated');
      onClose();
    } catch {
      toast.error('Failed to update theme');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full lg:w-[400px] bg-[var(--bg-primary)] rounded-t-3xl lg:rounded-2xl p-5 animate-slide-up"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm">Chat theme</h3>
          <button onClick={onClose} aria-label="Close"><FiX className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {CHAT_THEMES.map(t => (
            <button
              key={t.key}
              onClick={() => pick(t.key)}
              disabled={saving !== null}
              className="flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
            >
              <span className={`w-12 h-12 rounded-full ${swatchClassFor(t.key)} flex items-center justify-center`}>
                {current === t.key && <FiCheck className="w-5 h-5 text-white" />}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">{t.label}</span>
            </button>
          ))}
        </div>

        <p className="text-xs text-[var(--text-muted)] mt-4 text-center">
          The theme applies for everyone in this chat.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the nickname dialog**

Create `frontend/src/components/message/NicknameDialog.jsx`:

```jsx
import { useState } from 'react';
import toast from 'react-hot-toast';
import { messageAPI } from '../../services/api';
import { nicknameFor } from '../../lib/chatTheme';
import Avatar from '../common/Avatar';
import { FiX } from 'react-icons/fi';

export default function NicknameDialog({ conversation, onClose, onUpdate }) {
  const members = conversation.participants || [];
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(members.map(m => [String(m._id || m), nicknameFor(conversation, m._id || m) || '']))
  );
  const [savingId, setSavingId] = useState(null);

  const save = async (member) => {
    const userId = String(member._id || member);
    setSavingId(userId);
    try {
      const { data } = await messageAPI.setNickname(conversation._id, userId, drafts[userId]);
      onUpdate(conversation._id, { nicknames: data.nicknames });
      toast.success(drafts[userId] ? 'Nickname saved' : 'Nickname cleared');
    } catch {
      toast.error('Failed to save nickname');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full lg:w-[440px] max-h-[80vh] overflow-y-auto bg-[var(--bg-primary)] rounded-t-3xl lg:rounded-2xl p-5 animate-slide-up"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm">Nicknames</h3>
          <button onClick={onClose} aria-label="Close"><FiX className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          {members.map(m => {
            const userId = String(m._id || m);
            return (
              <div key={userId} className="flex items-center gap-3">
                <Avatar src={m.avatar} size={40} alt={m.fullName} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-muted)] truncate">@{m.username}</p>
                  <input
                    value={drafts[userId] ?? ''}
                    maxLength={30}
                    placeholder="Set nickname"
                    onChange={(e) => setDrafts(prev => ({ ...prev, [userId]: e.target.value }))}
                    className="w-full bg-transparent border-b border-[var(--border)] py-1 text-sm focus:outline-none focus:border-pink-500"
                  />
                </div>
                <button
                  onClick={() => save(m)}
                  disabled={savingId === userId}
                  className="btn-outline text-xs px-3 py-1.5 flex-shrink-0 disabled:opacity-50"
                >
                  {savingId === userId ? 'Saving…' : 'Save'}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-[var(--text-muted)] mt-4">
          Nicknames are visible to everyone in this chat. Clear the field and save to remove one.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the actions sheet**

Create `frontend/src/components/message/ChatActionsSheet.jsx`:

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { messageAPI, userAPI } from '../../services/api';
import { useConfirm } from '../../context/DialogContext';
import ActionSheet from './ActionSheet';
import ChatThemePicker from './ChatThemePicker';
import NicknameDialog from './NicknameDialog';
import ReportModal from '../common/ReportModal';

export default function ChatActionsSheet({
  conversation, currentUserId, onClose, onUpdate, onDelete, onClearMessages, onSearch,
}) {
  const confirmDialog = useConfirm();
  const navigate = useNavigate();
  const [subview, setSubview] = useState(null); // 'theme' | 'nickname' | 'report'

  const id = conversation._id;
  const isGroup = conversation.type === 'group';
  const other = isGroup
    ? null
    : conversation.participants?.find(p => String(p._id || p) !== String(currentUserId));
  const isUnread = (conversation.unreadCount || 0) > 0;

  // Every handler that mutates keeps the sheet open only long enough to
  // report the result -- toast then close, so the user always gets feedback.
  const run = async (fn, { success, failure, keepOpen = false }) => {
    try {
      const result = await fn();
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
      if (!keepOpen) onClose();
      return result;
    } catch (err) {
      toast.error(err?.response?.data?.message || failure);
      return null;
    }
  };

  const actions = [
    { section: 'Chat' },
    {
      label: isGroup ? 'View members' : 'View profile',
      onClick: () => {
        onClose();
        if (isGroup) toast('Open the group info from the chat list to manage members');
        else if (other?.username) navigate(`/${other.username}`);
      },
    },
    { label: 'Search in chat', onClick: () => { onClose(); onSearch(); } },
    {
      label: conversation.isMuted ? 'Unmute messages' : 'Mute messages',
      onClick: () => run(
        async () => {
          const { data } = await messageAPI.muteConversation(id);
          onUpdate(id, { isMuted: data.isMuted });
          return data;
        },
        { success: (d) => (d.isMuted ? 'Messages muted' : 'Messages unmuted'), failure: 'Failed to update' }
      ),
    },
    {
      label: conversation.isCallMuted ? 'Unmute call notifications' : 'Mute call notifications',
      onClick: () => run(
        async () => {
          const { data } = await messageAPI.muteCallNotifications(id);
          onUpdate(id, { isCallMuted: data.isCallMuted });
          return data;
        },
        { success: (d) => (d.isCallMuted ? 'Call notifications muted' : 'Call notifications unmuted'), failure: 'Failed to update' }
      ),
    },
    {
      label: conversation.folder === 'general' ? 'Move to Primary' : 'Move to General',
      onClick: () => {
        const nextFolder = conversation.folder === 'general' ? 'primary' : 'general';
        return run(
          async () => {
            await messageAPI.setConversationFolder(id, nextFolder);
            onUpdate(id, { folder: nextFolder });
          },
          { success: nextFolder === 'general' ? 'Moved to General' : 'Moved to Primary', failure: 'Failed to move conversation' }
        );
      },
    },
    {
      label: isUnread ? 'Mark as read' : 'Mark as unread',
      onClick: () => {
        const nextUnread = !isUnread;
        return run(
          async () => {
            await messageAPI.markConversationUnread(id, nextUnread);
            onUpdate(id, { unreadCount: nextUnread ? Math.max(conversation.unreadCount || 0, 1) : 0 });
          },
          { success: nextUnread ? 'Marked as unread' : 'Marked as read', failure: 'Failed to update' }
        );
      },
    },
    {
      label: conversation.isFlagged ? 'Unflag' : 'Flag',
      onClick: () => run(
        async () => {
          const { data } = await messageAPI.flagConversation(id);
          onUpdate(id, { isFlagged: data.isFlagged });
          return data;
        },
        { success: (d) => (d.isFlagged ? 'Flagged' : 'Unflagged'), failure: 'Failed to update' }
      ),
    },

    { section: 'Appearance' },
    { label: 'Chat theme', onClick: () => setSubview('theme') },
    { label: 'Nicknames', onClick: () => setSubview('nickname') },

    { section: 'Safety' },
    ...(isGroup ? [] : [
      {
        label: `Block @${other?.username || 'user'}`,
        danger: true,
        onClick: async () => {
          if (!(await confirmDialog({
            message: `Block @${other?.username}? They won't be able to message you or see your profile.`,
            danger: true, confirmLabel: 'Block',
          }))) return;
          return run(
            () => userAPI.blockUser(String(other._id)),
            { success: 'User blocked', failure: 'Failed to block user' }
          );
        },
      },
      { label: 'Report', danger: true, onClick: () => setSubview('report') },
    ]),
    {
      label: 'Clear chat',
      danger: true,
      onClick: async () => {
        if (!(await confirmDialog({
          message: 'Clear this chat for you? The other person keeps their copy.',
          danger: true, confirmLabel: 'Clear',
        }))) return;
        return run(
          async () => {
            await messageAPI.clearChat(id);
            onClearMessages();
          },
          { success: 'Chat cleared', failure: 'Failed to clear chat' }
        );
      },
    },
    {
      label: 'Delete chat',
      danger: true,
      onClick: async () => {
        if (!(await confirmDialog({
          message: 'Delete this chat? This cannot be undone.', danger: true, confirmLabel: 'Delete',
        }))) return;
        return run(
          async () => { await messageAPI.deleteConversation(id); onDelete(id); },
          { success: 'Chat deleted', failure: 'Failed to delete chat' }
        );
      },
    },
    ...(isGroup ? [{
      label: 'Leave group',
      danger: true,
      onClick: async () => {
        if (!(await confirmDialog({
          message: 'Leave this group? You will stop receiving its messages.', danger: true, confirmLabel: 'Leave',
        }))) return;
        return run(
          async () => { await messageAPI.leaveGroup(id); onDelete(id); },
          { success: 'Left group', failure: 'Failed to leave group' }
        );
      },
    }] : []),

    { label: 'Cancel', onClick: onClose },
  ];

  if (subview === 'theme') {
    return <ChatThemePicker conversation={conversation} onUpdate={onUpdate} onClose={() => { setSubview(null); onClose(); }} />;
  }
  if (subview === 'nickname') {
    return <NicknameDialog conversation={conversation} onUpdate={onUpdate} onClose={() => { setSubview(null); onClose(); }} />;
  }
  if (subview === 'report') {
    return (
      <ReportModal
        targetType="user"
        targetId={String(other?._id)}
        label={`@${other?.username}`}
        onClose={() => { setSubview(null); onClose(); }}
      />
    );
  }

  const title = isGroup ? conversation.groupName : `@${other?.username || 'Chat'}`;
  return <ActionSheet title={title} actions={actions} onClose={onClose} />;
}
```

- [ ] **Step 4: Verify the build**

Run from `frontend/`: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/message/ChatActionsSheet.jsx frontend/src/components/message/ChatThemePicker.jsx frontend/src/components/message/NicknameDialog.jsx
git commit -m "feat: add chat header actions sheet with theme picker and nicknames"
```

---

### Task 5: In-chat message search

**Files:**
- Create: `frontend/src/lib/messageSearch.js`
- Test: `frontend/src/lib/messageSearch.test.js`
- Create: `frontend/src/components/message/ChatSearchBar.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `findMatches(messages, query) => string[]` — ids of matching messages, oldest first
  - `highlightParts(text, query) => Array<{ text: string, match: boolean }>`
  - `<ChatSearchBar messages query onQueryChange matchIds activeIndex onNavigate onLoadOlder hasOlder loadingOlder onClose />`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/messageSearch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { findMatches, highlightParts } from './messageSearch.js';

const msgs = [
  { _id: 'm1', type: 'text', content: 'Hello there' },
  { _id: 'm2', type: 'text', content: 'HELLO again' },
  { _id: 'm3', type: 'text', content: 'nothing here' },
  { _id: 'm4', type: 'image', content: '', media: { url: 'x' } },
  { _id: 'm5', type: 'text', content: 'say hello to hello' },
];

describe('findMatches', () => {
  it('returns nothing for an empty query', () => {
    expect(findMatches(msgs, '')).toEqual([]);
    expect(findMatches(msgs, '   ')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    expect(findMatches(msgs, 'hello')).toEqual(['m1', 'm2', 'm5']);
  });

  it('returns each message once however many times it matches', () => {
    expect(findMatches(msgs, 'hello').filter(id => id === 'm5')).toHaveLength(1);
  });

  it('skips messages with no text content', () => {
    expect(findMatches(msgs, 'x')).toEqual([]);
  });

  it('skips unsent and undecryptable messages, which have no readable text', () => {
    const withHidden = [
      { _id: 'h1', type: 'text', content: 'secret hello', isUnsent: true },
      { _id: 'h2', type: 'text', content: 'secret hello', decryptError: true },
      { _id: 'h3', type: 'text', content: 'plain hello' },
    ];
    expect(findMatches(withHidden, 'hello')).toEqual(['h3']);
  });

  it('treats regex metacharacters as literal text', () => {
    const withDots = [{ _id: 'd1', type: 'text', content: 'a.b' }, { _id: 'd2', type: 'text', content: 'axb' }];
    expect(findMatches(withDots, 'a.b')).toEqual(['d1']);
  });

  it('handles a null message list', () => expect(findMatches(null, 'hi')).toEqual([]));
});

describe('highlightParts', () => {
  it('splits a string into matched and unmatched parts', () => {
    expect(highlightParts('say hello', 'hello')).toEqual([
      { text: 'say ', match: false },
      { text: 'hello', match: true },
    ]);
  });

  it('marks every occurrence', () => {
    const parts = highlightParts('hello hello', 'hello');
    expect(parts.filter(p => p.match)).toHaveLength(2);
  });

  it('preserves the original casing of the matched text', () => {
    expect(highlightParts('HeLLo', 'hello')).toEqual([{ text: 'HeLLo', match: true }]);
  });

  it('returns the whole string unmatched when the query is empty', () => {
    expect(highlightParts('anything', '')).toEqual([{ text: 'anything', match: false }]);
  });

  it('treats regex metacharacters as literal', () => {
    expect(highlightParts('a+b', '+')).toEqual([
      { text: 'a', match: false },
      { text: '+', match: true },
      { text: 'b', match: false },
    ]);
  });

  it('handles a missing string', () => expect(highlightParts(undefined, 'x')).toEqual([]));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`: `npx vitest run src/lib/messageSearch.test.js`
Expected: FAIL — cannot resolve `./messageSearch.js`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/messageSearch.js`:

```js
// Search runs on the client, over the messages already decrypted in memory.
// This app E2E-encrypts message text, so the server holds ciphertext it
// cannot match against -- a server-side search would silently return nothing
// for exactly the conversations that matter most.

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Unsent and undecryptable messages have no readable text for the user, so
// matching their stored content would surface hits they cannot see.
const searchableText = (msg) =>
  (msg && !msg.isUnsent && !msg.decryptError && typeof msg.content === 'string') ? msg.content : '';

export const findMatches = (messages, query) => {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  return (messages || [])
    .filter(msg => searchableText(msg).toLowerCase().includes(q))
    .map(msg => msg._id);
};

export const highlightParts = (text, query) => {
  if (typeof text !== 'string') return [];
  const q = (query || '').trim();
  if (!q) return [{ text, match: false }];

  const parts = [];
  const re = new RegExp(escapeRegex(q), 'gi');
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), match: false });
    parts.push({ text: m[0], match: true });
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++; // guard against a zero-width match looping forever
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `frontend/`: `npx vitest run src/lib/messageSearch.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Write the search bar**

Create `frontend/src/components/message/ChatSearchBar.jsx`:

```jsx
import { FiSearch, FiChevronUp, FiChevronDown, FiX } from 'react-icons/fi';

export default function ChatSearchBar({
  query, onQueryChange, matchIds, activeIndex, onNavigate,
  onLoadOlder, hasOlder, loadingOlder, onClose,
}) {
  const total = matchIds.length;

  return (
    <div className="flex flex-col gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-primary)]">
      <div className="flex items-center gap-2">
        <FiSearch className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search in this chat"
          className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none"
        />
        <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
          {total ? `${activeIndex + 1} of ${total}` : query.trim() ? '0 of 0' : ''}
        </span>
        <button onClick={() => onNavigate(-1)} disabled={total === 0} aria-label="Previous match"
          className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)] disabled:opacity-30 flex-shrink-0">
          <FiChevronUp className="w-4 h-4" />
        </button>
        <button onClick={() => onNavigate(1)} disabled={total === 0} aria-label="Next match"
          className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)] disabled:opacity-30 flex-shrink-0">
          <FiChevronDown className="w-4 h-4" />
        </button>
        <button onClick={onClose} aria-label="Close search"
          className="p-1.5 rounded-full hover:bg-[var(--bg-tertiary)] flex-shrink-0">
          <FiX className="w-4 h-4" />
        </button>
      </div>

      {/* Older messages are not searched until they are loaded and decrypted,
          so say so rather than implying the result set is complete. */}
      {query.trim() && hasOlder && (
        <button
          onClick={onLoadOlder}
          disabled={loadingOlder}
          className="self-start text-xs text-pink-500 hover:underline disabled:opacity-50"
        >
          {loadingOlder ? 'Loading older messages…' : 'Older messages have not been searched — load more'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/messageSearch.js frontend/src/lib/messageSearch.test.js frontend/src/components/message/ChatSearchBar.jsx
git commit -m "feat: add client-side in-chat message search"
```

---

### Task 6: Wire everything into `MessagesPage`

**Files:**
- Modify: `frontend/src/pages/main/MessagesPage.jsx`

**Interfaces:**
- Consumes: `ChatActionsSheet` (Task 4), `ChatSearchBar` + `messageSearch.js` (Task 5), `chatTheme.js` (Task 2).
- Produces: nothing new.

- [ ] **Step 1: Add the imports**

In `frontend/src/pages/main/MessagesPage.jsx`, after the existing message-component imports (line 13):

```jsx
import ChatActionsSheet from '../../components/message/ChatActionsSheet';
import ChatSearchBar from '../../components/message/ChatSearchBar';
import { findMatches, highlightParts } from '../../lib/messageSearch';
import { bubbleClassFor, displayNameFor } from '../../lib/chatTheme';
```

- [ ] **Step 2: Add the state**

Inside the component, after the existing `useState` block (around line 52):

```jsx
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [msgPage, setMsgPage] = useState(1);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messageRefs = useRef({});
```

- [ ] **Step 3: Derive the matches**

After the existing derived values (near `const selectedConv = ...`, line 293):

```jsx
  const matchIds = chatSearchOpen ? findMatches(messages, chatSearchQuery) : [];
  const activeMatchId = matchIds[activeMatchIndex] || null;
```

And add an effect that scrolls the active match into view — place it with the other effects:

```jsx
  // Reset to the first hit whenever the query changes, then scroll to
  // whichever hit is active.
  useEffect(() => { setActiveMatchIndex(0); }, [chatSearchQuery]);

  useEffect(() => {
    if (!activeMatchId) return;
    messageRefs.current[activeMatchId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMatchId]);
```

- [ ] **Step 4: Add the older-message loader**

Add next to `loadMessages`:

```jsx
  // Search only sees what has been loaded and decrypted, so it needs a way to
  // pull in more history on demand. Uses the same sequential-decrypt loop as
  // loadMessages -- the ratchet requires messages be decrypted in order.
  const loadOlderMessages = async () => {
    if (!conversationId || loadingOlder) return;
    setLoadingOlder(true);
    const nextPage = msgPage + 1;
    try {
      const { data } = await messageAPI.getMessages(conversationId, nextPage);
      const batch = data.messages || [];
      if (batch.length === 0) { setHasOlderMessages(false); return; }

      const decrypted = [];
      for (const msg of batch) {
        if (!msg.encrypted) { decrypted.push(msg); continue; }
        const isMine = (msg.sender?._id || msg.sender) === user?._id;
        if (isMine) { decrypted.push({ ...msg, content: '', decryptError: true, isOwnEncrypted: true }); continue; }
        const result = await decryptIncomingMessage(conversationId, msg);
        decrypted.push(result.decryptError ? { ...msg, decryptError: true } : { ...msg, content: result.content });
      }

      setMessages(prev => {
        const seen = new Set(prev.map(m => m._id));
        return [...decrypted.filter(m => !seen.has(m._id)), ...prev];
      });
      setMsgPage(nextPage);
    } catch {
      toast.error('Failed to load older messages');
    } finally {
      setLoadingOlder(false);
    }
  };
```

Also reset the paging state when the conversation changes — inside the existing `useEffect` keyed on `conversationId` (line 71), add:

```jsx
    setMsgPage(1);
    setHasOlderMessages(true);
    setChatSearchOpen(false);
    setChatSearchQuery('');
```

- [ ] **Step 5: Wire the three-dot button and render the sheet**

Replace the inert three-dot button (in the header's button group) with:

```jsx
                  <button
                    onClick={() => setChatMenuOpen(true)}
                    aria-label="Chat options"
                    className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
                    <FiMoreHorizontal className="w-5 h-5" />
                  </button>
```

Then immediately after the closing `</div>` of the chat header block (after the IIFE's `);` around line 555), add the search bar:

```jsx
          {chatSearchOpen && (
            <ChatSearchBar
              query={chatSearchQuery}
              onQueryChange={setChatSearchQuery}
              matchIds={matchIds}
              activeIndex={activeMatchIndex}
              onNavigate={(delta) => setActiveMatchIndex(i => {
                if (matchIds.length === 0) return 0;
                return (i + delta + matchIds.length) % matchIds.length;
              })}
              onLoadOlder={loadOlderMessages}
              hasOlder={hasOlderMessages}
              loadingOlder={loadingOlder}
              onClose={() => { setChatSearchOpen(false); setChatSearchQuery(''); }}
            />
          )}
```

And near the bottom of the chat column, alongside the existing `ReportModal` render, add:

```jsx
          {chatMenuOpen && activeConv && (
            <ChatActionsSheet
              conversation={activeConv}
              currentUserId={user?._id}
              onClose={() => setChatMenuOpen(false)}
              onUpdate={(id, patch) => {
                updateConv(id, patch);
                setActiveConv(prev => (prev && prev._id === id ? { ...prev, ...patch } : prev));
              }}
              onDelete={(id) => { removeConv(id); setChatMenuOpen(false); navigate('/messages'); }}
              onClearMessages={() => setMessages([])}
              onSearch={() => setChatSearchOpen(true)}
            />
          )}
```

- [ ] **Step 6: Apply the theme and nicknames to the thread**

In the message bubble's className (line 617–620), replace the hard-coded `bg-blue-500 text-white` for outgoing messages with the theme class:

```jsx
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words
                          ${isMine
                            ? `${bubbleClassFor(activeConv?.theme)} rounded-br-md`
```

(Leave the incoming-message branch exactly as it is.)

Then wrap the message content so search hits are highlighted. Replace the plain `{msg.content}` render inside that bubble with:

```jsx
                          {chatSearchOpen && chatSearchQuery.trim()
                            ? highlightParts(msg.content, chatSearchQuery).map((part, pi) => (
                                <span key={pi} className={part.match ? 'bg-yellow-300/70 text-neutral-900 rounded px-0.5' : ''}>
                                  {part.text}
                                </span>
                              ))
                            : msg.content}
```

Attach the ref used for scroll-to-match on the outer row `<div>` of each message (the one with `key={msg._id}`):

```jsx
                    ref={(el) => { messageRefs.current[msg._id] = el; }}
```

and add a ring on the active match by appending to that row's className:

```jsx
${msg._id === activeMatchId ? 'ring-2 ring-yellow-400 rounded-2xl' : ''}
```

Finally, replace the header's displayed name so nicknames win. In the chat header (line 522), change:

```jsx
                      {activeConv.type === 'group' ? activeConv.groupName : other?.username}
```

to:

```jsx
                      {activeConv.type === 'group' ? activeConv.groupName : displayNameFor(activeConv, other)}
```

- [ ] **Step 7: Verify by hand**

Start the app and open a chat. Check every one of these:

1. Three dots opens the sheet with three labelled sections.
2. Mute messages → toast, sheet closes, reopening shows "Unmute messages". Reload the page — it is still muted.
3. Move to General → the chat leaves the Primary tab and appears under General.
4. Mark as unread → the chat list row shows the unread state.
5. Flag → toast; reopening shows "Unflag".
6. Chat theme → pick Ocean → your outgoing bubbles change colour immediately, and stay changed after a reload. The other participant sees it too.
7. Nicknames → set one for the other person → the chat header shows the nickname. Clear it and save → the username returns.
8. Search in chat → type a word present in a loaded message → the count shows, the message is highlighted and scrolled to, and up/down cycles hits.
9. Search for a word only present in old history → "0 of 0" plus the "load more" hint; clicking it loads older messages and the hit appears.
10. Block → confirm dialog → user blocked (verify in Settings → Blocked accounts).
11. Report → the existing report modal opens and submits.
12. Clear chat → confirm → the thread empties. Reload — still empty for you. Check the other account — their copy is intact.
13. Delete chat → confirm → the conversation disappears and you return to `/messages`.
14. In a group chat: no Block/Report entries, and a "Leave group" entry that works.

- [ ] **Step 8: Responsive check**

With devtools device emulation, confirm at 375×667, 768×1024 and 1440×900, in both light and dark theme: the sheet is a bottom sheet on mobile and a centered modal on desktop, it scrolls when taller than the viewport, the theme picker's swatch grid does not overflow, and the search bar's controls stay on one row without pushing the input off-screen.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/main/MessagesPage.jsx
git commit -m "feat: wire chat actions sheet, in-chat search, themes and nicknames into MessagesPage"
```

---

### Task 7: Full-suite verification

- [ ] **Step 1: Frontend tests**

Run from `frontend/`: `npx vitest run`
Expected: all suites pass, including the pre-existing ones.

- [ ] **Step 2: Backend tests**

Run from `backend/`: `npx vitest run`
Expected: the `chatTheme` suite passes.

- [ ] **Step 3: Build**

Run from `frontend/`: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: chat actions menu review fixes"
```
