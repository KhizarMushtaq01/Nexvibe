# WebRTC Audio/Video Calling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the phone and video buttons in the chat header place real WebRTC calls — 1-on-1 and group (up to 8) — with an incoming-call screen, an active-call screen, and a call log written into the chat thread.

**Architecture:** A global `CallProvider` context mounted in `App.jsx` owns a pure reducer-driven state machine and a `Map<userId, RTCPeerConnection>` mesh. All non-React logic (ICE config, glare rule, media constraints, state transitions) lives in pure `lib/` modules that are unit-tested with Vitest. The backend's existing-but-unused socket call handlers are replaced with `callId`-scoped, membership-authorized relays backed by a pure in-memory `callRegistry`.

**Tech Stack:** React 18 + Vite, Tailwind, react-icons/fi, react-hot-toast, socket.io (client + server), Express + Mongoose, Vitest.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-08-11-calling-chat-shortcuts-help-design.md`. Read it before starting.
- **Max participants per call: 8.** Enforced on both client and server.
- **Testing convention:** this repo unit-tests only pure modules (`frontend/src/lib/*.test.js`), with no `@testing-library/react` installed. Do **not** add React component tests or new testing dependencies to the frontend. Backend gets `vitest` added in Task 2 — that is the only new dev dependency in this plan.
- **Frontend test command:** run from `frontend/`: `npx vitest run src/lib/<file>.test.js`
- **Backend test command:** run from `backend/`: `npx vitest run lib/<file>.test.js`
- **Styling:** use the existing CSS variables only — `var(--bg-primary)`, `var(--bg-secondary)`, `var(--bg-tertiary)`, `var(--border)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`. Never hard-code light/dark colors except on the call screens' deliberately-dark overlay, which uses fixed dark values in both themes (matching how phone call UIs behave).
- **Icons:** `react-icons/fi` only, to match the rest of the app.
- **Group video constraints:** `320×240 @ 15fps`, `maxBitrate: 150000`. 1-on-1 video: `1280×720 @ 30fps`.
- **Ring timeout:** 30 seconds, both directions.
- **Never fake a capability.** If `setSinkId` or a second camera is unavailable, the corresponding button is not rendered.
- **Commit after every task.** Conventional commit prefixes (`feat:`, `fix:`, `test:`, `refactor:`).

---

### Task 1: Pure WebRTC helpers (`lib/webrtc.js`)

**Files:**
- Create: `frontend/src/lib/webrtc.js`
- Test: `frontend/src/lib/webrtc.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `MAX_CALL_PARTICIPANTS: number` (8)
  - `buildIceServers(env: object) => RTCIceServer[]`
  - `isOfferer(myUserId: string, peerUserId: string) => boolean`
  - `getMediaConstraints({ callType: 'audio'|'video', peerCount: number }) => MediaStreamConstraints`
  - `videoSenderParams(peerCount: number) => { maxBitrate: number } | null`
  - `capParticipants(ids: string[], selfId: string) => string[]`
  - `describeMediaError(err: Error, callType: string) => { message: string, fallbackToAudio: boolean }`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/webrtc.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  MAX_CALL_PARTICIPANTS,
  buildIceServers,
  isOfferer,
  getMediaConstraints,
  videoSenderParams,
  capParticipants,
  describeMediaError,
} from './webrtc.js';

describe('buildIceServers', () => {
  it('falls back to the public Google STUN server when nothing is configured', () => {
    expect(buildIceServers({})).toEqual([{ urls: ['stun:stun.l.google.com:19302'] }]);
  });

  it('splits VITE_STUN_URLS on commas and trims whitespace', () => {
    expect(buildIceServers({ VITE_STUN_URLS: 'stun:a.example:3478, stun:b.example:3478' }))
      .toEqual([{ urls: ['stun:a.example:3478', 'stun:b.example:3478'] }]);
  });

  it('appends a TURN server when the url and both credentials are present', () => {
    const servers = buildIceServers({
      VITE_TURN_URL: 'turn:t.example:3478',
      VITE_TURN_USERNAME: 'user',
      VITE_TURN_CREDENTIAL: 'pass',
    });
    expect(servers).toHaveLength(2);
    expect(servers[1]).toEqual({ urls: ['turn:t.example:3478'], username: 'user', credential: 'pass' });
  });

  it('ignores a TURN url with missing credentials rather than emitting an unusable server', () => {
    expect(buildIceServers({ VITE_TURN_URL: 'turn:t.example:3478' })).toHaveLength(1);
  });
});

describe('isOfferer', () => {
  it('makes the lexicographically lower user id the offerer', () => {
    expect(isOfferer('aaa', 'bbb')).toBe(true);
    expect(isOfferer('bbb', 'aaa')).toBe(false);
  });

  it('is exactly one-sided for every pair, so neither glare nor deadlock is possible', () => {
    const ids = ['64a', '64b', '64c', '12z'];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        expect(isOfferer(a, b)).toBe(!isOfferer(b, a));
      }
    }
  });

  it('coerces non-string ids (Mongo ObjectIds) before comparing', () => {
    expect(isOfferer({ toString: () => 'aaa' }, { toString: () => 'bbb' })).toBe(true);
  });
});

describe('getMediaConstraints', () => {
  it('requests no video at all for an audio call', () => {
    expect(getMediaConstraints({ callType: 'audio', peerCount: 1 }).video).toBe(false);
  });

  it('always enables echo cancellation and noise suppression on audio', () => {
    const { audio } = getMediaConstraints({ callType: 'audio', peerCount: 1 });
    expect(audio.echoCancellation).toBe(true);
    expect(audio.noiseSuppression).toBe(true);
  });

  it('uses 720p for a 1-on-1 video call', () => {
    const { video } = getMediaConstraints({ callType: 'video', peerCount: 1 });
    expect(video.width.ideal).toBe(1280);
    expect(video.height.ideal).toBe(720);
    expect(video.frameRate.ideal).toBe(30);
  });

  it('drops to 240p/15fps once a video call has more than one peer', () => {
    const { video } = getMediaConstraints({ callType: 'video', peerCount: 2 });
    expect(video.width.ideal).toBe(320);
    expect(video.height.ideal).toBe(240);
    expect(video.frameRate.ideal).toBe(15);
  });
});

describe('videoSenderParams', () => {
  it('caps group video bitrate', () => {
    expect(videoSenderParams(2)).toEqual({ maxBitrate: 150000 });
  });

  it('leaves 1-on-1 video uncapped', () => {
    expect(videoSenderParams(1)).toBeNull();
  });
});

describe('capParticipants', () => {
  it('removes the caller from the participant list', () => {
    expect(capParticipants(['me', 'a', 'b'], 'me')).toEqual(['a', 'b']);
  });

  it('de-duplicates ids', () => {
    expect(capParticipants(['a', 'a', 'b'], 'me')).toEqual(['a', 'b']);
  });

  it('keeps the call within MAX_CALL_PARTICIPANTS including the caller', () => {
    const many = Array.from({ length: 20 }, (_, i) => `u${i}`);
    expect(capParticipants(many, 'me')).toHaveLength(MAX_CALL_PARTICIPANTS - 1);
  });
});

describe('describeMediaError', () => {
  it('explains a permission denial', () => {
    const { message, fallbackToAudio } = describeMediaError({ name: 'NotAllowedError' }, 'video');
    expect(message).toMatch(/permission/i);
    expect(fallbackToAudio).toBe(false);
  });

  it('falls back to audio when a video call finds no camera', () => {
    expect(describeMediaError({ name: 'NotFoundError' }, 'video').fallbackToAudio).toBe(true);
  });

  it('does not offer an audio fallback when an audio call finds no microphone', () => {
    const { message, fallbackToAudio } = describeMediaError({ name: 'NotFoundError' }, 'audio');
    expect(fallbackToAudio).toBe(false);
    expect(message).toMatch(/microphone/i);
  });

  it('explains a device already in use', () => {
    expect(describeMediaError({ name: 'NotReadableError' }, 'audio').message).toMatch(/another app/i);
  });

  it('has a generic message for an unknown error', () => {
    expect(describeMediaError({ name: 'WeirdError' }, 'audio').message).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`: `npx vitest run src/lib/webrtc.test.js`
Expected: FAIL — "Failed to resolve import './webrtc.js'".

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/webrtc.js`:

```js
// Pure WebRTC helpers. Deliberately free of React and of browser globals
// beyond the RTC types themselves, so every decision a call depends on
// (who offers, what resolution, which ICE servers) is unit-testable.

export const MAX_CALL_PARTICIPANTS = 8;

const DEFAULT_STUN = 'stun:stun.l.google.com:19302';

/**
 * Build the iceServers array from Vite env vars.
 * Note these values ship in the client bundle and are therefore public --
 * long-lived static TURN credentials are not safe here. See the design doc's
 * risk section; a short-lived-credential endpoint is the follow-up.
 */
export const buildIceServers = (env = {}) => {
  const stunUrls = String(env.VITE_STUN_URLS || DEFAULT_STUN)
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

  const servers = [{ urls: stunUrls.length ? stunUrls : [DEFAULT_STUN] }];

  // A TURN entry without credentials is not merely useless -- some browsers
  // reject the whole RTCConfiguration over it. Only emit a complete one.
  if (env.VITE_TURN_URL && env.VITE_TURN_USERNAME && env.VITE_TURN_CREDENTIAL) {
    servers.push({
      urls: [env.VITE_TURN_URL],
      username: env.VITE_TURN_USERNAME,
      credential: env.VITE_TURN_CREDENTIAL,
    });
  }

  return servers;
};

/**
 * In a mesh, both peers learn about each other at the same moment, so both
 * would send an offer ("glare") unless one side is designated. Comparing the
 * two user ids gives a rule both sides compute identically with no extra
 * round trip, which is why this needs no perfect-negotiation rollback.
 */
export const isOfferer = (myUserId, peerUserId) => String(myUserId) < String(peerUserId);

export const getMediaConstraints = ({ callType, peerCount }) => {
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (callType !== 'video') return { audio, video: false };

  // Mesh means every extra peer is another full upload of our own video.
  // Past 1-on-1 we trade resolution for the call staying up at all.
  const isGroup = peerCount > 1;
  return {
    audio,
    video: isGroup
      ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  };
};

export const videoSenderParams = (peerCount) => (peerCount > 1 ? { maxBitrate: 150000 } : null);

export const capParticipants = (ids, selfId) => {
  const others = [...new Set(ids.map(String))].filter(id => id !== String(selfId));
  return others.slice(0, MAX_CALL_PARTICIPANTS - 1);
};

export const describeMediaError = (err, callType) => {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        message: callType === 'video'
          ? 'Camera and microphone permission denied. Enable it in your browser settings to call.'
          : 'Microphone permission denied. Enable it in your browser settings to call.',
        fallbackToAudio: false,
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      // No camera is recoverable -- the call can still happen as audio.
      // No microphone is not: a call with no audio is not a call.
      return callType === 'video'
        ? { message: 'No camera found — starting as an audio call.', fallbackToAudio: true }
        : { message: 'No microphone found.', fallbackToAudio: false };
    case 'NotReadableError':
    case 'AbortError':
      return { message: 'Your camera or microphone is being used by another app.', fallbackToAudio: false };
    default:
      return { message: "Couldn't access your microphone or camera.", fallbackToAudio: false };
  }
};

/** Create a peer connection with this app's ICE config already applied. */
export const createPeerConnection = (env) =>
  new RTCPeerConnection({ iceServers: buildIceServers(env), iceCandidatePoolSize: 4 });
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `frontend/`: `npx vitest run src/lib/webrtc.test.js`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/webrtc.js frontend/src/lib/webrtc.test.js
git commit -m "feat: add pure WebRTC helpers for ICE config, glare rule and media constraints"
```

---

### Task 2: Server-side call registry (`backend/lib/callRegistry.js`)

The existing socket call handlers relay whatever they are given with no authorization at all — any client could inject SDP into a stranger's call. This task builds the membership bookkeeping that Task 3 will enforce with.

**Files:**
- Create: `backend/lib/callRegistry.js`
- Test: `backend/lib/callRegistry.test.js`
- Modify: `backend/package.json` (add `vitest` devDependency + `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `createCallRegistry() => { create, join, leave, members, isMember, leaveAll, has }`
  - `create(callId: string, userIds: string[]) => void`
  - `join(callId: string, userId: string) => boolean` — false if the call doesn't exist or is full
  - `leave(callId: string, userId: string) => string[]` — remaining member ids
  - `members(callId: string) => string[]`
  - `isMember(callId: string, userId: string) => boolean`
  - `leaveAll(userId: string) => Array<{ callId: string, remaining: string[] }>`
  - `has(callId: string) => boolean`

- [ ] **Step 1: Add Vitest to the backend**

The backend has no test runner today. Add one — the call authorization logic is security-relevant and must not be verified by hand only.

Run from `backend/`: `npm install --save-dev vitest@^4.1.10`

Then edit `backend/package.json` and add a `test` script alongside the existing ones:

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "vitest run"
  },
```

- [ ] **Step 2: Write the failing test**

Create `backend/lib/callRegistry.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createCallRegistry, MAX_CALL_PARTICIPANTS } from './callRegistry.js';

