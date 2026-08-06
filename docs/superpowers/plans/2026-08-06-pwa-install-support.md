# PWA Install Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NexVibe installable as a PWA on Android, iOS, Windows, and macOS, with a public `/download` page offering per-platform install flows and a Settings section for managing Camera/Microphone/Notifications/Storage permission status.

**Architecture:** `vite-plugin-pwa` (with its integrated `pwaAssets` asset generator) adds the manifest, service worker, and icon set to the existing Vite build with no manual icon files. The service worker precaches only the static app shell — `/api/*` and `/socket.io/*` are explicitly excluded from any service-worker interception, so auth, live messages, and notifications keep working exactly as they do today. A new public `Download.jsx` page (same header/footer shell as `Security.jsx`) detects the visitor's platform and shows either a native install button (`beforeinstallprompt`, Chromium browsers) or manual steps (iOS Safari, Firefox). A new "App" section in the existing Settings page surfaces permission status via the Permissions/`getUserMedia`/Notification/Storage APIs.

**Tech Stack:** React 18, Vite 5, `vite-plugin-pwa`, `@vite-pwa/assets-generator`, Tailwind CSS, Vitest (`environment: 'node'`).

## Global Constraints

- PWA install only — no native app build (React Native/Capacitor), no app-store submission. (Spec: Non-goals)
- The service worker must never intercept `/api/*` or `/socket.io/*` requests — this is what keeps auth cookies and real-time features correct after install. (Spec: Goals, Package & build changes)
- No new camera/mic-capturing features. Existing uploads stay as plain `<input type="file">`; this change only adds visibility into permission *state*. (Spec: Non-goals)
- Reuse `frontend/public/social-favicon.svg` as the only icon source — no new artwork. (Spec: Package & build changes)
- New public pages follow the existing header/footer/theme-toggle shell already used by `Security.jsx`, `Community.jsx`, etc. — reuse `FiSun`/`FiMoon` from `react-icons/fi` via `useTheme()`, never raw emoji. (Established project convention)
- The new Settings section follows the existing `SECTIONS` + local-component-per-section pattern already in `SettingsPage.jsx` (see `NotificationsSection`, `ToggleRow`, `Section`).

---

## Task 1: PWA build infrastructure (manifest, service worker, icons)

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`

**Interfaces:**
- Produces: a registered service worker + `manifest.webmanifest` on every build, auto-injected into `index.html` — no other task needs to reference this directly, later tasks only rely on `beforeinstallprompt` firing in the browser (Task 3).

- [ ] **Step 1: Install the PWA plugin and asset generator**

Run inside `frontend/`:
```bash
npm install -D vite-plugin-pwa @vite-pwa/assets-generator
```

- [ ] **Step 2: Add the plugin to `vite.config.js`**

Replace the full file contents with:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      pwaAssets: {
        preset: 'minimal-2023',
        image: 'public/social-favicon.svg',
      },
      manifest: {
        name: 'NexVibe',
        short_name: 'NexVibe',
        description: 'NexVibe - Connect, share, and discover',
        theme_color: '#E1306C',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
```

`pwaAssets` generates the full icon set (192/512/maskable/apple-touch) from
`social-favicon.svg` at build time and auto-injects the icon links and
manifest `icons` array — no manual `index.html` edit and no icon filenames
to hand-copy anywhere.

- [ ] **Step 3: Build and verify the manifest/service worker/icons are emitted**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds, and the console output includes a
`PWA v...` summary line listing the generated manifest and service worker.

Then verify the output files exist:
```bash
ls dist/manifest.webmanifest dist/sw.js
ls dist/*.png
```
Expected: `manifest.webmanifest` and `sw.js` exist; at least one generated
`.png` icon exists in `dist/`. Open `dist/manifest.webmanifest` and confirm
it contains `"name": "NexVibe"`, `"display": "standalone"`, and a non-empty
`"icons"` array.

