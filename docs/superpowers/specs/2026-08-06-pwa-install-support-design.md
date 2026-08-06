# PWA Install Support — Design

## Problem

NexVibe is a plain SPA — no `manifest.json`, no service worker, no app icons
beyond a favicon. It cannot be "installed" on any device (no Add to
Home Screen / desktop install prompt anywhere), and there's no page telling
users that installing is even possible or how to do it per platform.

## Goals

- The app becomes installable as a PWA on Android, iOS, Windows, and macOS,
  using the existing codebase (no separate native build).
- A public `/download` page, linked from the landing page nav (after
  "Security"), lets **both logged-out and logged-in visitors** install the
  app — with device-appropriate instructions/buttons, since Android/Desktop
  Chromium browsers support a native install prompt but iOS Safari and
  Firefox do not.
- Logged-in users get a new "App" section in Settings that shows the current
  status of Camera / Microphone / Notifications / Storage permissions and
  lets them (re-)trigger the browser's permission prompt, so the install
  doesn't lead to confusing silent failures when those features are used.
- Installed/standalone mode must not break anything that already works:
  auth cookies, Socket.io real-time messages/notifications, or file uploads.

## Non-goals

- Native app builds (React Native / Capacitor), Google Play / App Store
  submission — explicitly out of scope per user decision; PWA install only.
- Offline support / offline page caching of API data. The service worker
  only precaches the static app shell (JS/CSS/fonts/icons); `/api/*` and
  `/socket.io/*` are never intercepted or cached, so the app behaves
  exactly as it does today whenever the device is online. Going offline is
  not a supported use case in this change.
- Push notifications (a service worker is a prerequisite for Web Push, but
  wiring actual push subscriptions/backend is a separate feature).
- Actually adding new camera/mic-using features (e.g. live in-app camera
  capture for posts/stories). Today all media uploads go through plain
  `<input type="file" accept="image/*,video/*">` — that's unchanged. This
  change only adds visibility/control over the permission *state*.

## Package & build changes

`frontend/package.json`:
- Add `vite-pwa/vite-plugin-pwa` (dev dependency).
- Add `@vite-pwa/assets-generator` (dev dependency) to generate the icon set
  from the existing `frontend/public/social-favicon.svg` (Instagram-gradient
  camera-lens mark) — produces 192×192, 512×512, and a maskable 512×512
  variant with safe-zone padding. No new artwork needed.
- Add script: `"generate-pwa-assets": "pwa-assets-generator"`.

`frontend/vite.config.js`:
- Add `VitePWA({ registerType: 'autoUpdate', ... })` to the `plugins` array.
- `manifest`: `name: 'NexVibe'`, `short_name: 'NexVibe'`,
  `description` (reuse the one already in `index.html`), `theme_color:
  '#E1306C'` (matches existing `<meta name="theme-color">`), `background_color`
  matching `--bg-primary`, `display: 'standalone'`, `start_url: '/'`,
  icons array pointing at the generated set.
- `workbox.navigateFallbackDenylist`: exclude `/api` and `/socket.io` so
  the SPA fallback never intercepts them.
- `workbox.runtimeCaching`: **not** configured for `/api/*` or
  `/socket.io/*` — those requests bypass the service worker entirely
  (default network behavior), only same-origin build assets are precached.
  This is the mechanism that keeps auth/session/real-time data always live.

`frontend/index.html`:
- No manual `<link rel="manifest">` needed — the plugin injects it. Add
  `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` (part of the
  generated set) since iOS ignores the web manifest icon list.

## Frontend changes

### `frontend/src/pages/LandingPage.jsx`

- `NAV_LINKS`: insert `{ label: 'Download', path: '/download' }` right after
  the existing `{ label: 'Security', path: '/security' }` entry.

### `frontend/src/App.jsx`

- New public route `/download` → `DownloadPage`, registered alongside the
  other public pages (`/security`, `/community`, etc.) — no auth guard, same
  pattern as those.

### `frontend/src/pages/Download.jsx` (new)