describe('callRegistry', () => {
  let registry;
  beforeEach(() => { registry = createCallRegistry(); });

  it('reports no members for a call that was never created', () => {
    expect(registry.has('nope')).toBe(false);
    expect(registry.members('nope')).toEqual([]);
    expect(registry.isMember('nope', 'a')).toBe(false);
  });

  it('creates a call with its initial members', () => {
    registry.create('c1', ['a', 'b']);
    expect(registry.has('c1')).toBe(true);
    expect(registry.members('c1').sort()).toEqual(['a', 'b']);
    expect(registry.isMember('c1', 'a')).toBe(true);
    expect(registry.isMember('c1', 'z')).toBe(false);
  });

  it('caps a created call at MAX_CALL_PARTICIPANTS', () => {
    const many = Array.from({ length: 20 }, (_, i) => `u${i}`);
    registry.create('c1', many);
    expect(registry.members('c1')).toHaveLength(MAX_CALL_PARTICIPANTS);
  });

  it('de-duplicates members', () => {
    registry.create('c1', ['a', 'a', 'b']);
    expect(registry.members('c1').sort()).toEqual(['a', 'b']);
  });

  it('refuses to join a call that does not exist', () => {
    expect(registry.join('ghost', 'a')).toBe(false);
  });

  it('refuses to join a full call', () => {
    registry.create('c1', Array.from({ length: MAX_CALL_PARTICIPANTS }, (_, i) => `u${i}`));
    expect(registry.join('c1', 'extra')).toBe(false);
    expect(registry.isMember('c1', 'extra')).toBe(false);
  });

  it('joining twice is idempotent and still succeeds', () => {
    registry.create('c1', ['a']);
    expect(registry.join('c1', 'b')).toBe(true);
    expect(registry.join('c1', 'b')).toBe(true);
    expect(registry.members('c1')).toHaveLength(2);
  });

  it('returns the remaining members on leave', () => {
    registry.create('c1', ['a', 'b', 'c']);
    expect(registry.leave('c1', 'b').sort()).toEqual(['a', 'c']);
  });

  it('deletes the call once the last member leaves, so the map cannot leak', () => {
    registry.create('c1', ['a']);
    expect(registry.leave('c1', 'a')).toEqual([]);
    expect(registry.has('c1')).toBe(false);
  });

  it('leaving a call you are not in is a harmless no-op', () => {
    registry.create('c1', ['a']);
    expect(registry.leave('c1', 'z').sort()).toEqual(['a']);
    expect(registry.leave('ghost', 'a')).toEqual([]);
  });

  it('leaveAll removes a disconnecting user from every call they were in', () => {
    registry.create('c1', ['a', 'b']);
    registry.create('c2', ['a', 'c']);
    registry.create('c3', ['b', 'c']);

    const affected = registry.leaveAll('a');

    expect(affected.map(x => x.callId).sort()).toEqual(['c1', 'c2']);
    expect(registry.isMember('c1', 'a')).toBe(false);
    expect(registry.isMember('c2', 'a')).toBe(false);
    expect(registry.members('c3').sort()).toEqual(['b', 'c']);
  });

  it('leaveAll reports the remaining members so the server knows who to notify', () => {
    registry.create('c1', ['a', 'b', 'c']);
    const [entry] = registry.leaveAll('a');
    expect(entry.remaining.sort()).toEqual(['b', 'c']);
  });

  it('coerces ObjectId-like ids to strings', () => {
    registry.create('c1', [{ toString: () => 'a' }]);
    expect(registry.isMember('c1', 'a')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `backend/`: `npx vitest run lib/callRegistry.test.js`
Expected: FAIL — cannot resolve `./callRegistry.js`.

- [ ] **Step 4: Write the implementation**

Create `backend/lib/callRegistry.js`:

```js
// Tracks who is in which call, in memory. Deliberately not in MongoDB: a
// call cannot outlive the process that is relaying its signaling anyway, so
// persisting it would only create rows nobody can act on. The trade-off is
// that a server restart drops in-flight calls, and this does not span
// multiple server instances -- a Redis adapter is the scale-out path.

export const MAX_CALL_PARTICIPANTS = 8;

export const createCallRegistry = () => {
  /** @type {Map<string, Set<string>>} callId -> member user ids */
  const calls = new Map();

  const has = (callId) => calls.has(callId);

  const members = (callId) => [...(calls.get(callId) || [])];

  const isMember = (callId, userId) => !!calls.get(callId)?.has(String(userId));

  const create = (callId, userIds) => {
    const unique = [...new Set(userIds.map(String))].slice(0, MAX_CALL_PARTICIPANTS);
    calls.set(callId, new Set(unique));
  };

  const join = (callId, userId) => {
    const set = calls.get(callId);
    if (!set) return false;
    const id = String(userId);
    if (set.has(id)) return true;
    if (set.size >= MAX_CALL_PARTICIPANTS) return false;
    set.add(id);
    return true;
  };

  const leave = (callId, userId) => {
    const set = calls.get(callId);
    if (!set) return [];
    set.delete(String(userId));
    if (set.size === 0) { calls.delete(callId); return []; }
    return [...set];
  };

  // A socket disconnect gives us a user id and nothing else, so every call
  // they might have been in has to be swept.
  const leaveAll = (userId) => {
    const id = String(userId);
    const affected = [];
    for (const [callId, set] of [...calls.entries()]) {
      if (!set.has(id)) continue;
      affected.push({ callId, remaining: leave(callId, id) });
    }
    return affected;
  };

  return { create, join, leave, members, isMember, leaveAll, has };
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `backend/`: `npx vitest run lib/callRegistry.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/lib/callRegistry.js backend/lib/callRegistry.test.js backend/package.json backend/package-lock.json
git commit -m "feat: add in-memory call registry with membership tracking and participant cap"
```

---

### Task 3: Replace the socket call handlers with authorized, callId-scoped relays

**Files:**
- Modify: `backend/config/socket.js:58-98` (replace the whole "Call signaling" block) and `:117-123` (disconnect)

**Interfaces:**
- Consumes: `createCallRegistry`, `MAX_CALL_PARTICIPANTS` from `backend/lib/callRegistry.js` (Task 2).
- Produces: the socket event contract the frontend depends on in Tasks 6–9:
  - inbound: `call:initiate` `{ callId, conversationId, participantIds, callType }`, `call:accept` `{ callId, toUserId }`, `call:reject` `{ callId, toUserId }`, `call:busy` `{ callId, toUserId }`, `call:offer` `{ callId, toUserId, sdp }`, `call:answer` `{ callId, toUserId, sdp }`, `ice:candidate` `{ callId, toUserId, candidate }`, `call:leave` `{ callId }`, `call:media-state` `{ callId, audioEnabled, videoEnabled }`
  - outbound: `call:incoming` `{ callId, conversationId, callType, caller: { _id, username, fullName, avatar }, memberIds }`, `call:ring-status` `{ callId, offlineUserIds }`, `call:accepted` `{ callId, fromUserId }`, `call:rejected` `{ callId, fromUserId, reason }`, `call:busy` `{ callId, fromUserId }`, `call:offer` `{ callId, fromUserId, sdp }`, `call:answer` `{ callId, fromUserId, sdp }`, `ice:candidate` `{ callId, fromUserId, candidate }`, `call:peer-left` `{ callId, userId }`, `call:peer-media-state` `{ callId, userId, audioEnabled, videoEnabled }`

- [ ] **Step 1: Write the failing test**

The relay handlers need the `io`/`socket` objects, so test them through a tiny fake rather than a real server. Create `backend/config/socket.calls.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerCallHandlers } from './socketCalls.js';

// Minimal socket.io doubles: enough to record what was emitted where.
const makeIo = () => {
  const emissions = [];
  return {
    emissions,
    to: (target) => ({ emit: (event, payload) => emissions.push({ target, event, payload }) }),
  };
};

const makeSocket = (userId) => {
  const handlers = new Map();
  const emissions = [];
  return {
    userId,
    handlers,
    emissions,
    on: (event, cb) => handlers.set(event, cb),
    emit: (event, payload) => emissions.push({ event, payload }),
    fire: (event, payload) => handlers.get(event)?.(payload),
  };
};

describe('call socket handlers', () => {
  let io, socket, registry, onlineUsers, loadConversation;

  beforeEach(() => {
    io = makeIo();
    socket = makeSocket('alice');
    onlineUsers = new Map([['alice', 'sock-alice'], ['bob', 'sock-bob']]);
    loadConversation = vi.fn(async () => ({
      _id: 'conv1',
      participants: ['alice', 'bob'],
    }));
    registry = registerCallHandlers({ io, socket, onlineUsers, loadConversation });
  });

  it('rings every online participant on initiate', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });

    const incoming = io.emissions.filter(e => e.event === 'call:incoming');
    expect(incoming).toHaveLength(1);
    expect(incoming[0].target).toBe('sock-bob');
    expect(incoming[0].payload.callId).toBe('call1');
    expect(incoming[0].payload.callType).toBe('audio');
  });

  it('registers the caller and the invitees as call members', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    expect(registry.isMember('call1', 'alice')).toBe(true);
    expect(registry.isMember('call1', 'bob')).toBe(true);
  });

  it('tells the caller which invitees were offline', async () => {
    onlineUsers.delete('bob');
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    const status = socket.emissions.find(e => e.event === 'call:ring-status');
    expect(status.payload.offlineUserIds).toEqual(['bob']);
  });

  it('refuses to start a call in a conversation the caller is not part of', async () => {
    loadConversation.mockResolvedValueOnce({ _id: 'conv1', participants: ['bob', 'carol'] });
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    expect(io.emissions.filter(e => e.event === 'call:incoming')).toHaveLength(0);
    expect(registry.has('call1')).toBe(false);
    expect(socket.emissions.some(e => e.event === 'call:error')).toBe(true);
  });

  it('refuses to ring someone who is not in the conversation', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob', 'mallory'], callType: 'audio',
    });
    const rung = io.emissions.filter(e => e.event === 'call:incoming').map(e => e.target);
    expect(rung).toEqual(['sock-bob']);
    expect(registry.isMember('call1', 'mallory')).toBe(false);
  });

  it('relays an offer only between members of the same call', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    io.emissions.length = 0;

    socket.fire('call:offer', { callId: 'call1', toUserId: 'bob', sdp: 'SDP' });

    const offers = io.emissions.filter(e => e.event === 'call:offer');
    expect(offers).toHaveLength(1);
    expect(offers[0].payload).toEqual({ callId: 'call1', fromUserId: 'alice', sdp: 'SDP' });
  });

  it('drops signaling from a socket that is not a member of the call', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    io.emissions.length = 0;

    const mallory = makeSocket('mallory');
    registerCallHandlers({ io, socket: mallory, onlineUsers, loadConversation, registry });
    mallory.fire('call:offer', { callId: 'call1', toUserId: 'bob', sdp: 'EVIL' });

    expect(io.emissions.filter(e => e.event === 'call:offer')).toHaveLength(0);
  });

  it('drops signaling aimed at a user who is not in the call', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    io.emissions.length = 0;

    socket.fire('ice:candidate', { callId: 'call1', toUserId: 'carol', candidate: 'C' });
    expect(io.emissions).toHaveLength(0);
  });

  it('broadcasts peer-left to the remaining members on leave', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    io.emissions.length = 0;

    socket.fire('call:leave', { callId: 'call1' });

    const left = io.emissions.filter(e => e.event === 'call:peer-left');
    expect(left).toHaveLength(1);
    expect(left[0].target).toBe('sock-bob');
    expect(left[0].payload).toEqual({ callId: 'call1', userId: 'alice' });
    expect(registry.isMember('call1', 'alice')).toBe(false);
  });

  it('broadcasts media state changes to the other members', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'video',
    });
    io.emissions.length = 0;

    socket.fire('call:media-state', { callId: 'call1', audioEnabled: false, videoEnabled: true });

    const states = io.emissions.filter(e => e.event === 'call:peer-media-state');
    expect(states[0].payload).toEqual({
      callId: 'call1', userId: 'alice', audioEnabled: false, videoEnabled: true,
    });
  });

  it('treats a disconnect as leaving every call the user was in', async () => {
    await socket.fire('call:initiate', {
      callId: 'call1', conversationId: 'conv1', participantIds: ['bob'], callType: 'audio',
    });
    io.emissions.length = 0;

    socket.fire('disconnect');

    const left = io.emissions.filter(e => e.event === 'call:peer-left');
    expect(left).toHaveLength(1);
    expect(left[0].payload.userId).toBe('alice');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`: `npx vitest run config/socket.calls.test.js`
Expected: FAIL — cannot resolve `./socketCalls.js`.

- [ ] **Step 3: Extract the call handlers into their own module**

Create `backend/config/socketCalls.js`. Keeping this out of `socket.js` means the call logic can be tested with fakes without standing up the whole socket server, and stops `socket.js` from growing into a grab-bag.

```js
// models/Message.js exports BOTH models as named exports -- there is no
// default export, so `import Conversation from ...` would be undefined.
import { Conversation } from '../models/Message.js';
import { createCallRegistry, MAX_CALL_PARTICIPANTS } from '../lib/callRegistry.js';

// One registry shared by every connected socket. Injectable so tests can
// hand in a fresh one per case.
const sharedRegistry = createCallRegistry();

const defaultLoadConversation = async (conversationId) =>
  Conversation.findById(conversationId).select('participants type');

/**
 * Wire the call-signaling events onto one socket.
 *
 * Every relay checks that BOTH ends are members of the callId being used.
 * Without that check any authenticated client could inject SDP or ICE into
 * a stranger's call just by guessing an id.
 */
export const registerCallHandlers = ({
  io,
  socket,
  onlineUsers,
  loadConversation = defaultLoadConversation,
  registry = sharedRegistry,
}) => {
  const me = () => String(socket.userId || '');

  const sendTo = (userId, event, payload) => {
    const socketId = onlineUsers.get(String(userId));
    if (socketId) io.to(socketId).emit(event, payload);
  };

  // A relay is only allowed if the sender and the recipient are both in the
  // named call. Returns false (and sends nothing) otherwise.
  const relay = (event, { callId, toUserId }, payload) => {
    if (!callId || !toUserId) return false;
    if (!registry.isMember(callId, me())) return false;
    if (!registry.isMember(callId, toUserId)) return false;
    sendTo(toUserId, event, { callId, fromUserId: me(), ...payload });
    return true;
  };

  const broadcastToCall = (callId, event, payload) => {
    for (const memberId of registry.members(callId)) {
      if (memberId === me()) continue;
      sendTo(memberId, event, payload);
    }
  };

  socket.on('call:initiate', async ({ callId, conversationId, participantIds, callType }) => {
    if (!callId || !conversationId || !Array.isArray(participantIds)) return;
    if (!['audio', 'video'].includes(callType)) return;

    let conversation;
    try {
      conversation = await loadConversation(conversationId);
    } catch {
      socket.emit('call:error', { callId, message: 'Could not start the call' });
      return;
    }

    const participantSet = new Set((conversation?.participants || []).map(String));
    if (!conversation || !participantSet.has(me())) {
      socket.emit('call:error', { callId, message: 'Not authorized to call in this conversation' });
      return;
    }

    // Only ring people who are actually in the conversation -- the client's
    // list is not trusted.
    const invitees = [...new Set(participantIds.map(String))]
      .filter(id => id !== me() && participantSet.has(id))
      .slice(0, MAX_CALL_PARTICIPANTS - 1);

    if (invitees.length === 0) {
      socket.emit('call:error', { callId, message: 'Nobody to call' });
      return;
    }

    registry.create(callId, [me(), ...invitees]);

    const caller = socket.callerProfile || { _id: me() };
    const memberIds = registry.members(callId);
    const offlineUserIds = [];

    for (const inviteeId of invitees) {
      if (!onlineUsers.has(inviteeId)) { offlineUserIds.push(inviteeId); continue; }
      sendTo(inviteeId, 'call:incoming', {
        callId, conversationId, callType, caller, memberIds,
      });
    }

    socket.emit('call:ring-status', { callId, offlineUserIds });
  });

  socket.on('call:accept', (data) => relay('call:accepted', data, {}));
  socket.on('call:reject', (data) => {
    if (!relay('call:rejected', data, { reason: data?.reason || 'declined' })) return;
    registry.leave(data.callId, me());
  });
  socket.on('call:busy', (data) => {
    if (!relay('call:busy', data, {})) return;
    registry.leave(data.callId, me());
  });
  socket.on('call:offer', (data) => relay('call:offer', data, { sdp: data?.sdp }));
  socket.on('call:answer', (data) => relay('call:answer', data, { sdp: data?.sdp }));
  socket.on('ice:candidate', (data) => relay('ice:candidate', data, { candidate: data?.candidate }));

  socket.on('call:media-state', ({ callId, audioEnabled, videoEnabled } = {}) => {
    if (!callId || !registry.isMember(callId, me())) return;
    broadcastToCall(callId, 'call:peer-media-state', {
      callId, userId: me(), audioEnabled: !!audioEnabled, videoEnabled: !!videoEnabled,
    });
  });

  socket.on('call:leave', ({ callId } = {}) => {
    if (!callId || !registry.isMember(callId, me())) return;
    // Broadcast BEFORE leaving: once leave() runs, a call whose last member
    // just left is deleted outright, and members() would return nothing to
    // notify. Broadcasting first is safe because it already skips me().
    broadcastToCall(callId, 'call:peer-left', { callId, userId: me() });
    registry.leave(callId, me());
  });

  socket.on('disconnect', () => {
    for (const { callId, remaining } of registry.leaveAll(me())) {
      for (const memberId of remaining) {
        sendTo(memberId, 'call:peer-left', { callId, userId: me() });
      }
    }
  });

  return registry;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`: `npx vitest run config/socket.calls.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Delete the old handlers and wire in the new module**

In `backend/config/socket.js`, add the import at the top:

```js
import { registerCallHandlers } from './socketCalls.js';
import User from '../models/User.js';
```

Delete lines 58–98 entirely (the `// Call signaling` comment through the closing of the `ice:candidate` handler). These are the unauthorized handlers being replaced; nothing consumes them today, so there is no migration to do.

In their place, inside the `io.on('connection')` callback, add:

```js
    // Call signaling lives in its own module -- see config/socketCalls.js.
    registerCallHandlers({ io, socket, onlineUsers });
```

Then extend the existing `user:join` handler (line 8) so the caller's profile is available for the incoming-call screen without a second round trip. Replace it with:

```js
    socket.on('user:join', async (userId) => {
      onlineUsers.set(userId, socket.id);
      socket.userId = userId;
      // Cached on the socket so call:initiate can put a name and avatar on the
      // callee's ringing screen without another DB read per call.
      try {
        socket.callerProfile = await User.findById(userId).select('username fullName avatar').lean();
      } catch { socket.callerProfile = { _id: userId }; }
      io.emit('users:online', Array.from(onlineUsers.keys()));
      console.log(`👤 User ${userId} is online`);
    });
```

- [ ] **Step 6: Verify the server still boots**

Run from `backend/`: `node --check config/socket.js && node --check config/socketCalls.js`
Expected: no output (both parse).

Then start the app (`npm run dev` from the repo root), log in in a browser, and confirm the console prints `👤 User ... is online` with no errors. Existing messaging must still work — send a message between two accounts.

- [ ] **Step 7: Commit**

```bash
git add backend/config/socket.js backend/config/socketCalls.js backend/config/socket.calls.test.js
git commit -m "feat: replace unauthorized call signaling with callId-scoped, membership-checked relays"
```

---

### Task 4: Ringtone generator (`lib/ringtone.js`)

**Files:**
- Create: `frontend/src/lib/ringtone.js`
- Test: `frontend/src/lib/ringtone.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createRingtone({ AudioContextCtor?, vibrate? }) => { start(pattern: 'ring'|'ringback'), stop() }`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/ringtone.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRingtone } from './ringtone.js';

const makeFakeAudioContext = (state = 'running') => {
  const gainNode = { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
  const oscillators = [];
  return {
    state,
    currentTime: 0,
    destination: {},
    close: vi.fn(),
    createGain: vi.fn(() => gainNode),
    createOscillator: vi.fn(() => {
      const osc = { type: 'sine', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() };
      oscillators.push(osc);
      return osc;
    }),
    _oscillators: oscillators,
    _gain: gainNode,
  };
};

describe('createRingtone', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts oscillators when the audio context is running', () => {
    const ctx = makeFakeAudioContext('running');
    const ring = createRingtone({ AudioContextCtor: () => ctx });
    ring.start('ring');
    expect(ctx._oscillators.length).toBeGreaterThan(0);
    expect(ctx._oscillators[0].start).toHaveBeenCalled();
  });

  it('plays nothing when autoplay policy has suspended the context, instead of throwing', () => {
    const ctx = makeFakeAudioContext('suspended');
    const ring = createRingtone({ AudioContextCtor: () => ctx });
    expect(() => ring.start('ring')).not.toThrow();
    expect(ctx._oscillators).toHaveLength(0);
  });

  it('survives an environment with no AudioContext at all', () => {
    const ring = createRingtone({ AudioContextCtor: () => { throw new Error('unsupported'); } });
    expect(() => ring.start('ring')).not.toThrow();
    expect(() => ring.stop()).not.toThrow();
  });

  it('vibrates on each ring burst when vibration is available', () => {
    const vibrate = vi.fn();
    const ring = createRingtone({ AudioContextCtor: () => makeFakeAudioContext(), vibrate });
    ring.start('ring');
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(6000);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('does not vibrate for the caller-side ringback', () => {
    const vibrate = vi.fn();
    const ring = createRingtone({ AudioContextCtor: () => makeFakeAudioContext(), vibrate });
    ring.start('ringback');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('stops oscillators, cancels the loop and closes the context on stop', () => {
    const ctx = makeFakeAudioContext();
    const vibrate = vi.fn();
    const ring = createRingtone({ AudioContextCtor: () => ctx, vibrate });
    ring.start('ring');
    ring.stop();
    expect(ctx._oscillators[0].stop).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
    vi.advanceTimersByTime(20000);
    expect(vibrate).toHaveBeenCalledTimes(1); // no further bursts after stop
  });

  it('starting twice does not stack two ringtones', () => {
    const ctx = makeFakeAudioContext();
    const ring = createRingtone({ AudioContextCtor: () => ctx });
    ring.start('ring');
    const afterFirst = ctx._oscillators.length;
    ring.start('ring');
    expect(ctx._oscillators.length).toBe(afterFirst);
  });

  it('stop is safe to call when never started', () => {
    const ring = createRingtone({ AudioContextCtor: () => makeFakeAudioContext() });
    expect(() => ring.stop()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`: `npx vitest run src/lib/ringtone.test.js`
Expected: FAIL — cannot resolve `./ringtone.js`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/ringtone.js`:

```js
// A ringtone synthesized with the Web Audio API rather than shipped as an
// audio file: no asset to 404, no bundle weight, and no licensing question.
//
// Browsers suspend an AudioContext created without a prior user gesture. An
// incoming call is exactly that case, so a suspended context is treated as
// "no sound" -- the visual overlay and vibration still fire. Audio policy
// must never be able to stop a call from being answerable.

const PATTERNS = {
  // Callee side: two-tone burst, 2s on / 4s off, with vibration.
  ring: { freqs: [440, 480], onMs: 2000, cycleMs: 6000, gain: 0.12, vibrate: true },
  // Caller side: quieter single tone so you can hear the other end connect.
  ringback: { freqs: [420], onMs: 1000, cycleMs: 4000, gain: 0.06, vibrate: false },
};

const defaultAudioContextCtor = () => new (window.AudioContext || window.webkitAudioContext)();

export const createRingtone = ({
  AudioContextCtor = defaultAudioContextCtor,
  vibrate = (pattern) => navigator.vibrate?.(pattern),
} = {}) => {
  let ctx = null;
  let loopId = null;
  let oscillators = [];
  let running = false;

  const burst = (pattern) => {
    if (!ctx || ctx.state !== 'running') return;
    const gain = ctx.createGain();
    gain.gain.value = pattern.gain;
    gain.connect(ctx.destination);

    oscillators = pattern.freqs.map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + pattern.onMs / 1000);
      return osc;
    });
  };

  const start = (patternName = 'ring') => {
    if (running) return;
    const pattern = PATTERNS[patternName] || PATTERNS.ring;
    running = true;

    try { ctx = AudioContextCtor(); } catch { ctx = null; }

    const tick = () => {
      burst(pattern);
      if (pattern.vibrate) { try { vibrate([500, 1000]); } catch { /* unsupported */ } }
    };

    tick();
    loopId = setInterval(tick, pattern.cycleMs);
  };

  const stop = () => {
    running = false;
    if (loopId) { clearInterval(loopId); loopId = null; }
    for (const osc of oscillators) { try { osc.stop(); osc.disconnect(); } catch { /* already stopped */ } }
    oscillators = [];
    if (ctx) { try { ctx.close(); } catch { /* already closed */ } ctx = null; }
    try { vibrate(0); } catch { /* unsupported */ }
  };

  return { start, stop };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `frontend/`: `npx vitest run src/lib/ringtone.test.js`
Expected: PASS, 8 tests.

Note: the "does not vibrate after stop" assertion counts calls to `vibrate` with a pattern array; `stop()` calls `vibrate(0)` to cancel, which is an additional call. If the assertion fails by one, change the test's final expectation to filter for array arguments rather than loosening the implementation.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/ringtone.js frontend/src/lib/ringtone.test.js
git commit -m "feat: add Web Audio ringtone generator with vibration and autoplay-policy fallback"
```

---

### Task 5: Call state machine reducer (`lib/callState.js`)

**Files:**
- Create: `frontend/src/lib/callState.js`
- Test: `frontend/src/lib/callState.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `initialCallState: CallState`
  - `callReducer(state: CallState, action: Action) => CallState`
  - `isCallBusy(state) => boolean`
  - Action types: `START_CALL`, `INCOMING_CALL`, `ANSWER`, `PEER_ACCEPTED`, `PEER_REJECTED`, `PEER_CONNECTED`, `PEER_FAILED`, `PEER_LEFT`, `PEER_MEDIA_STATE`, `SET_LOCAL_MEDIA`, `SET_MINIMIZED`, `RING_TIMEOUT`, `CALL_ERROR`, `END_CALL`, `RESET`
  - `CallState` shape:
    ```
    { status, callId, conversationId, callType, isGroup, minimized,
      caller: { _id, username, fullName, avatar } | null,
      peers: { [userId]: { userId, user, state, audioEnabled, videoEnabled } },
      localAudio: boolean, localVideo: boolean,
      startedAt: number | null, endedReason: string | null, error: string | null }
    ```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/callState.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { initialCallState, callReducer, isCallBusy } from './callState.js';

const reduce = (state, ...actions) => actions.reduce(callReducer, state);

const outgoing = () => callReducer(initialCallState, {
  type: 'START_CALL',
  callId: 'c1',
  conversationId: 'conv1',
  callType: 'video',
  peerIds: ['bob'],
});

const incoming = () => callReducer(initialCallState, {
  type: 'INCOMING_CALL',
  callId: 'c1',
  conversationId: 'conv1',
  callType: 'audio',
  caller: { _id: 'alice', username: 'alice' },
  memberIds: ['alice', 'me'],
  selfId: 'me',
});

describe('callReducer — outgoing', () => {
  it('moves idle to outgoing and seeds a peer per invitee', () => {
    const s = outgoing();
    expect(s.status).toBe('outgoing');
    expect(s.callType).toBe('video');
    expect(Object.keys(s.peers)).toEqual(['bob']);
    expect(s.peers.bob.state).toBe('ringing');
  });

  it('turns the local camera on for a video call and off for audio', () => {
    expect(outgoing().localVideo).toBe(true);
    const audio = callReducer(initialCallState, {
      type: 'START_CALL', callId: 'c1', conversationId: 'conv1', callType: 'audio', peerIds: ['bob'],
    });
    expect(audio.localVideo).toBe(false);
    expect(audio.localAudio).toBe(true);
  });

  it('flags a call with more than one invitee as a group call', () => {
    const s = callReducer(initialCallState, {
      type: 'START_CALL', callId: 'c1', conversationId: 'conv1', callType: 'audio', peerIds: ['b', 'c'],
    });
    expect(s.isGroup).toBe(true);
    expect(outgoing().isGroup).toBe(false);
  });

  it('ignores START_CALL when a call is already in progress', () => {
    const s = outgoing();
    expect(callReducer(s, { type: 'START_CALL', callId: 'c2', conversationId: 'x', callType: 'audio', peerIds: ['z'] }))
      .toBe(s);
  });

  it('moves to connecting on the first acceptance', () => {
    const s = reduce(outgoing(), { type: 'PEER_ACCEPTED', userId: 'bob' });
    expect(s.status).toBe('connecting');
    expect(s.peers.bob.state).toBe('connecting');
  });

  it('ends the call when every invitee rejects', () => {
    const s = reduce(outgoing(), { type: 'PEER_REJECTED', userId: 'bob', reason: 'declined' });
    expect(s.status).toBe('ended');
    expect(s.endedReason).toBe('declined');
  });

  it('stays up when only one of several invitees rejects', () => {
    const start = callReducer(initialCallState, {
      type: 'START_CALL', callId: 'c1', conversationId: 'conv1', callType: 'audio', peerIds: ['b', 'c'],
    });
    const s = reduce(start, { type: 'PEER_REJECTED', userId: 'b', reason: 'declined' });
    expect(s.status).toBe('outgoing');
    expect(s.peers.b).toBeUndefined();
  });

  it('ends with a missed reason on ring timeout', () => {
    const s = reduce(outgoing(), { type: 'RING_TIMEOUT' });
    expect(s.status).toBe('ended');
    expect(s.endedReason).toBe('missed');
  });

  it('does not let a ring timeout kill a call that already connected', () => {
    const s = reduce(outgoing(),
      { type: 'PEER_ACCEPTED', userId: 'bob' },
      { type: 'PEER_CONNECTED', userId: 'bob' },
      { type: 'RING_TIMEOUT' });
    expect(s.status).toBe('active');
  });
});

describe('callReducer — incoming', () => {
  it('moves idle to incoming and records the caller', () => {
    const s = incoming();
    expect(s.status).toBe('incoming');
    expect(s.caller.username).toBe('alice');
  });

  it('seeds a peer for every member except me', () => {
    const s = incoming();
    expect(Object.keys(s.peers)).toEqual(['alice']);
  });

  it('answering moves to connecting and honours the chosen video mode', () => {
    const s = reduce(incoming(), { type: 'ANSWER', withVideo: false });
    expect(s.status).toBe('connecting');
    expect(s.localVideo).toBe(false);
  });

  it('answering a video call with video on enables the camera', () => {
    const videoIncoming = callReducer(initialCallState, {
      type: 'INCOMING_CALL', callId: 'c1', conversationId: 'conv1', callType: 'video',
      caller: { _id: 'alice' }, memberIds: ['alice', 'me'], selfId: 'me',
    });
    expect(callReducer(videoIncoming, { type: 'ANSWER', withVideo: true }).localVideo).toBe(true);
  });

  it('ignores a second incoming call while busy, so an active call is never hijacked', () => {
    const s = reduce(incoming(), { type: 'ANSWER', withVideo: false }, { type: 'PEER_CONNECTED', userId: 'alice' });
    const after = callReducer(s, {
      type: 'INCOMING_CALL', callId: 'c2', conversationId: 'conv2', callType: 'audio',
      caller: { _id: 'carol' }, memberIds: ['carol', 'me'], selfId: 'me',
    });
    expect(after).toBe(s);
  });
});

describe('callReducer — active call', () => {
  const active = () => reduce(outgoing(),
    { type: 'PEER_ACCEPTED', userId: 'bob' },
    { type: 'PEER_CONNECTED', userId: 'bob' });

  it('records the start time exactly once, on the first connection', () => {
    const s = active();
    expect(s.status).toBe('active');
    expect(typeof s.startedAt).toBe('number');
    const later = callReducer(s, { type: 'PEER_CONNECTED', userId: 'bob' });
    expect(later.startedAt).toBe(s.startedAt);
  });

  it('ends the call when the last peer leaves', () => {
    const s = callReducer(active(), { type: 'PEER_LEFT', userId: 'bob' });
    expect(s.status).toBe('ended');
    expect(s.endedReason).toBe('completed');
  });

  it('stays active when one of several peers leaves', () => {
    const start = callReducer(initialCallState, {
      type: 'START_CALL', callId: 'c1', conversationId: 'conv1', callType: 'audio', peerIds: ['b', 'c'],
    });
    const s = reduce(start,
      { type: 'PEER_ACCEPTED', userId: 'b' }, { type: 'PEER_CONNECTED', userId: 'b' },
      { type: 'PEER_ACCEPTED', userId: 'c' }, { type: 'PEER_CONNECTED', userId: 'c' },
      { type: 'PEER_LEFT', userId: 'b' });
    expect(s.status).toBe('active');
    expect(Object.keys(s.peers)).toEqual(['c']);
  });

  it('ends with failed when every peer connection fails', () => {
    const s = reduce(outgoing(), { type: 'PEER_ACCEPTED', userId: 'bob' }, { type: 'PEER_FAILED', userId: 'bob' });
    expect(s.status).toBe('ended');
    expect(s.endedReason).toBe('failed');
    expect(s.error).toMatch(/TURN|connect/i);
  });

  it('tracks a peer muting their microphone', () => {
    const s = callReducer(active(), {
      type: 'PEER_MEDIA_STATE', userId: 'bob', audioEnabled: false, videoEnabled: true,
    });
    expect(s.peers.bob.audioEnabled).toBe(false);
    expect(s.peers.bob.videoEnabled).toBe(true);
  });

  it('ignores media state for a peer who already left', () => {
    const s = callReducer(active(), { type: 'PEER_MEDIA_STATE', userId: 'ghost', audioEnabled: false });
    expect(s.peers.ghost).toBeUndefined();
  });

  it('toggles local audio and video', () => {
    const s = callReducer(active(), { type: 'SET_LOCAL_MEDIA', localAudio: false });
    expect(s.localAudio).toBe(false);
    expect(s.localVideo).toBe(true);
  });

  it('minimizes and restores without changing status', () => {
    const s = callReducer(active(), { type: 'SET_MINIMIZED', minimized: true });
    expect(s.minimized).toBe(true);
    expect(s.status).toBe('active');
  });

  it('END_CALL always terminates, whatever the status', () => {
    expect(callReducer(active(), { type: 'END_CALL' }).status).toBe('ended');
    expect(callReducer(outgoing(), { type: 'END_CALL' }).status).toBe('ended');
    expect(callReducer(incoming(), { type: 'END_CALL', reason: 'declined' }).endedReason).toBe('declined');
  });

  it('RESET returns to a pristine idle state', () => {
    expect(callReducer(callReducer(active(), { type: 'END_CALL' }), { type: 'RESET' })).toEqual(initialCallState);
  });

  it('preserves the duration on END_CALL so the call log can report it', () => {
    const s = { ...active(), startedAt: Date.now() - 5000 };
    expect(callReducer(s, { type: 'END_CALL' }).startedAt).toBe(s.startedAt);
  });
});

describe('isCallBusy', () => {
  it('is false only when idle or ended', () => {
    expect(isCallBusy(initialCallState)).toBe(false);
    expect(isCallBusy(outgoing())).toBe(true);
    expect(isCallBusy(incoming())).toBe(true);
    expect(isCallBusy(callReducer(outgoing(), { type: 'END_CALL' }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `frontend/`: `npx vitest run src/lib/callState.test.js`
Expected: FAIL — cannot resolve `./callState.js`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/callState.js`:

```js
// The whole lifecycle of a call as a pure reducer. Keeping it out of the
// React context means every transition -- including the ones that are hard
// to reproduce by hand, like "all peers failed" or "a second call arrives
// mid-call" -- is directly testable.

export const initialCallState = {
  status: 'idle',       // idle | outgoing | incoming | connecting | active | ended
  callId: null,
  conversationId: null,
  callType: null,       // 'audio' | 'video'
  isGroup: false,
  minimized: false,
  caller: null,         // who rang us (incoming only)
  peers: {},            // userId -> { userId, user, state, audioEnabled, videoEnabled }
  localAudio: true,
  localVideo: false,
  startedAt: null,
  endedReason: null,    // completed | missed | declined | failed | busy
  error: null,
};

const makePeer = (userId, user = null) => ({
  userId: String(userId),
  user,
  state: 'ringing',     // ringing | connecting | connected | failed
  audioEnabled: true,
  videoEnabled: false,
});

const peersFromIds = (ids, users = {}) =>
  Object.fromEntries(ids.map(id => [String(id), makePeer(id, users[String(id)] || null)]));

const withoutPeer = (peers, userId) => {
  const next = { ...peers };
  delete next[String(userId)];
  return next;
};

const ended = (state, reason, error = null) => ({
  ...state, status: 'ended', endedReason: reason, error, minimized: false,
});

export const isCallBusy = (state) => state.status !== 'idle' && state.status !== 'ended';

export const callReducer = (state, action) => {
  switch (action.type) {
    case 'START_CALL': {
      if (isCallBusy(state)) return state;
      return {
        ...initialCallState,
        status: 'outgoing',
        callId: action.callId,
        conversationId: action.conversationId,
        callType: action.callType,
        isGroup: action.peerIds.length > 1,
        peers: peersFromIds(action.peerIds, action.users),
        localAudio: true,
        localVideo: action.callType === 'video',
      };
    }

    case 'INCOMING_CALL': {
      // Never let a new ring displace a call in progress. The context answers
      // this one with call:busy instead.
      if (isCallBusy(state)) return state;
      const others = action.memberIds.map(String).filter(id => id !== String(action.selfId));
      return {
        ...initialCallState,
        status: 'incoming',
        callId: action.callId,
        conversationId: action.conversationId,
        callType: action.callType,
        isGroup: others.length > 1,
        caller: action.caller,
        peers: peersFromIds(others, { [String(action.caller?._id)]: action.caller }),
        localAudio: true,
        localVideo: false,
      };
    }

    case 'ANSWER': {
      if (state.status !== 'incoming') return state;
      return {
        ...state,
        status: 'connecting',
        localVideo: state.callType === 'video' && !!action.withVideo,
      };
    }

    case 'PEER_ACCEPTED': {
      const peer = state.peers[String(action.userId)];
      if (!peer) return state;
      return {
        ...state,
        status: state.status === 'outgoing' ? 'connecting' : state.status,
        peers: { ...state.peers, [peer.userId]: { ...peer, state: 'connecting' } },
      };
    }

    case 'PEER_REJECTED':
    case 'PEER_BUSY': {
      const peers = withoutPeer(state.peers, action.userId);
      if (Object.keys(peers).length === 0) {
        return ended({ ...state, peers }, action.type === 'PEER_BUSY' ? 'busy' : (action.reason || 'declined'));
      }
      return { ...state, peers };
    }

    case 'PEER_CONNECTED': {
      const peer = state.peers[String(action.userId)];
      if (!peer) return state;
      return {
        ...state,
        status: 'active',
        startedAt: state.startedAt ?? Date.now(),
        peers: { ...state.peers, [peer.userId]: { ...peer, state: 'connected' } },
      };
    }

    case 'PEER_FAILED': {
      const peers = withoutPeer(state.peers, action.userId);
      if (Object.keys(peers).length === 0) {
        return ended({ ...state, peers }, 'failed',
          "Couldn't connect — this network needs a TURN server.");
      }
      return { ...state, peers };
    }

    case 'PEER_LEFT': {
      const peers = withoutPeer(state.peers, action.userId);
      if (Object.keys(peers).length === 0) return ended({ ...state, peers }, 'completed');
      return { ...state, peers };
    }

    case 'PEER_MEDIA_STATE': {
      const peer = state.peers[String(action.userId)];
      if (!peer) return state;
      return {
        ...state,
        peers: {
          ...state.peers,
          [peer.userId]: {
            ...peer,
            audioEnabled: action.audioEnabled ?? peer.audioEnabled,
            videoEnabled: action.videoEnabled ?? peer.videoEnabled,
          },
        },
      };
    }

    case 'SET_LOCAL_MEDIA':
      return {
        ...state,
        localAudio: action.localAudio ?? state.localAudio,
        localVideo: action.localVideo ?? state.localVideo,
      };

    case 'SET_MINIMIZED':
      return { ...state, minimized: !!action.minimized };

    case 'RING_TIMEOUT':
      // Only meaningful while nobody has picked up yet.
      if (state.status !== 'outgoing' && state.status !== 'incoming') return state;
      return ended(state, 'missed');

    case 'CALL_ERROR':
      return ended(state, 'failed', action.message);

    case 'END_CALL':
      if (state.status === 'idle') return state;
      return ended(state, action.reason || (state.startedAt ? 'completed' : 'missed'));

    case 'RESET':
      return initialCallState;

    default:
      return state;
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `frontend/`: `npx vitest run src/lib/callState.test.js`
Expected: PASS, 25 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/callState.js frontend/src/lib/callState.test.js
git commit -m "feat: add pure call state machine reducer"
```

---

### Task 6: `CallContext` — mesh orchestration

**Files:**
- Create: `frontend/src/context/CallContext.jsx`
- Modify: `frontend/src/App.jsx` (mount the provider)

**Interfaces:**
- Consumes: `webrtc.js` (Task 1), `callState.js` (Task 5), `ringtone.js` (Task 4), the socket contract from Task 3, existing `useAuth`, `useSocket`.
- Produces: `useCall()` returning
  ```
  { call,                       // CallState from callState.js
    localStream, remoteStreams, // MediaStream | Map<userId, MediaStream>
    startCall(conversation, callType),
    answer({ withVideo }), decline(), endCall(),
    toggleAudio(), toggleVideo(), setMinimized(bool), openChat(),
    canFlipCamera, flipCamera(), canSetSpeaker }
  ```

- [ ] **Step 1: Write the provider**

Create `frontend/src/context/CallContext.jsx`:

```jsx
import { createContext, useContext, useReducer, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { messageAPI } from '../services/api';
import { initialCallState, callReducer, isCallBusy } from '../lib/callState';
import {
  createPeerConnection, isOfferer, getMediaConstraints,
  videoSenderParams, capParticipants, describeMediaError, MAX_CALL_PARTICIPANTS,
} from '../lib/webrtc';
import { createRingtone } from '../lib/ringtone';

const CallContext = createContext(null);

const RING_TIMEOUT_MS = 30000;
const newCallId = () => (crypto.randomUUID ? crypto.randomUUID() : `call-${Date.now()}-${Math.random()}`);

export const CallProvider = ({ children }) => {
  const { user } = useAuth();
  const { emit, on } = useSocket();
  const navigate = useNavigate();

  const [call, dispatch] = useReducer(callReducer, initialCallState);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [canFlipCamera, setCanFlipCamera] = useState(false);

  const peers = useRef(new Map());          // userId -> RTCPeerConnection
  const pendingIce = useRef(new Map());     // userId -> RTCIceCandidateInit[]
  const localStreamRef = useRef(null);
  const callRef = useRef(call);
  const ringtone = useRef(null);
  const ringTimer = useRef(null);
  const facingMode = useRef('user');

  useEffect(() => { callRef.current = call; }, [call]);

  const canSetSpeaker = typeof HTMLMediaElement !== 'undefined'
    && typeof HTMLMediaElement.prototype.setSinkId === 'function';

  // ---- media -------------------------------------------------------------

  const getLocalStream = useCallback(async (callType, peerCount) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        getMediaConstraints({ callType, peerCount })
      );
      localStreamRef.current = stream;
      setLocalStream(stream);
      return { stream, callType };
    } catch (err) {
      const { message, fallbackToAudio } = describeMediaError(err, callType);
      if (fallbackToAudio) {
        toast(message);
        return getLocalStream('audio', peerCount);
      }
      toast.error(message);
      return { stream: null, callType };
    }
  }, []);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  // ---- peer connections --------------------------------------------------

  const closePeer = useCallback((userId) => {
    const pc = peers.current.get(String(userId));
    if (pc) { pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); }
    peers.current.delete(String(userId));
    pendingIce.current.delete(String(userId));
    setRemoteStreams(prev => {
      const next = new Map(prev);
      next.delete(String(userId));
      return next;
    });
  }, []);

  const createPeer = useCallback((peerUserId, callId) => {
    const id = String(peerUserId);
    if (peers.current.has(id)) return peers.current.get(id);

    const pc = createPeerConnection(import.meta.env);
    peers.current.set(id, pc);

    for (const track of localStreamRef.current?.getTracks() || []) {
      const sender = pc.addTrack(track, localStreamRef.current);
      if (track.kind === 'video') {
        const params = videoSenderParams(Object.keys(callRef.current.peers).length);
        if (params) {
          const p = sender.getParameters();
          p.encodings = [{ ...(p.encodings?.[0] || {}), maxBitrate: params.maxBitrate }];
          sender.setParameters(p).catch(() => { /* not supported everywhere */ });
        }
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) emit('ice:candidate', { callId, toUserId: id, candidate: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      setRemoteStreams(prev => new Map(prev).set(id, e.streams[0]));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') dispatch({ type: 'PEER_CONNECTED', userId: id });
      if (pc.connectionState === 'failed') dispatch({ type: 'PEER_FAILED', userId: id });
      if (pc.connectionState === 'closed') dispatch({ type: 'PEER_LEFT', userId: id });
    };

    return pc;
  }, [emit]);

  const sendOffer = useCallback(async (peerUserId, callId) => {
    const pc = createPeer(peerUserId, callId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    emit('call:offer', { callId, toUserId: String(peerUserId), sdp: pc.localDescription });
  }, [createPeer, emit]);

  const drainIce = useCallback(async (userId) => {
    const pc = peers.current.get(String(userId));
    const queued = pendingIce.current.get(String(userId)) || [];
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
    }
    pendingIce.current.delete(String(userId));
  }, []);

  // ---- teardown ----------------------------------------------------------

  const teardown = useCallback(() => {
    for (const id of [...peers.current.keys()]) closePeer(id);
    stopLocalStream();
    ringtone.current?.stop();
    ringtone.current = null;
    if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null; }
  }, [closePeer, stopLocalStream]);

  // Write the call log, then reset. The initiator (or the callee of a 1-on-1)
  // is the one holding the outcome, so the client that reaches `ended` writes
  // it; the endpoint is idempotent per callId so a duplicate from the other
  // side is discarded server-side.
  useEffect(() => {
    if (call.status !== 'ended') return;
    const { callId, conversationId, callType, endedReason, startedAt } = call;

    teardown();

    if (conversationId && callId) {
      messageAPI.logCall(conversationId, {
        callId,
        callType,
        outcome: endedReason || 'completed',
        duration: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
      }).catch(() => { /* a missing log must never block the UI */ });
    }

    const t = setTimeout(() => dispatch({ type: 'RESET' }), 2000);
    return () => clearTimeout(t);
  }, [call.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ringing -----------------------------------------------------------

  useEffect(() => {
    if (call.status === 'incoming') {
      ringtone.current = createRingtone();
      ringtone.current.start('ring');
    } else if (call.status === 'outgoing') {
      ringtone.current = createRingtone();
      ringtone.current.start('ringback');
    } else {
      ringtone.current?.stop();
      ringtone.current = null;
    }

    if (call.status === 'incoming' || call.status === 'outgoing') {
      ringTimer.current = setTimeout(() => dispatch({ type: 'RING_TIMEOUT' }), RING_TIMEOUT_MS);
    }

    return () => {
      if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null; }
    };
  }, [call.status]);

  // ---- public API --------------------------------------------------------

  const startCall = useCallback(async (conversation, callType) => {
    if (isCallBusy(callRef.current)) { toast.error('You are already on a call'); return; }
    if (!window.isSecureContext) { toast.error('Calls need a secure (https) connection'); return; }

    const participantIds = (conversation.participants || []).map(p => String(p._id || p));
    const peerIds = capParticipants(participantIds, user._id);
    if (peerIds.length === 0) { toast.error('Nobody to call in this chat'); return; }
    if (participantIds.length > MAX_CALL_PARTICIPANTS) {
      toast.error(`Calls support up to ${MAX_CALL_PARTICIPANTS} people`);
      return;
    }

    const { stream, callType: effectiveType } = await getLocalStream(callType, peerIds.length);
    if (!stream) return;

    const callId = newCallId();
    const users = Object.fromEntries(
      (conversation.participants || [])
        .filter(p => String(p._id || p) !== String(user._id))
        .map(p => [String(p._id || p), p])
    );

    dispatch({
      type: 'START_CALL', callId, conversationId: conversation._id,
      callType: effectiveType, peerIds, users,
    });

    emit('call:initiate', {
      callId, conversationId: conversation._id, participantIds: peerIds, callType: effectiveType,
    });
  }, [emit, getLocalStream, user?._id]);

  const answer = useCallback(async ({ withVideo }) => {
    const current = callRef.current;
    if (current.status !== 'incoming') return;

    const peerIds = Object.keys(current.peers);
    const wanted = withVideo && current.callType === 'video' ? 'video' : 'audio';
    const { stream } = await getLocalStream(wanted, peerIds.length);
    if (!stream) { dispatch({ type: 'END_CALL', reason: 'failed' }); return; }

    dispatch({ type: 'ANSWER', withVideo: wanted === 'video' });

    for (const peerId of peerIds) {
      emit('call:accept', { callId: current.callId, toUserId: peerId });
      // Both sides now know about each other; the glare rule decides who
      // sends the offer so exactly one is created per pair.
      if (isOfferer(user._id, peerId)) sendOffer(peerId, current.callId);
      else createPeer(peerId, current.callId);
    }
  }, [emit, getLocalStream, sendOffer, createPeer, user?._id]);

  const decline = useCallback(() => {
    const current = callRef.current;
    for (const peerId of Object.keys(current.peers)) {
      emit('call:reject', { callId: current.callId, toUserId: peerId, reason: 'declined' });
    }
    dispatch({ type: 'END_CALL', reason: 'declined' });
  }, [emit]);

  const endCall = useCallback(() => {
    emit('call:leave', { callId: callRef.current.callId });
    dispatch({ type: 'END_CALL' });
  }, [emit]);

  const broadcastMediaState = useCallback((audioEnabled, videoEnabled) => {
    emit('call:media-state', { callId: callRef.current.callId, audioEnabled, videoEnabled });
  }, [emit]);

  const toggleAudio = useCallback(() => {
    const next = !callRef.current.localAudio;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = next; });
    dispatch({ type: 'SET_LOCAL_MEDIA', localAudio: next });
    broadcastMediaState(next, callRef.current.localVideo);
  }, [broadcastMediaState]);

  const toggleVideo = useCallback(async () => {
    const current = callRef.current;
    const next = !current.localVideo;
    const existing = localStreamRef.current?.getVideoTracks() || [];

    if (next && existing.length === 0) {
      // Upgrading an audio call to video: acquire a camera track and add it
      // to every peer, which triggers renegotiation via onnegotiationneeded
      // -- we drive it explicitly instead, to keep the glare rule in charge.
      try {
        const camStream = await navigator.mediaDevices.getUserMedia(
          getMediaConstraints({ callType: 'video', peerCount: Object.keys(current.peers).length })
        );
        const track = camStream.getVideoTracks()[0];
        localStreamRef.current?.addTrack(track);
        setLocalStream(localStreamRef.current);
        for (const [peerId, pc] of peers.current.entries()) {
          pc.addTrack(track, localStreamRef.current);
          if (isOfferer(user._id, peerId)) await sendOffer(peerId, current.callId);
        }
      } catch (err) {
        toast.error(describeMediaError(err, 'video').message);
        return;
      }
    } else {
      existing.forEach(t => { t.enabled = next; });
    }

    dispatch({ type: 'SET_LOCAL_MEDIA', localVideo: next });
    broadcastMediaState(current.localAudio, next);
  }, [broadcastMediaState, sendOffer, user?._id]);

  const flipCamera = useCallback(async () => {
    facingMode.current = facingMode.current === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode.current }, audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      for (const pc of peers.current.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        await sender?.replaceTrack(newTrack);
      }
      const old = localStreamRef.current?.getVideoTracks()[0];
      if (old) { localStreamRef.current.removeTrack(old); old.stop(); }
      localStreamRef.current?.addTrack(newTrack);
      setLocalStream(localStreamRef.current);
    } catch { toast.error("Couldn't switch camera"); }
  }, []);

  const setMinimized = useCallback((minimized) => {
    dispatch({ type: 'SET_MINIMIZED', minimized });
  }, []);

  // Detect a second camera once, when a video call becomes active.
  useEffect(() => {
    if (call.status !== 'active' || !call.localVideo) return;
    navigator.mediaDevices?.enumerateDevices?.()
      .then(devices => setCanFlipCamera(devices.filter(d => d.kind === 'videoinput').length > 1))
      .catch(() => setCanFlipCamera(false));
  }, [call.status, call.localVideo]);

  // ---- socket wiring -----------------------------------------------------

  useEffect(() => {
    if (!on) return;

    const offIncoming = on('call:incoming', (data) => {
      if (isCallBusy(callRef.current)) {
        emit('call:busy', { callId: data.callId, toUserId: String(data.caller?._id) });
        return;
      }
      dispatch({
        type: 'INCOMING_CALL',
        callId: data.callId,
        conversationId: data.conversationId,
        callType: data.callType,
        caller: data.caller,
        memberIds: data.memberIds,
        selfId: user._id,
      });
    });

    const offRingStatus = on('call:ring-status', ({ offlineUserIds }) => {
      if (offlineUserIds?.length) toast(`${offlineUserIds.length} person(s) are offline`);
    });

    const offAccepted = on('call:accepted', async ({ callId, fromUserId }) => {
      if (callRef.current.callId !== callId) return;
      dispatch({ type: 'PEER_ACCEPTED', userId: fromUserId });
      if (isOfferer(user._id, fromUserId)) await sendOffer(fromUserId, callId);
      else createPeer(fromUserId, callId);
    });

    const offRejected = on('call:rejected', ({ callId, fromUserId, reason }) => {
      if (callRef.current.callId !== callId) return;
      closePeer(fromUserId);
      dispatch({ type: 'PEER_REJECTED', userId: fromUserId, reason });
    });

    const offBusy = on('call:busy', ({ callId, fromUserId }) => {
      if (callRef.current.callId !== callId) return;
      closePeer(fromUserId);
      dispatch({ type: 'PEER_BUSY', userId: fromUserId });
    });

    const offOffer = on('call:offer', async ({ callId, fromUserId, sdp }) => {
      if (callRef.current.callId !== callId) return;
      const pc = createPeer(fromUserId, callId);
      await pc.setRemoteDescription(sdp);
      await drainIce(fromUserId);
      const answerSdp = await pc.createAnswer();
      await pc.setLocalDescription(answerSdp);
      emit('call:answer', { callId, toUserId: String(fromUserId), sdp: pc.localDescription });
    });

    const offAnswer = on('call:answer', async ({ callId, fromUserId, sdp }) => {
      if (callRef.current.callId !== callId) return;
      const pc = peers.current.get(String(fromUserId));
      if (!pc) return;
      await pc.setRemoteDescription(sdp);
      await drainIce(fromUserId);
    });

    const offIce = on('ice:candidate', async ({ callId, fromUserId, candidate }) => {
      if (callRef.current.callId !== callId) return;
      const pc = peers.current.get(String(fromUserId));
      // Candidates can arrive before the remote description is set; queue
      // them rather than throwing them away.
      if (!pc || !pc.remoteDescription) {
        const queue = pendingIce.current.get(String(fromUserId)) || [];
        queue.push(candidate);
        pendingIce.current.set(String(fromUserId), queue);
        return;
      }
      try { await pc.addIceCandidate(candidate); } catch { /* stale candidate */ }
    });

    const offPeerLeft = on('call:peer-left', ({ callId, userId }) => {
      if (callRef.current.callId !== callId) return;
      closePeer(userId);
      dispatch({ type: 'PEER_LEFT', userId });
    });

    const offMediaState = on('call:peer-media-state', ({ callId, userId, audioEnabled, videoEnabled }) => {
      if (callRef.current.callId !== callId) return;
      dispatch({ type: 'PEER_MEDIA_STATE', userId, audioEnabled, videoEnabled });
    });

    const offError = on('call:error', ({ message }) => {
      dispatch({ type: 'CALL_ERROR', message: message || "Couldn't start the call" });
    });

    return () => {
      offIncoming?.(); offRingStatus?.(); offAccepted?.(); offRejected?.(); offBusy?.();
      offOffer?.(); offAnswer?.(); offIce?.(); offPeerLeft?.(); offMediaState?.(); offError?.();
    };
  }, [on, emit, user?._id, sendOffer, createPeer, closePeer, drainIce]);

  // Logging out mid-call must not leave the camera light on.
  useEffect(() => {
    if (!user && isCallBusy(callRef.current)) dispatch({ type: 'END_CALL', reason: 'failed' });
  }, [user]);

  const openChat = useCallback(() => {
    setMinimized(true);
    if (callRef.current.conversationId) navigate(`/messages/${callRef.current.conversationId}`);
  }, [navigate, setMinimized]);

  return (
    <CallContext.Provider value={{
      call, localStream, remoteStreams,
      startCall, answer, decline, endCall,
      toggleAudio, toggleVideo, setMinimized, openChat,
      canFlipCamera, flipCamera, canSetSpeaker,
    }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
};
```

- [ ] **Step 2: Add `logCall` to the API client**

In `frontend/src/services/api.js`, inside the `messageAPI` object (after `getUnreadCount`, line 207), add:

```js
  logCall: (conversationId, data) => API.post(`/messages/conversations/${conversationId}/call-log`, data),
```

(The endpoint itself is built in Task 9; the client method is needed now so `CallContext` compiles. Until Task 9 lands it will 404, and the `.catch()` in `CallContext` swallows that by design.)

- [ ] **Step 3: Mount the provider**

In `frontend/src/App.jsx`, add the import next to the other context imports:

```jsx
import { CallProvider } from './context/CallContext';
```

Then wrap `<AppRoutes />` — `CallProvider` must sit inside `BrowserRouter` (it navigates) and inside `DialogProvider` is fine too. Replace lines 161–176 with:

```jsx
                <DialogProvider>
                  <CallProvider>
                    <AppRoutes />
                    <Toaster
                      position="top-center"
                      toastOptions={{
                        duration: 3000,
                        style: {
                          borderRadius: '12px',
                          fontSize: '14px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border)'
                        }
                      }}
                    />
                  </CallProvider>
                </DialogProvider>
```

- [ ] **Step 4: Verify the app still builds and runs**

Run from `frontend/`: `npm run build`
Expected: build succeeds with no errors.

Then `npm run dev` from the repo root, log in, and confirm the feed renders and the browser console has no errors. No call UI exists yet — that is Task 7.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/CallContext.jsx frontend/src/App.jsx frontend/src/services/api.js
git commit -m "feat: add CallProvider with mesh peer management and socket signaling"
```

---

### Task 7: Call UI components

**Files:**
- Create: `frontend/src/components/call/ParticipantTile.jsx`
- Create: `frontend/src/components/call/CallControls.jsx`
- Create: `frontend/src/components/call/IncomingCallScreen.jsx`
- Create: `frontend/src/components/call/ActiveCallScreen.jsx`
- Create: `frontend/src/components/call/MinimizedCallPill.jsx`
- Create: `frontend/src/components/call/CallOverlay.jsx`
- Create: `frontend/src/hooks/useCallDuration.js`
- Create: `frontend/src/hooks/useCallInsights.js`
- Create: `frontend/src/lib/callQuality.js`
- Test: `frontend/src/lib/callQuality.test.js`
- Modify: `frontend/src/context/CallContext.jsx` (expose `peerConnections`)
- Modify: `frontend/src/App.jsx` (render `<CallOverlay />`)

**Interfaces:**
- Consumes: `useCall()` (Task 6), existing `Avatar` (`components/common/Avatar.jsx`).
- Produces:
  - `<CallOverlay />` — self-contained, takes no props.
  - `formatDuration(seconds) => string` and `useCallDuration(startedAt) => string | null`
  - `qualityFromLoss`, `lossRatioFromStats`, `worstQuality`, `isSpeaking` from `lib/callQuality.js`
  - `useCallInsights(peerConnections, remoteStreams, enabled) => { quality, speakingIds }`

- [ ] **Step 1: Write the duration hook**

Create `frontend/src/hooks/useCallDuration.js`:

```js
import { useEffect, useState } from 'react';

export const formatDuration = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

/** Live "mm:ss" for a call that started at `startedAt` (ms epoch, or null). */
export const useCallDuration = (startedAt) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;
  return formatDuration((now - startedAt) / 1000);
};
```

- [ ] **Step 2: Write `ParticipantTile`**

Create `frontend/src/components/call/ParticipantTile.jsx`:

```jsx
import { useEffect, useRef } from 'react';
import { FiMicOff } from 'react-icons/fi';
import Avatar from '../common/Avatar';

/**
 * One participant in the call. Renders their video when they have one, and
 * their avatar when they don't -- an audio call is just the avatar case.
 */
export default function ParticipantTile({ peer, stream, isLocal = false, mirrored = false, compact = false }) {
  const videoRef = useRef(null);
  const hasVideo = !!stream?.getVideoTracks?.().some(t => t.enabled && t.readyState === 'live');

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  const name = peer?.user?.username || peer?.user?.fullName || (isLocal ? 'You' : '');

  return (
    <div className="relative w-full h-full bg-neutral-900 rounded-2xl overflow-hidden flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover ${hasVideo ? '' : 'hidden'} ${mirrored ? 'scale-x-[-1]' : ''}`}
      />

      {!hasVideo && (
        <div className="flex flex-col items-center gap-2">
          <div className={peer?.speaking ? 'ring-4 ring-green-400 rounded-full transition-all' : ''}>
            <Avatar src={peer?.user?.avatar} size={compact ? 48 : 88} alt={name} />
          </div>
          {!compact && <p className="text-white/90 text-sm font-medium truncate max-w-[90%]">{name}</p>}
        </div>
      )}

      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 pointer-events-none">
        {hasVideo && (
          <span className="text-white text-xs font-medium bg-black/50 px-2 py-0.5 rounded-full truncate max-w-[70%]">
            {name}
          </span>
        )}
        {peer?.audioEnabled === false && (
          <span className="bg-red-500 rounded-full p-1"><FiMicOff className="w-3 h-3 text-white" /></span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `CallControls`**

Create `frontend/src/components/call/CallControls.jsx`:

```jsx
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiMessageCircle, FiVolume2, FiRefreshCw } from 'react-icons/fi';

function ControlButton({ label, active, danger, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-full transition-colors
        w-14 h-14 sm:w-14 sm:h-14 flex-shrink-0
        ${danger
          ? 'bg-red-500 hover:bg-red-600 text-white'
          : active
            ? 'bg-white text-neutral-900 hover:bg-white/90'
            : 'bg-white/15 text-white hover:bg-white/25'}`}
    >
      {children}
    </button>
  );
}

/**
 * The call's control bar. Capability-gated: buttons for things this browser
 * cannot do are not rendered at all, rather than shown and quietly ignored.
 */
export default function CallControls({
  localAudio, localVideo, onToggleAudio, onToggleVideo, onEnd, onMessage,
  canSetSpeaker, speakerOn, onToggleSpeaker,
  canFlipCamera, onFlipCamera,
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 px-4">
      <ControlButton label={localAudio ? 'Mute' : 'Unmute'} active={!localAudio} onClick={onToggleAudio}>
        {localAudio ? <FiMic className="w-6 h-6" /> : <FiMicOff className="w-6 h-6" />}
      </ControlButton>

      <ControlButton label={localVideo ? 'Turn camera off' : 'Turn camera on'} active={!localVideo} onClick={onToggleVideo}>
        {localVideo ? <FiVideo className="w-6 h-6" /> : <FiVideoOff className="w-6 h-6" />}
      </ControlButton>

      {canSetSpeaker && (
        <ControlButton label="Speaker" active={speakerOn} onClick={onToggleSpeaker}>
          <FiVolume2 className="w-6 h-6" />
        </ControlButton>
      )}

      {canFlipCamera && localVideo && (
        <ControlButton label="Flip camera" onClick={onFlipCamera}>
          <FiRefreshCw className="w-6 h-6" />
        </ControlButton>
      )}

      <ControlButton label="Message" onClick={onMessage}>
        <FiMessageCircle className="w-6 h-6" />
      </ControlButton>

      <ControlButton label="End call" danger onClick={onEnd}>
        <FiPhoneOff className="w-6 h-6" />
      </ControlButton>
    </div>
  );
}
```

- [ ] **Step 4: Write `IncomingCallScreen`**

Create `frontend/src/components/call/IncomingCallScreen.jsx`:

```jsx
import { FiPhone, FiPhoneOff, FiVideo, FiMic } from 'react-icons/fi';
import Avatar from '../common/Avatar';

export default function IncomingCallScreen({ call, onAnswer, onDecline }) {
  const caller = call.caller || {};
  const otherNames = Object.values(call.peers)
    .map(p => p.user?.username)
    .filter(Boolean);
  const subtitle = call.isGroup
    ? `${otherNames.slice(0, 2).join(', ')}${otherNames.length > 2 ? ` +${otherNames.length - 2}` : ''}`
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between
                    bg-gradient-to-b from-neutral-900 via-neutral-900 to-black
                    px-6 pt-16 pb-10 safe-area-pb">
      <div className="flex flex-col items-center gap-4 mt-8 sm:mt-16 text-center">
        <Avatar src={caller.avatar} size={128} alt={caller.fullName || caller.username} />
        <div>
          <h2 className="text-white text-2xl font-bold">{caller.username || caller.fullName || 'Unknown'}</h2>
          {subtitle && <p className="text-white/60 text-sm mt-1">{subtitle}</p>}
          <p className="text-white/70 text-sm mt-2 animate-pulse">
            Incoming {call.callType === 'video' ? 'video' : 'voice'} call…
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {call.callType === 'video' && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onAnswer({ withVideo: false })}
              className="flex items-center gap-2 text-white/80 text-sm px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <FiMic className="w-4 h-4" /> Answer as audio
            </button>
            <button
              onClick={() => onAnswer({ withVideo: true })}
              className="flex items-center gap-2 text-white/80 text-sm px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <FiVideo className="w-4 h-4" /> With video
            </button>
          </div>
        )}

        <div className="w-full flex items-center justify-around">
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={onDecline}
              aria-label="Decline call"
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
            >
              <FiPhoneOff className="w-7 h-7 text-white" />
            </button>
            <span className="text-white/60 text-xs">Decline</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => onAnswer({ withVideo: call.callType === 'video' })}
              aria-label="Answer call"
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors animate-bounce-slow"
            >
              <FiPhone className="w-7 h-7 text-white" />
            </button>
            <span className="text-white/60 text-xs">Answer</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `ActiveCallScreen`**

Create `frontend/src/components/call/ActiveCallScreen.jsx`:

```jsx
import { useMemo } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import Avatar from '../common/Avatar';
import ParticipantTile from './ParticipantTile';
import CallControls from './CallControls';
import { useCallDuration } from '../../hooks/useCallDuration';

const gridClassFor = (count) => {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (count <= 4) return 'grid-cols-2';
  return 'grid-cols-2 lg:grid-cols-3';
};

export default function ActiveCallScreen({
  call, localStream, remoteStreams,
  onToggleAudio, onToggleVideo, onEnd, onMessage, onMinimize,
  canSetSpeaker, speakerOn, onToggleSpeaker, canFlipCamera, onFlipCamera,
}) {
  const duration = useCallDuration(call.startedAt);
  const peerList = useMemo(() => Object.values(call.peers), [call.peers]);
  const primary = peerList[0];

  const statusLine = call.status === 'connecting'
    ? 'Connecting…'
    : call.status === 'ended'
      ? (call.error || 'Call ended')
      : duration || 'Connected';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-b from-neutral-900 via-neutral-900 to-black safe-area-pb">
      {/* Header: the other caller's profile image, name and live timer */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-shrink-0">
        <button
          onClick={onMinimize}
          aria-label="Minimize call"
          className="p-2 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <FiChevronDown className="w-5 h-5 text-white" />
        </button>

        {call.isGroup ? (
          <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0">
            {peerList.map(p => (
              <Avatar key={p.userId} src={p.user?.avatar} size={36} alt={p.user?.username} />
            ))}
          </div>
        ) : (
          <Avatar src={primary?.user?.avatar} size={44} alt={primary?.user?.username} />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-white font-semibold text-sm truncate">
            {call.isGroup
              ? `${peerList.length + 1} people`
              : primary?.user?.username || primary?.user?.fullName || 'Call'}
          </p>
          <p className="text-white/60 text-xs tabular-nums">{statusLine}</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 px-3 pb-3">
        {call.isGroup ? (
          <div className={`grid ${gridClassFor(peerList.length + 1)} gap-2 h-full auto-rows-fr overflow-y-auto`}>
            {peerList.map(p => (
              <ParticipantTile key={p.userId} peer={p} stream={remoteStreams.get(p.userId)} compact />
            ))}
            <ParticipantTile peer={{ user: { username: 'You' } }} stream={localStream} isLocal mirrored compact />
          </div>
        ) : (
          <div className="relative w-full h-full">
            <ParticipantTile peer={primary} stream={remoteStreams.get(primary?.userId)} />
            {call.localVideo && (
              <div className="absolute bottom-4 right-4 w-24 h-36 sm:w-32 sm:h-48 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20">
                <ParticipantTile peer={{ user: { username: 'You' } }} stream={localStream} isLocal mirrored compact />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 pb-6 pt-2">
        <CallControls
          localAudio={call.localAudio}
          localVideo={call.localVideo}
          onToggleAudio={onToggleAudio}
          onToggleVideo={onToggleVideo}
          onEnd={onEnd}
          onMessage={onMessage}
          canSetSpeaker={canSetSpeaker}
          speakerOn={speakerOn}
          onToggleSpeaker={onToggleSpeaker}
          canFlipCamera={canFlipCamera}
          onFlipCamera={onFlipCamera}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write `MinimizedCallPill`**

Create `frontend/src/components/call/MinimizedCallPill.jsx`:

```jsx
import { FiPhoneOff } from 'react-icons/fi';
import Avatar from '../common/Avatar';
import { useCallDuration } from '../../hooks/useCallDuration';

export default function MinimizedCallPill({ call, onRestore, onEnd }) {
  const duration = useCallDuration(call.startedAt);
  const primary = Object.values(call.peers)[0];

  return (
    <div className="fixed z-[95] bottom-20 lg:bottom-6 right-4 flex items-center gap-3
                    bg-neutral-900 text-white rounded-full pl-2 pr-2 py-2 shadow-2xl ring-1 ring-white/10">
      <button onClick={onRestore} className="flex items-center gap-2 pr-1" aria-label="Return to call">
        <Avatar src={primary?.user?.avatar} size={32} alt={primary?.user?.username} />
        <div className="text-left">
          <p className="text-xs font-semibold leading-tight truncate max-w-[100px]">
            {primary?.user?.username || 'Call'}
          </p>
          <p className="text-[11px] text-white/60 tabular-nums leading-tight">
            {duration || 'Connecting…'}
          </p>
        </div>
      </button>
      <button
        onClick={onEnd}
        aria-label="End call"
        className="w-9 h-9 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
      >
        <FiPhoneOff className="w-4 h-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Write `CallOverlay`**

Create `frontend/src/components/call/CallOverlay.jsx`:

```jsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCall } from '../../context/CallContext';
import IncomingCallScreen from './IncomingCallScreen';
import ActiveCallScreen from './ActiveCallScreen';
import MinimizedCallPill from './MinimizedCallPill';

/**
 * The single mount point for all call UI. It stays mounted for the whole
 * call -- minimizing only changes what it renders, never unmounting the
 * <video> elements, which is what keeps the media flowing.
 */
export default function CallOverlay() {
  const {
    call, localStream, remoteStreams,
    answer, decline, endCall, toggleAudio, toggleVideo,
    setMinimized, openChat, canFlipCamera, flipCamera, canSetSpeaker,
  } = useCall();
  const [speakerOn, setSpeakerOn] = useState(false);

  if (call.status === 'idle') return null;

  const toggleSpeaker = async () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    // 'default' is the system default output; '' asks for the communications
    // device where the browser distinguishes them.
    for (const el of document.querySelectorAll('video, audio')) {
      try { await el.setSinkId?.(next ? 'default' : ''); } catch { /* not permitted */ }
    }
  };

  const content = call.status === 'incoming'
    ? <IncomingCallScreen call={call} onAnswer={answer} onDecline={decline} />
    : call.minimized
      ? <MinimizedCallPill call={call} onRestore={() => setMinimized(false)} onEnd={endCall} />
      : (
        <ActiveCallScreen
          call={call}
          localStream={localStream}
          remoteStreams={remoteStreams}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onEnd={endCall}
          onMessage={openChat}
          onMinimize={() => setMinimized(true)}
          canSetSpeaker={canSetSpeaker}
          speakerOn={speakerOn}
          onToggleSpeaker={toggleSpeaker}
          canFlipCamera={canFlipCamera}
          onFlipCamera={flipCamera}
        />
      );

  return createPortal(content, document.body);
}
```

- [ ] **Step 8: Render the overlay**

In `frontend/src/App.jsx`, import it:

```jsx
import CallOverlay from './components/call/CallOverlay';
```

and add `<CallOverlay />` immediately after `<AppRoutes />` inside `<CallProvider>`.

- [ ] **Step 9: Add the slow-bounce animation**

In `frontend/src/styles/` find the file holding the existing `animate-fade-in` / `animate-slide-up` keyframes (grep for `slide-up`) and append:

```css
@keyframes bounce-slow {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
.animate-bounce-slow { animation: bounce-slow 1.4s ease-in-out infinite; }
```

- [ ] **Step 10: Write the connection-quality and speaking helpers**

The spec calls for a connection-quality dot on the active call header and a speaking ring on each participant tile. Both are decisions over numbers, so the decisions go in a pure module and only the polling lives in a hook.

Create `frontend/src/lib/callQuality.js`:

```js
// Turns raw WebRTC stats and audio levels into the two things the UI shows:
// a quality dot and a "this person is talking" flag.

export const QUALITY_LEVELS = ['good', 'fair', 'poor', 'unknown'];

/**
 * Packet loss ratio -> quality band. Thresholds follow the usual VoIP rule
 * of thumb: under 2% is imperceptible, 2-5% is audible but usable, above
 * that the call is visibly degrading.
 */
export const qualityFromLoss = (lossRatio) => {
  if (typeof lossRatio !== 'number' || Number.isNaN(lossRatio)) return 'unknown';
  if (lossRatio < 0.02) return 'good';
  if (lossRatio < 0.05) return 'fair';
  return 'poor';
};

/** Extract the inbound packet-loss ratio from an RTCStatsReport-like iterable. */
export const lossRatioFromStats = (reports) => {
  let received = 0;
  let lost = 0;
  for (const report of reports || []) {
    if (report.type !== 'inbound-rtp') continue;
    received += report.packetsReceived || 0;
    lost += report.packetsLost || 0;
  }
  const total = received + lost;
  return total > 0 ? lost / total : null;
};

/** The worst band across all peers is what the header should show. */
export const worstQuality = (qualities) => {
  const order = ['poor', 'fair', 'good'];
  for (const level of order) if (qualities.includes(level)) return level;
  return 'unknown';
};

// Above this normalized level (0-1) someone is treated as talking. Low
// enough to catch quiet speech, high enough that room noise does not light
// up every tile at once.
export const SPEAKING_THRESHOLD = 0.06;

export const isSpeaking = (level) => typeof level === 'number' && level > SPEAKING_THRESHOLD;
```

Create `frontend/src/lib/callQuality.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { qualityFromLoss, lossRatioFromStats, worstQuality, isSpeaking, SPEAKING_THRESHOLD } from './callQuality.js';

describe('qualityFromLoss', () => {
  it('calls under 2% loss good', () => expect(qualityFromLoss(0.01)).toBe('good'));
  it('calls 2-5% loss fair', () => expect(qualityFromLoss(0.03)).toBe('fair'));
  it('calls over 5% loss poor', () => expect(qualityFromLoss(0.2)).toBe('poor'));
  it('treats the 2% boundary as fair, not good', () => expect(qualityFromLoss(0.02)).toBe('fair'));
  it('returns unknown for a null reading', () => expect(qualityFromLoss(null)).toBe('unknown'));
  it('returns unknown for NaN', () => expect(qualityFromLoss(NaN)).toBe('unknown'));
});

describe('lossRatioFromStats', () => {
  it('computes the ratio across every inbound stream', () => {
    const reports = [
      { type: 'inbound-rtp', packetsReceived: 90, packetsLost: 10 },
      { type: 'outbound-rtp', packetsSent: 100 },
    ];
    expect(lossRatioFromStats(reports)).toBeCloseTo(0.1);
  });

  it('sums multiple inbound streams', () => {
    const reports = [
      { type: 'inbound-rtp', packetsReceived: 50, packetsLost: 0 },
      { type: 'inbound-rtp', packetsReceived: 50, packetsLost: 100 },
    ];
    expect(lossRatioFromStats(reports)).toBeCloseTo(0.5);
  });

  it('returns null before any packets have arrived, rather than 0', () => {
    expect(lossRatioFromStats([{ type: 'inbound-rtp', packetsReceived: 0, packetsLost: 0 }])).toBeNull();
  });

  it('returns null for an empty or missing report', () => {
    expect(lossRatioFromStats([])).toBeNull();
    expect(lossRatioFromStats(null)).toBeNull();
  });

  it('tolerates reports with missing counters', () => {
    expect(lossRatioFromStats([{ type: 'inbound-rtp' }])).toBeNull();
  });
});

describe('worstQuality', () => {
  it('surfaces the worst band present', () => {
    expect(worstQuality(['good', 'poor', 'fair'])).toBe('poor');
    expect(worstQuality(['good', 'fair'])).toBe('fair');
    expect(worstQuality(['good', 'good'])).toBe('good');
  });

  it('returns unknown when there is nothing to judge', () => {
    expect(worstQuality([])).toBe('unknown');
    expect(worstQuality(['unknown'])).toBe('unknown');
  });
});

describe('isSpeaking', () => {
  it('is true above the threshold', () => expect(isSpeaking(SPEAKING_THRESHOLD + 0.01)).toBe(true));
  it('is false at or below the threshold', () => {
    expect(isSpeaking(SPEAKING_THRESHOLD)).toBe(false);
    expect(isSpeaking(0)).toBe(false);
  });
  it('is false for a missing level', () => expect(isSpeaking(undefined)).toBe(false));
});
```

Run from `frontend/`: `npx vitest run src/lib/callQuality.test.js`
Expected: PASS, 16 tests.

- [ ] **Step 11: Add the polling hook**

Create `frontend/src/hooks/useCallInsights.js`:

```js
import { useEffect, useState } from 'react';
import { qualityFromLoss, lossRatioFromStats, worstQuality, isSpeaking } from '../lib/callQuality';

/**
 * Polls peer-connection stats for a quality band, and audio levels for who
 * is speaking. Kept out of CallContext so a re-render every second does not
 * churn the whole call tree -- only the header and tiles consume this.
 *
 * @param peerConnections Map<userId, RTCPeerConnection>
 * @param remoteStreams   Map<userId, MediaStream>
 * @returns { quality: 'good'|'fair'|'poor'|'unknown', speakingIds: Set<string> }
 */
export const useCallInsights = (peerConnections, remoteStreams, enabled) => {
  const [quality, setQuality] = useState('unknown');
  const [speakingIds, setSpeakingIds] = useState(() => new Set());

  useEffect(() => {
    if (!enabled || !peerConnections?.size) { setQuality('unknown'); return; }

    let cancelled = false;
    const id = setInterval(async () => {
      const bands = [];
      for (const pc of peerConnections.values()) {
        try {
          const report = await pc.getStats();
          bands.push(qualityFromLoss(lossRatioFromStats(report.values ? [...report.values()] : [])));
        } catch { bands.push('unknown'); }
      }
      if (!cancelled) setQuality(worstQuality(bands));
    }, 3000);

    return () => { cancelled = true; clearInterval(id); };
  }, [peerConnections, enabled]);

  useEffect(() => {
    if (!enabled || !remoteStreams?.size) { setSpeakingIds(new Set()); return; }

    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }

    const analysers = new Map();
    for (const [userId, stream] of remoteStreams.entries()) {
      if (!stream?.getAudioTracks?.().length) continue;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analysers.set(userId, { analyser, buffer: new Uint8Array(analyser.frequencyBinCount) });
    }

    const id = setInterval(() => {
      const talking = new Set();
      for (const [userId, { analyser, buffer }] of analysers.entries()) {
        analyser.getByteTimeDomainData(buffer);
        // Byte time-domain data is centred on 128; deviation from that is
        // the signal amplitude.
        let peak = 0;
        for (const sample of buffer) peak = Math.max(peak, Math.abs(sample - 128) / 128);
        if (isSpeaking(peak)) talking.add(userId);
      }
      setSpeakingIds(talking);
    }, 250);

    return () => { clearInterval(id); try { ctx.close(); } catch { /* already closed */ } };
  }, [remoteStreams, enabled]);

  return { quality, speakingIds };
};
```

- [ ] **Step 12: Expose the peer map and wire the indicators**

In `frontend/src/context/CallContext.jsx`, add `peerConnections: peers.current` to the context value so the hook can read it, and export it from `useCall()`.

In `ActiveCallScreen`, call the hook and render the dot. Add the import:

```jsx
import { useCall } from '../../context/CallContext';
import { useCallInsights } from '../../hooks/useCallInsights';
```

and inside the component:

```jsx
  const { peerConnections } = useCall();
  const { quality, speakingIds } = useCallInsights(
    peerConnections, remoteStreams, call.status === 'active'
  );

  const QUALITY_DOT = {
    good: 'bg-green-400', fair: 'bg-amber-400', poor: 'bg-red-500', unknown: 'bg-white/30',
  };
```

Render the dot next to the status line:

```jsx
          <p className="text-white/60 text-xs tabular-nums flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${QUALITY_DOT[quality]}`}
                  title={`Connection: ${quality}`} />
            {statusLine}
          </p>
```

(Replace the plain `<p className="text-white/60 text-xs tabular-nums">{statusLine}</p>` written in Step 5.)

And pass the speaking flag into each tile — `ParticipantTile` already reads `peer.speaking`, so supply it:

```jsx
              <ParticipantTile key={p.userId} peer={{ ...p, speaking: speakingIds.has(p.userId) }}
                stream={remoteStreams.get(p.userId)} compact />
```

Do the same for the 1-on-1 branch:

```jsx
            <ParticipantTile peer={{ ...primary, speaking: speakingIds.has(primary?.userId) }}
              stream={remoteStreams.get(primary?.userId)} />
```

- [ ] **Step 13: Verify the build**

Run from `frontend/`: `npx vitest run src/lib/callQuality.test.js && npm run build`
Expected: both succeed.

- [ ] **Step 14: Commit**

```bash
git add frontend/src/components/call frontend/src/hooks frontend/src/lib/callQuality.js frontend/src/lib/callQuality.test.js frontend/src/context/CallContext.jsx frontend/src/App.jsx frontend/src/styles
git commit -m "feat: add call screens with connection-quality and speaking indicators"
```

---

### Task 8: Wire the chat header buttons

**Files:**
- Modify: `frontend/src/pages/main/MessagesPage.jsx:543-553`

**Interfaces:**
- Consumes: `useCall()` (Task 6).
- Produces: nothing new.

- [ ] **Step 1: Import the hook**

In `frontend/src/pages/main/MessagesPage.jsx`, add after the other context imports (line 6):

```jsx
import { useCall } from '../../context/CallContext';
```

and inside the component, next to the other hooks (after line 31):

```jsx
  const { startCall, call } = useCall();
```

- [ ] **Step 2: Replace the dead buttons**

Replace lines 543–553 (the `<div className="flex items-center gap-1 flex-shrink-0">` block containing the three icon buttons) with:

```jsx
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(() => {
                    const participantCount = activeConv.participants?.length || 0;
                    // Calls are mesh peer-to-peer, so the cap is a real
                    // technical limit, not a product choice -- surface it
                    // rather than letting the call fail halfway through.
                    const tooManyPeople = participantCount > 8;
                    const busy = call.status !== 'idle' && call.status !== 'ended';
                    const disabled = tooManyPeople || busy || !window.isSecureContext;
                    const reason = tooManyPeople
                      ? 'Calls support up to 8 people'
                      : busy ? 'You are already on a call'
                      : !window.isSecureContext ? 'Calls need a secure (https) connection'
                      : '';

                    return (
                      <>
                        <button
                          onClick={() => startCall(activeConv, 'audio')}
                          disabled={disabled}
                          title={reason || 'Audio call'}
                          aria-label="Start audio call"
                          className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                          <FiPhone className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => startCall(activeConv, 'video')}
                          disabled={disabled}
                          title={reason || 'Video call'}
                          aria-label="Start video call"
                          className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                          <FiVideo className="w-5 h-5" />
                        </button>
                      </>
                    );
                  })()}
                  <button className="p-2 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
                    <FiMoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
```

(The three-dot button stays inert here — it is wired in the separate chat-actions plan.)

- [ ] **Step 3: Verify end to end with two browsers**

Start the app (`npm run dev` from the repo root). Open two different browsers (or one normal + one private window) on `http://localhost:5173`, logged in as two different users who have a conversation.

Verify each of these:
1. A → B audio call: B sees the incoming screen with A's avatar and hears the ringtone. B answers. Both hear each other. The timer runs.
2. Mute on A → B's tile shows the mute badge. Unmute restores it.
3. A presses **Message** → the call minimizes to a pill and the chat opens; audio keeps flowing. Tapping the pill restores the full screen.
4. **End call** on either side → both sides return to the app, and the camera/mic indicator in the browser tab goes out.
5. A → B video call: both see each other's video; the local preview is mirrored.
6. B declines a call → A sees the call end.
7. A calls and B never answers → after 30s both end, A's side says the call was missed.
8. Deny microphone permission when prompted → a clear error toast, and B is never rung.

Note: `localhost` counts as a secure context, so `getUserMedia` works in development without HTTPS. Testing from another device on the LAN will need HTTPS or Chrome's `--unsafely-treat-insecure-origin-as-secure` flag.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/main/MessagesPage.jsx
git commit -m "feat: wire the chat header audio and video call buttons"
```

---

### Task 9: Call logs in the chat thread

**Files:**
- Modify: `backend/models/Message.js` (add `callInfo` to `messageSchema`)
- Modify: `backend/models/Notification.js:9-14` (add `missed_call` to the type enum)
- Modify: `backend/controllers/messageController.js` (add `logCall`)
- Modify: `backend/routes/messageRoutes.js` (add the route)
- Modify: `frontend/src/pages/main/MessagesPage.jsx` (render `type: 'call'` messages)
- Test: `backend/lib/callLog.test.js`
- Create: `backend/lib/callLog.js`

**Interfaces:**
- Consumes: `messageAPI.logCall` (added in Task 6 Step 2).
- Produces: `describeCallLog({ callType, outcome, duration, isMine }) => string`, used by both the server (for the notification text) and the client (for the thread row).

- [ ] **Step 1: Write the failing test**

Create `backend/lib/callLog.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { describeCallLog, CALL_OUTCOMES, formatCallDuration } from './callLog.js';

describe('formatCallDuration', () => {
  it('formats under a minute', () => expect(formatCallDuration(42)).toBe('0:42'));
  it('formats minutes and seconds', () => expect(formatCallDuration(252)).toBe('4:12'));
  it('formats past an hour', () => expect(formatCallDuration(3661)).toBe('1:01:01'));
  it('treats a missing duration as zero', () => expect(formatCallDuration(undefined)).toBe('0:00'));
});

describe('describeCallLog', () => {
  it('describes a completed audio call with its duration', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'completed', duration: 252 }))
      .toBe('Audio call · 4:12');
  });

  it('describes a completed video call', () => {
    expect(describeCallLog({ callType: 'video', outcome: 'completed', duration: 60 }))
      .toBe('Video call · 1:00');
  });

  it('describes an unanswered call from the recipient side as missed', () => {
    expect(describeCallLog({ callType: 'video', outcome: 'missed', isMine: false }))
      .toBe('Missed video call');
  });

  it('describes an unanswered call from the caller side as no answer', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'missed', isMine: true }))
      .toBe('No answer');
  });

  it('describes a declined call', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'declined' })).toBe('Call declined');
  });

  it('describes a failed call', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'failed' })).toBe("Call couldn't connect");
  });

  it('describes a busy call', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'busy' })).toBe('User was on another call');
  });

  it('falls back gracefully on an unknown outcome', () => {
    expect(describeCallLog({ callType: 'audio', outcome: 'weird' })).toBe('Audio call');
  });

  it('exports the exact set of outcomes the schema allows', () => {
    expect(CALL_OUTCOMES).toEqual(['completed', 'missed', 'declined', 'failed', 'busy']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`: `npx vitest run lib/callLog.test.js`
Expected: FAIL — cannot resolve `./callLog.js`.

- [ ] **Step 3: Write the implementation**

Create `backend/lib/callLog.js`:

```js
// Shared by the server (notification text) and mirrored by the client
// (thread row), so a call reads the same wherever it is shown.

export const CALL_OUTCOMES = ['completed', 'missed', 'declined', 'failed', 'busy'];

export const formatCallDuration = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

/**
 * @param isMine true when the viewer placed the call. An unanswered call is
 *   "Missed" to the person who was rung but "No answer" to the caller --
 *   labelling the caller's own outgoing call "missed" reads as an accusation.
 */
export const describeCallLog = ({ callType, outcome, duration, isMine = false }) => {
  const kind = callType === 'video' ? 'Video call' : 'Audio call';
  switch (outcome) {
    case 'completed': return `${kind} · ${formatCallDuration(duration)}`;
    case 'missed': return isMine ? 'No answer' : `Missed ${callType === 'video' ? 'video' : 'audio'} call`;
    case 'declined': return 'Call declined';
    case 'failed': return "Call couldn't connect";
    case 'busy': return 'User was on another call';
    default: return kind;
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`: `npx vitest run lib/callLog.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Add `callInfo` to the Message schema**

In `backend/models/Message.js`, inside `messageSchema`, add after the `isUnsent` field (line 62):

```js
  // Populated only when type === 'call'. `callId` is unique-per-call so a
  // duplicate log from the other participant can be discarded.
  callInfo: {
    callId: { type: String, index: true },
    callType: { type: String, enum: ['audio', 'video'] },
    outcome: { type: String, enum: ['completed', 'missed', 'declined', 'failed', 'busy'] },
    duration: { type: Number, default: 0 },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }
```

- [ ] **Step 6: Allow `missed_call` notifications**

In `backend/models/Notification.js`, add `'missed_call'` to the `type` enum (line 9–14), after `'message'`:

```js
      'mention', 'tag', 'story_view', 'story_reaction', 'post_share',
      'message', 'missed_call', 'comment_like', 'reel_like', 'reel_comment',
```

- [ ] **Step 7: Add the `logCall` controller**

In `backend/controllers/messageController.js`, add this import at the top with the others:

```js
import { CALL_OUTCOMES, describeCallLog } from '../lib/callLog.js';
```

and append this exported function at the end of the file:

```js
// Writes the "Audio call · 4:12" row into the thread once a call ends.
// Both participants may reach the `ended` state and try to log the same
// call, so the write is idempotent on callId -- first one wins.
export const logCall = async (req, res) => {
  try {
    const { callId, callType, outcome, duration } = req.body;

    if (!callId || !['audio', 'video'].includes(callType) || !CALL_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ success: false, message: 'Invalid call log' });
    }

    const conversation = await loadParticipantConversation(req, res);
    if (!conversation) return;

    const existing = await Message.findOne({ 'callInfo.callId': callId });
    if (existing) return res.json({ success: true, message: existing, duplicate: true });

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      type: 'call',
      content: '',
      callInfo: {
        callId,
        callType,
        outcome,
        duration: Math.max(0, Math.min(Number(duration) || 0, 60 * 60 * 12)),
        participants: conversation.participants
      }
    });

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;
    await conversation.save();

    // A missed call is the one outcome the other side may never have seen,
    // so it gets a notification -- unless they muted call notifications for
    // this conversation.
    if (outcome === 'missed' || outcome === 'failed') {
      const callMutedIds = new Set(conversation.callMutedBy.map(m => m.user.toString()));
      const recipients = conversation.participants
        .map(String)
        .filter(id => id !== req.user._id.toString() && !callMutedIds.has(id));

      if (recipients.length) {
        await Notification.insertMany(recipients.map(recipient => ({
          recipient,
          sender: req.user._id,
          type: 'missed_call',
          text: describeCallLog({ callType, outcome: 'missed', isMine: false })
        })));
      }
    }

    const populated = await Message.findById(message._id).populate('sender', 'username fullName avatar');
    res.status(201).json({ success: true, message: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

Check the top of `messageController.js` — if `Notification` is not already imported, add `import Notification from '../models/Notification.js';`.

- [ ] **Step 8: Add the route**

In `backend/routes/messageRoutes.js`, after line 22:

```js
msgRouter.post('/conversations/:conversationId/call-log', protect, msg.logCall);
```

- [ ] **Step 9: Render call rows in the thread**

Create `frontend/src/lib/callLog.js` with the same three functions as `backend/lib/callLog.js` from Step 3. The frontend and backend are separate npm packages with no shared module path, so this is a deliberate duplicate rather than an import — copy the body verbatim and replace only the header comment:

```js
// Kept in sync with backend/lib/callLog.js. The frontend and backend are
// separate npm packages with no shared module path, so this is a deliberate
// duplicate rather than an import. If you change one, change both.

export const CALL_OUTCOMES = ['completed', 'missed', 'declined', 'failed', 'busy'];

export const formatCallDuration = (seconds) => {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

export const describeCallLog = ({ callType, outcome, duration, isMine = false }) => {
  const kind = callType === 'video' ? 'Video call' : 'Audio call';
  switch (outcome) {
    case 'completed': return `${kind} · ${formatCallDuration(duration)}`;
    case 'missed': return isMine ? 'No answer' : `Missed ${callType === 'video' ? 'video' : 'audio'} call`;
    case 'declined': return 'Call declined';
    case 'failed': return "Call couldn't connect";
    case 'busy': return 'User was on another call';
    default: return kind;
  }
};
```

Then add the import to `frontend/src/pages/main/MessagesPage.jsx`:

```jsx
import { describeCallLog } from '../../lib/callLog';
```

and in the message rendering block, before the `msg.isUnsent` check (around line 600), add a branch that short-circuits call messages into a centered system row:

```jsx
                if (msg.type === 'call') {
                  return (
                    <div key={msg._id} className="flex justify-center py-2">
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-3 py-1.5 rounded-full">
                        {msg.callInfo?.callType === 'video'
                          ? <FiVideo className="w-3.5 h-3.5" />
                          : <FiPhone className="w-3.5 h-3.5" />}
                        <span>{describeCallLog({ ...msg.callInfo, isMine })}</span>
                      </div>
                    </div>
                  );
                }
```

Place it immediately after `const isRead = ...` and before the `return (` of the normal bubble, so it replaces the bubble entirely for call rows.

- [ ] **Step 10: Verify**

Run from `backend/`: `npx vitest run lib/callLog.test.js` → PASS.
Run from `frontend/`: `npm run build` → succeeds.

Then with two browsers: place a call, end it, and confirm the thread shows "Audio call · 0:07" on both sides after a refresh. Place a call and let it ring out; confirm the caller sees "No answer", the callee sees "Missed audio call", and the callee has a notification. Mute call notifications for that chat and repeat — no notification this time.

- [ ] **Step 11: Commit**

```bash
git add backend/lib/callLog.js backend/lib/callLog.test.js backend/models/Message.js backend/models/Notification.js backend/controllers/messageController.js backend/routes/messageRoutes.js frontend/src/lib/callLog.js frontend/src/pages/main/MessagesPage.jsx
git commit -m "feat: log calls into the chat thread and notify on missed calls"
```

---

### Task 10: Full-suite verification

- [ ] **Step 1: Run every frontend test**

Run from `frontend/`: `npx vitest run`
Expected: all suites pass, including the pre-existing `deviceDetect`, `e2eCrypto`, `longPress` and `permissionLabel` tests.

- [ ] **Step 2: Run every backend test**

Run from `backend/`: `npx vitest run`
Expected: `callRegistry`, `socket.calls` and `callLog` suites pass.

- [ ] **Step 3: Production build**

Run from `frontend/`: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Responsive pass**

With a call active, use browser devtools device emulation to check: iPhone SE (375×667), iPhone 14 Pro (393×852), iPad (768×1024), and desktop (1440×900), each in portrait and landscape where applicable. Confirm on every one: no horizontal scrolling, controls fully visible and tappable, the header name truncates rather than overflowing, and the group grid reflows. Then repeat in both light and dark theme.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: responsive adjustments for call screens"
```