- [ ] **Step 4: Verify dev mode also serves the manifest**

Run inside `frontend/`:
```bash
npm run dev
```
In another terminal:
```bash
curl -s http://localhost:5173/manifest.webmanifest | grep -o '"name":"NexVibe"'
```
Expected: prints `"name":"NexVibe"` (confirms `devOptions.enabled: true` is
working, so the manifest is reachable without a production build). Stop the
dev server after confirming.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js
git commit -m "feat: add PWA manifest, service worker, and generated icon set"
```

---

## Task 2: Device-detection and permission-label utilities (pure functions, unit tested)

**Files:**
- Create: `frontend/src/lib/deviceDetect.js`
- Create: `frontend/src/lib/deviceDetect.test.js`
- Create: `frontend/src/lib/permissionLabel.js`
- Create: `frontend/src/lib/permissionLabel.test.js`

**Interfaces:**
- Produces: `detectPlatform(userAgent: string): 'android' | 'ios' | 'windows' | 'macos' | 'other'` — consumed by Task 3 (`Download.jsx`).
- Produces: `permissionLabel(state: string): { text: string, className: string }` — consumed by Task 4 (`SettingsPage.jsx`).

- [ ] **Step 1: Write the failing test for `detectPlatform`**

```js
// frontend/src/lib/deviceDetect.test.js
import { describe, it, expect } from 'vitest';
import { detectPlatform } from './deviceDetect.js';