Follows the same header/footer/theme-toggle shell as `Security.jsx` /
`Community.jsx` (reuses `FiSun`/`FiMoon` + `useTheme`, per the existing
convention already in every other public page).

Device detection (`navigator.userAgent`, computed once on mount):
- `platform`: `'android' | 'ios' | 'windows' | 'macos' | 'other'`
- `canPrompt`: whether a `beforeinstallprompt` event has fired (Chromium
  Android/Desktop only — captured via a `window.addEventListener`, stored in
  state, `event.preventDefault()`-ed and replayed on button click via
  `event.prompt()`).
- `isStandalone`: `window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true`.

Renders one primary card matched to the detected platform (Android /
iOS / Windows / macOS), plus the other three collapsed as secondary
options below (a visitor on a phone might still want the desktop steps to
send to themselves, etc.):

- **Android / Windows / macOS on Chrome, Edge, Samsung Internet**
  (`canPrompt === true`): "Install App" button → calls the stored
  `beforeinstallprompt` event's `.prompt()`. On the resulting
  `userChoice`, toast success/dismissed.
- **Android / Windows / macOS but `canPrompt === false`** (e.g. Firefox,
  or Chromium that hasn't fired the event yet): numbered manual steps
  (browser menu → "Install app" / "Add to Home screen"), no button.
- **iOS Safari** (always `canPrompt === false` — Apple doesn't expose this
  API): numbered manual steps — tap the Share icon → "Add to Home Screen"
  → Add. Includes the Share glyph so it's recognizable.
- **`isStandalone === true`** (any platform): replace the card content with
  "✅ Already installed on this device" — no button, no steps.

### `frontend/src/pages/main/SettingsPage.jsx`

- `SECTIONS`: insert `{ key: 'app', label: 'App' }` (placed after
  `notifications`, before `blocked` — permissions are closely related to
  notification settings which already sit there).
- New `AppPermissionsSection` component (same file, following the existing
  pattern where each section is a local component e.g. `EditProfileSection`,
  `AccountSection`):
  - For Camera and Microphone: `navigator.permissions.query({ name:
    'camera' | 'microphone' })` to read current state (`granted` / `denied`
    / `prompt`); Safari doesn't support querying these two names, so a
    `try/catch` falls back to an "Unknown — try the button" state rather
    than throwing.
  - For Notifications: `Notification.permission` (no query API needed).
  - For Storage: `navigator.storage.persisted()` / `.persist()` — shows
    whether the browser is allowed to keep app data long-term.
  - Each row: label, colored status pill (green=granted / red=denied /
    gray=not asked), and a "Test" button:
    - Camera/Mic "Test" calls `navigator.mediaDevices.getUserMedia({video}
      or {audio})`, immediately stops the returned tracks, and re-reads the
      permission state — this is the only way to *trigger* the browser
      prompt for these two (there's no direct "request" API).
    - Notifications "Test" calls `Notification.requestPermission()`.
    - Storage "Test" calls `navigator.storage.persist()`.
  - If a permission reads `denied`, the button is replaced with a short
    note: "Blocked in browser settings — enable it from your browser's site
    settings for this permission to work" (can't be forced from code; this
    avoids the "nothing happens, looks broken" failure mode).
  - All calls wrapped so an unsupported API (e.g. older browser) shows
    "Not supported on this browser" instead of throwing.

## Testing

- `npm run build` in `frontend/` — verify `dist/manifest.webmanifest` and
  `dist/sw.js` are emitted, and the generated icon files exist.
- Manual, via the already-running dev server + `run` skill:
  - Desktop Chrome: open `/download`, confirm the install button appears
    and the browser's own install icon shows in the address bar; complete
    an install and confirm the app opens standalone.
  - Simulate iOS (Chrome DevTools device toolbar + UA override) to confirm
    the manual-steps card renders instead of a button.
  - With the app open normally (not installed), confirm feed/messages/
    real-time notifications still work unchanged — proves the service
    worker isn't intercepting `/api` or `/socket.io`.
  - Settings → App: click each "Test" button, confirm the browser permission
    prompt appears and the status pill updates after granting/denying.