describe('detectPlatform', () => {
  it('detects Android', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
    expect(detectPlatform(ua)).toBe('android');
  });

  it('detects iOS from an iPhone UA', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('detects iOS from an iPad UA', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('ios');
  });

  it('detects Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0';
    expect(detectPlatform(ua)).toBe('windows');
  });

  it('detects macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
    expect(detectPlatform(ua)).toBe('macos');
  });

  it('falls back to other for an unrecognized UA', () => {
    expect(detectPlatform('SomeWeirdBot/1.0')).toBe('other');
  });

  it('falls back to other when called with no argument', () => {
    expect(detectPlatform()).toBe('other');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run inside `frontend/`:
```bash
npx vitest run src/lib/deviceDetect.test.js
```
Expected: FAIL — `Failed to resolve import "./deviceDetect.js"` (file doesn't exist yet).

- [ ] **Step 3: Implement `detectPlatform`**

```js
// frontend/src/lib/deviceDetect.js
export const detectPlatform = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/windows/.test(ua)) return 'windows';
  if (/macintosh|mac os x/.test(ua)) return 'macos';
  return 'other';
};
```

- [ ] **Step 4: Run it to verify it passes**

Run inside `frontend/`:
```bash
npx vitest run src/lib/deviceDetect.test.js
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing test for `permissionLabel`**

```js
// frontend/src/lib/permissionLabel.test.js
import { describe, it, expect } from 'vitest';
import { permissionLabel } from './permissionLabel.js';

describe('permissionLabel', () => {
  it('maps granted to Allowed', () => {
    expect(permissionLabel('granted').text).toBe('Allowed');
  });

  it('maps denied to Blocked', () => {
    expect(permissionLabel('denied').text).toBe('Blocked');
  });

  it('maps prompt to Not asked', () => {
    expect(permissionLabel('prompt').text).toBe('Not asked');
  });

  it('falls back to Not supported for an unknown state', () => {
    expect(permissionLabel('bogus').text).toBe('Not supported');
  });

  it('falls back to Not supported when called with no argument', () => {
    expect(permissionLabel().text).toBe('Not supported');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run inside `frontend/`:
```bash
npx vitest run src/lib/permissionLabel.test.js
```
Expected: FAIL — `Failed to resolve import "./permissionLabel.js"`.

- [ ] **Step 7: Implement `permissionLabel`**

```js
// frontend/src/lib/permissionLabel.js
const PERMISSION_LABELS = {
  granted: { text: 'Allowed', className: 'bg-green-50 dark:bg-green-950/20 text-green-600' },
  denied: { text: 'Blocked', className: 'bg-red-50 dark:bg-red-950/20 text-red-600' },
  prompt: { text: 'Not asked', className: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]' },
  unsupported: { text: 'Not supported', className: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]' },
};

export const permissionLabel = (state) => PERMISSION_LABELS[state] || PERMISSION_LABELS.unsupported;
```

- [ ] **Step 8: Run it to verify it passes**

Run inside `frontend/`:
```bash
npx vitest run src/lib/permissionLabel.test.js
```
Expected: PASS, 5 tests.

- [ ] **Step 9: Run the full frontend test suite to confirm no regressions**

Run inside `frontend/`:
```bash
npm test
```
Expected: all tests pass, including the pre-existing `e2eCrypto.test.js`.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/deviceDetect.js frontend/src/lib/deviceDetect.test.js frontend/src/lib/permissionLabel.js frontend/src/lib/permissionLabel.test.js
git commit -m "feat: add device-platform detection and permission-label utilities"
```

---

## Task 3: `/download` page with per-platform install flow

**Files:**
- Create: `frontend/src/lib/installPrompt.js`
- Create: `frontend/src/pages/Download.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/LandingPage.jsx`

**Interfaces:**
- Consumes: `detectPlatform` from `frontend/src/lib/deviceDetect.js` (Task 2).
- Produces: route `/download` (public, no auth guard) — no other task depends on this route directly.

- [ ] **Step 1: Create the install-prompt capture module**

This module runs once at app startup (it's imported by `Download.jsx`,
which `App.jsx` imports eagerly) and captures the browser's
`beforeinstallprompt` event so it can be replayed later from a button
click — the event is only usable if `preventDefault()` was called on it
synchronously when it fired, so it cannot be captured lazily inside a
component that might mount after the event already happened.

```js
// frontend/src/lib/installPrompt.js
let deferredPrompt = null;
const listeners = new Set();

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  listeners.forEach((callback) => callback(event));
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
});

export const getDeferredPrompt = () => deferredPrompt;

export const onInstallPromptAvailable = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

export const clearDeferredPrompt = () => {
  deferredPrompt = null;
};
```

- [ ] **Step 2: Create the Download page**

```jsx
// frontend/src/pages/Download.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';
import { detectPlatform } from '../lib/deviceDetect';
import { getDeferredPrompt, onInstallPromptAvailable, clearDeferredPrompt } from '../lib/installPrompt';
import { FiSun, FiMoon, FiDownload, FiCheckCircle } from 'react-icons/fi';
import { FaAndroid, FaApple, FaWindows } from 'react-icons/fa6';
import { BsInstagram } from 'react-icons/bs';

const PLATFORM_INFO = {
  android: { label: 'Android', icon: <FaAndroid className="w-6 h-6" /> },
  ios: { label: 'iPhone & iPad', icon: <FaApple className="w-6 h-6" /> },
  windows: { label: 'Windows', icon: <FaWindows className="w-6 h-6" /> },
  macos: { label: 'Mac', icon: <FaApple className="w-6 h-6" /> },
  other: { label: 'Your device', icon: <FiDownload className="w-6 h-6" /> },
};

const MANUAL_STEPS = {
  android: ['Open the browser menu (⋮).', 'Tap "Install app" or "Add to Home screen".', 'Confirm to add NexVibe to your home screen.'],
  ios: ["Tap the Share icon in Safari's toolbar.", 'Scroll down and tap "Add to Home Screen".', 'Tap "Add" in the top-right corner.'],
  windows: ['Click the install icon in the address bar, or open the browser menu.', 'Choose "Install NexVibe".', 'Confirm to install.'],
  macos: ['Click the install icon in the address bar, or open the browser menu.', 'Choose "Install NexVibe".', 'Confirm to install.'],
  other: ['Open this page in Chrome, Edge, or Safari for install options.'],
};

const isStandaloneDisplay = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function Download() {
  const { isDark, toggleTheme } = useTheme();
  const [platform] = useState(() => detectPlatform(navigator.userAgent));
  const [canPrompt, setCanPrompt] = useState(() => !!getDeferredPrompt());
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());

  useEffect(() => {
    const unsubscribe = onInstallPromptAvailable(() => setCanPrompt(true));
    return unsubscribe;
  }, []);

  const handleInstall = async () => {
    const prompt = getDeferredPrompt();
    if (!prompt) return;
    prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') {
      toast.success('NexVibe installed!');
      setInstalled(true);
    } else {
      toast('Install dismissed');
    }
    clearDeferredPrompt();
    setCanPrompt(false);
  };

  const otherPlatforms = Object.keys(PLATFORM_INFO).filter((p) => p !== platform && p !== 'other');

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 ig-gradient rounded-xl flex items-center justify-center">
              <BsInstagram className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-black text-gradient">NexVibe</span>
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)]">
              {isDark ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
            </button>
            <Link to="/" className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <FiDownload className="w-12 h-12 text-pink-500 mx-auto mb-4" />
          <h1 className="text-4xl sm:text-5xl font-black mb-4">Install NexVibe</h1>
          <p className="text-lg text-[var(--text-secondary)] max-w-xl mx-auto">
            Get the app-like experience — install NexVibe on your device, no app store needed.
          </p>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-8 text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-orange-400 text-white flex items-center justify-center mx-auto mb-4">
            {PLATFORM_INFO[platform].icon}
          </div>
          <h2 className="text-xl font-bold mb-1">{PLATFORM_INFO[platform].label}</h2>

          {installed ? (
            <p className="flex items-center justify-center gap-2 text-green-600 font-semibold mt-4">
              <FiCheckCircle className="w-5 h-5" /> Already installed on this device
            </p>
          ) : canPrompt ? (
            <button onClick={handleInstall} className="btn-brand inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold mt-4">
              <FiDownload className="w-4 h-4" /> Install App
            </button>
          ) : (
            <ol className="text-left max-w-sm mx-auto space-y-2 mt-4 text-sm text-[var(--text-secondary)] list-decimal list-inside">
              {MANUAL_STEPS[platform].map((step) => <li key={step}>{step}</li>)}
            </ol>
          )}
        </div>

        <details className="border border-[var(--border)] rounded-2xl p-5">
          <summary className="cursor-pointer font-semibold text-sm">Other devices</summary>
          <div className="mt-4 space-y-5">
            {otherPlatforms.map((p) => (
              <div key={p}>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">{PLATFORM_INFO[p].icon} {PLATFORM_INFO[p].label}</h3>
                <ol className="text-sm text-[var(--text-secondary)] list-decimal list-inside space-y-1">
                  {MANUAL_STEPS[p].map((step) => <li key={step}>{step}</li>)}
                </ol>
              </div>
            ))}
          </div>
        </details>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-[var(--text-muted)]">© {new Date().getFullYear()} NexVibe. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Register the `/download` route**

In `frontend/src/App.jsx`, add the import next to the other public pages:
```js
import Security from './pages/Security';
import Download from './pages/Download';
```

Then add the route next to `/security`:
```jsx
      <Route path="/security" element={<Security />} />
      <Route path="/download" element={<Download />} />
```

- [ ] **Step 4: Add the nav link on the landing page**

In `frontend/src/pages/LandingPage.jsx`, update `NAV_LINKS`:
```js
const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Reels', href: '#reels' },
  { label: 'Community', path: '/community' },
  { label: 'Security', path: '/security' },
  { label: 'Download', path: '/download' },
];
```

- [ ] **Step 5: Verify the route serves correctly**

Run inside `frontend/`:
```bash
npm run dev
```
In another terminal:
```bash
curl -s http://localhost:5173/download | grep -o '<div id="root">'
```
Expected: prints `<div id="root">` (confirms the SPA route resolves and
serves `index.html` rather than a 404 — React Router handles the rest
client-side).

- [ ] **Step 6: Manually verify per-platform rendering in a real browser**

Using the project's `run` skill (browser-driven pattern), open
`http://localhost:5173/download`:
- On the current desktop browser: confirm the primary card shows
  "Windows" or "Mac" (matching the host OS) with an "Install App" button
  if the browser supports it, or numbered manual steps otherwise.
- Open browser DevTools, switch to responsive/device-emulation mode with
  an iPhone preset (this changes the reported `navigator.userAgent`),
  reload the page, and confirm the primary card now shows "iPhone & iPad"
  with the Share-icon manual steps (never an Install button — iOS Safari
  never fires `beforeinstallprompt`).
- Expand "Other devices" and confirm it lists the three platforms not
  currently shown as primary, each with its own steps.
- If the browser does show a native install banner/button, click it,
  complete the install, then reload `/download` and confirm the card now
  reads "Already installed on this device" with no button.
- With the service worker now active (from Task 1), log into the app,
  open the feed, and send a message on `/messages`. Confirm the feed
  loads, the message sends and arrives in real time, and DevTools' Network
  tab shows `/api/*` and `/socket.io/*` requests going straight to the
  network (not served `(from ServiceWorker)`) — this proves the
  `navigateFallbackDenylist` from Task 1 is keeping dynamic requests out of
  the cache and nothing about login/real-time behavior changed.

Stop the dev server after confirming.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/installPrompt.js frontend/src/pages/Download.jsx frontend/src/App.jsx frontend/src/pages/LandingPage.jsx
git commit -m "feat: add public /download page with per-platform install flow"
```

---

## Task 4: Settings "App" permissions section

**Files:**
- Modify: `frontend/src/pages/main/SettingsPage.jsx`

**Interfaces:**
- Consumes: `permissionLabel` from `frontend/src/lib/permissionLabel.js` (Task 2).

- [ ] **Step 1: Add the "App" entry to `SECTIONS`**

In `frontend/src/pages/main/SettingsPage.jsx`, the current array is:
```js
const SECTIONS = [
  { key: 'profile', label: 'Edit profile' },
  { key: 'account', label: 'Account' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'security', label: 'Security' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'blocked', label: 'Blocked accounts' },
  { key: 'help', label: 'Help' },
];
```
Change it to insert `app` right after `notifications`:
```js
const SECTIONS = [
  { key: 'profile', label: 'Edit profile' },
  { key: 'account', label: 'Account' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'security', label: 'Security' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'app', label: 'App' },
  { key: 'blocked', label: 'Blocked accounts' },
  { key: 'help', label: 'Help' },
];
```

- [ ] **Step 2: Add the imports the new section needs**

Change:
```js
import { useState, useRef } from 'react';
```
to:
```js
import { useState, useRef, useEffect } from 'react';
```

Change:
```js
import { FiArrowLeft, FiCamera, FiCheck } from 'react-icons/fi';
```
to:
```js
import { FiArrowLeft, FiCamera, FiCheck, FiMic, FiBell, FiHardDrive } from 'react-icons/fi';
```

Add, next to the other relative imports at the top of the file:
```js
import { permissionLabel } from '../../lib/permissionLabel';
```

- [ ] **Step 3: Render the new section**

Change:
```jsx
          {activeSection === 'notifications' && <NotificationsSection user={user} updateUser={updateUser} />}
          {activeSection === 'blocked' && <BlockedSection />}
```
to:
```jsx
          {activeSection === 'notifications' && <NotificationsSection user={user} updateUser={updateUser} />}
          {activeSection === 'app' && <AppPermissionsSection />}
          {activeSection === 'blocked' && <BlockedSection />}
```

- [ ] **Step 4: Add the `PermissionRow` and `AppPermissionsSection` components**

Add this directly after the existing `NotificationsSection` function
(before `function BlockedSection()`):

```jsx
function PermissionRow({ icon, label, state, onTest }) {
  const { text, className } = permissionLabel(state);
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0 gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-secondary)]">{icon}</div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block mt-0.5 ${className}`}>{text}</span>
        </div>
      </div>
      {state === 'denied' ? (
        <p className="text-xs text-[var(--text-muted)] max-w-[160px] text-right">Blocked in browser settings</p>
      ) : (
        <button onClick={onTest} className="text-sm font-semibold text-blue-500 hover:text-blue-600 flex-shrink-0">Test</button>
      )}
    </div>
  );
}

function AppPermissionsSection() {
  const [camera, setCamera] = useState('unsupported');
  const [mic, setMic] = useState('unsupported');
  const [notifications, setNotifications] = useState(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  });
  const [storage, setStorage] = useState('unsupported');

  useEffect(() => {
    const readState = async (name, setter) => {
      try {
        if (!navigator.permissions?.query) return;
        const status = await navigator.permissions.query({ name });
        setter(status.state);
      } catch {
        // Safari doesn't support querying camera/microphone this way;
        // state stays 'unsupported' until the user clicks Test.
      }
    };
    readState('camera', setCamera);
    readState('microphone', setMic);
    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then((persisted) => setStorage(persisted ? 'granted' : 'prompt'));
    }
  }, []);

  const testMedia = async (kind, setter) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ [kind]: true });
      stream.getTracks().forEach((track) => track.stop());
      setter('granted');
    } catch {
      setter('denied');
    }
  };

  const testNotifications = async () => {
    if (typeof Notification === 'undefined') return setNotifications('unsupported');
    const result = await Notification.requestPermission();
    setNotifications(result === 'default' ? 'prompt' : result);
  };

  const testStorage = async () => {
    if (!navigator.storage?.persist) return setStorage('unsupported');
    const persisted = await navigator.storage.persist();
    setStorage(persisted ? 'granted' : 'denied');
  };

  return (
    <div className="max-w-[500px]">
      <h2 className="text-xl font-bold hidden md:block mb-2">App & Permissions</h2>
      <p className="text-sm text-[var(--text-muted)] mb-5">Manage what NexVibe can access on this device.</p>
      <div className="border border-[var(--border)] rounded-2xl px-4">
        <PermissionRow icon={<FiCamera className="w-4 h-4" />} label="Camera" state={camera} onTest={() => testMedia('video', setCamera)} />
        <PermissionRow icon={<FiMic className="w-4 h-4" />} label="Microphone" state={mic} onTest={() => testMedia('audio', setMic)} />
        <PermissionRow icon={<FiBell className="w-4 h-4" />} label="Notifications" state={notifications} onTest={testNotifications} />
        <PermissionRow icon={<FiHardDrive className="w-4 h-4" />} label="Storage" state={storage} onTest={testStorage} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Manually verify in a real browser**

Using the project's `run` skill, log in, go to `/settings/app`, and confirm:
- All four rows render with an initial status pill (most likely "Not
  asked" or "Not supported" on a fresh profile with no prior grants).
- Clicking "Test" on Camera/Microphone triggers the browser's native
  camera/microphone permission dialog; after allowing, the pill updates to
  "Allowed" and no error is thrown (check DevTools console is clean).
- Clicking "Test" on Notifications triggers the native notification
  permission dialog; after allowing, the pill updates to "Allowed".
- Clicking "Test" on Storage updates the pill without any dialog
  (storage persistence is auto-granted or silently denied per browser
  heuristics, not a user-facing prompt).
- After denying any of Camera/Microphone/Notifications once, reload the
  page and confirm that row now shows "Blocked" with the explanatory text
  instead of a non-functional "Test" button.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/main/SettingsPage.jsx
git commit -m "feat: add App permissions section to Settings"
```
