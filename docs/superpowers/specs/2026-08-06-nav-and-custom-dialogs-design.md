# Shared Public Nav, Custom Dialog System, Download Page Rework — Design

## Problem

1. **Nav bar disappears on public subpages.** `LandingPage.jsx` has a full nav
   (Features, Reels, Community, Security, Download + Login/Sign up), but
   `Community.jsx`, `Security.jsx`, `Download.jsx`, `Blog.jsx`,
   `BlogPostDetails.jsx`, `Cookies.jsx`, `Help.jsx`, `Privacy.jsx`, and
   `Terms.jsx` each carry their own copy-pasted minimal header (logo + theme
   toggle + a single "Back to X" link) — the nav links vanish the moment you
   navigate off the landing page.
2. **The app uses the browser's native `confirm()`/`alert()`/`prompt()`**
   in 7 places (`PostOptionsMenu.jsx`, `AdminPosts.jsx`, `AdminReports.jsx`,
   `AdminUserDetail.jsx` ×2, `AdminUsers.jsx`, `StoriesPage.jsx`,
   `BlogPostDetails.jsx`) — unstyled OS-level dialogs that don't match the
   app.
3. **The `/download` page's install buttons only work for the browser you're
   currently on** (Windows/Android via `beforeinstallprompt`), and iOS/Mac
   only ever show plain instruction text, no button, no confirmation step —
   inconsistent with Windows/Android's button-driven flow.

## Goals

- One shared nav bar component rendered identically on every public page
  (logged-out landing + all its sub-pages).
- A reusable custom confirm/prompt dialog, styled like the rest of the app
  (same shell as the existing `ReportModal`), replacing every native
  `confirm()`/`prompt()` call site. The one `alert()` (a notice, not a
  decision) becomes a `toast.success()` instead, matching how the rest of
  the app already reports success.
- `/download` shows all 4 platforms (Android, iPhone & iPad, Windows, Mac)
  as equal cards, each with a Download button that opens the same custom
  dialog — for the visitor's actual device with a real install prompt
  available, confirming triggers the real browser install; otherwise (any
  other platform's card, or no native prompt available) confirming reveals
  that platform's manual steps inside the dialog.

## Non-goals

- No app-store/native builds — still PWA-only, per the earlier PWA design.
- No visual redesign of the header beyond fixing the missing-nav bug —
  same nav links, same styling as today's `LandingPage.jsx` header.
- `PublicHeader` standardizes on `sticky top-0` (the pattern 9 of the 10
  pages already use) rather than `LandingPage`'s current `fixed` header.
  `LandingPage`'s hero section will sit ~64px lower than today (no more
  content-behind-header overlap) — a minor, acceptable visual shift, not a
  redesign.
- The per-page "Back to Home" / "Back to App" / "All Posts" secondary link
  each subpage currently has is dropped — `PublicHeader`'s full nav
  (including the NexVibe logo, which already links to `/`) replaces the
  need for a dedicated back link.
- No queueing/stacking for the new dialog system — one dialog open at a
  time is all any current call site needs.

## Shared public header

### `frontend/src/components/common/PublicHeader.jsx` (new)

Extracted from `LandingPage.jsx`'s current header block verbatim (desktop
nav, mobile hamburger menu, theme toggle, Login/Sign up buttons), changed
from `fixed` to `sticky` positioning. `NAV_LINKS` moves into this file:

```js
const NAV_LINKS = [
  { label: 'Features', path: '/#features' },
  { label: 'Reels', path: '/#reels' },
  { label: 'Community', path: '/community' },
  { label: 'Security', path: '/security' },
  { label: 'Download', path: '/download' },
];
```

Every entry is now a `path` (plain `<Link>`), including Features/Reels —
the `href`/`scrollTo` branch is removed since there is no in-page scroll
target once this header is shared across pages that aren't the landing
page.

`PublicHeader`'s own inner container is always `max-w-6xl` (matching
`LandingPage.jsx`'s current header), regardless of what max-width each
page's own `<main>` content below it uses (`Cookies.jsx`/`Privacy.jsx`/
`Terms.jsx` use `max-w-4xl` for their body text) — a header wider than the
page's body content is normal and not a bug to fix here.

### `frontend/src/pages/LandingPage.jsx`

- Replace the entire existing `<header>...</header>` block (and the
  `NAV_LINKS` array, `scrollTo`, `mobileMenuOpen` state, and the
  `FiMenu`/`FiX` imports it used) with `<PublicHeader />`.
- Add one mount effect so `/#features`/`/#reels` links still work when they
  land here from another page:
  ```js
  useEffect(() => {
    if (window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);
  ```
- The in-page CTA buttons already on the page that call `scrollTo('#stats')`
  etc. (e.g. line 437) are unaffected — `scrollTo` stays defined locally in
  `LandingPage.jsx` for those, only the header's copy is removed.

### `frontend/src/pages/Community.jsx`, `Security.jsx`, `Download.jsx`, `Blog.jsx`, `BlogPostDetails.jsx`, `Cookies.jsx`, `Help.jsx`, `Privacy.jsx`, `Terms.jsx`

- Replace each file's `<header>...</header>` block with `<PublicHeader />`.
- Remove the now-unused `useTheme`, `FiSun`/`FiMoon` imports from each of
  these files if nothing else in the file still uses `isDark`/`toggleTheme`
  (check per file — some may use `isDark` elsewhere for content styling,
  keep the import in that case, just drop the now-dead theme-toggle button
  markup and the header's own `Link`/icon imports that only served the old
  header).

## Custom confirm/prompt dialog system

### `frontend/src/components/common/ConfirmDialog.jsx` (new)

Presentational only — no context/API awareness. Same shell as
`ReportModal.jsx` (`.modal-overlay`, bottom-sheet on mobile / centered card
on desktop).

Props: `open`, `title`, `message` (string, optional if `children` given),
`children` (optional custom body, overrides `message`), `confirmLabel`
(default `'OK'`), `cancelLabel` (default `'Cancel'`), `danger` (bool — red
confirm button via existing `text-red-500`/`border-red-300` classes seen
elsewhere in the app, e.g. `AdminUserDetail.jsx`'s delete button), `showInput`
(bool — renders a text `<input>` when true, following the `input-field`
class already used in `SettingsPage.jsx`), `inputPlaceholder`,
`onConfirm(value)`, `onCancel()`. When `showInput` is true, `onConfirm`
receives the input's current string value; otherwise `onConfirm()` takes no
argument.

### `frontend/src/context/DialogContext.jsx` (new)

```js
const DialogContext = createContext(null);

export const DialogProvider = ({ children }) => {
  const [request, setRequest] = useState(null); // { title, message, danger, confirmLabel, showInput, inputPlaceholder, resolve }

  const confirmDialog = useCallback(({ title, message, danger, confirmLabel } = {}) =>
    new Promise((resolve) => setRequest({ title, message, danger, confirmLabel, showInput: false, resolve })), []);

  const promptDialog = useCallback(({ title, inputPlaceholder } = {}) =>
    new Promise((resolve) => setRequest({ title, showInput: true, inputPlaceholder, resolve })), []);

  const close = (value) => { request?.resolve(value); setRequest(null); };

  return (
    <DialogContext.Provider value={{ confirmDialog, promptDialog }}>
      {children}
      {request && (
        <ConfirmDialog
          open
          title={request.title}
          message={request.message}
          danger={request.danger}
          confirmLabel={request.confirmLabel}
          showInput={request.showInput}
          inputPlaceholder={request.inputPlaceholder}
          onConfirm={(value) => close(request.showInput ? value : true)}
          onCancel={() => close(request.showInput ? null : false)}
        />
      )}
    </DialogContext.Provider>
  );
};

export const useConfirm = () => useContext(DialogContext).confirmDialog;
export const usePrompt = () => useContext(DialogContext).promptDialog;
```

`confirmDialog(...)` resolves `true`/`false`; `promptDialog(...)` resolves
the entered string or `null` on cancel — matching native `confirm`/`prompt`
semantics closely enough that call sites barely change.

### `frontend/src/App.jsx`

Wrap the provider tree with `<DialogProvider>` (inside `ThemeProvider`,
alongside `AuthProvider`/`SocketProvider` — order doesn't matter since
`ConfirmDialog` only reads theme via the existing CSS variables, not the
theme context directly).

### Call-site conversions

Each of these imports `useConfirm` (and `usePrompt` where noted) and adds
`await`:

- **`frontend/src/components/post/PostOptionsMenu.jsx:17`**
  `if (!window.confirm('Delete this post? This cannot be undone.')) return;`
  →
  `if (!(await confirmDialog({ message: 'Delete this post? This cannot be undone.', danger: true, confirmLabel: 'Delete' }))) return;`
- **`frontend/src/pages/admin/AdminPosts.jsx:31`** — same pattern, message
  `'Remove this post?'`, `confirmLabel: 'Remove'`.
- **`frontend/src/pages/admin/AdminReports.jsx:62`** — same pattern, the
  existing dynamic `verb` string becomes the `message`.
- **`frontend/src/pages/admin/AdminUserDetail.jsx:23`**
  `const reason = prompt('Ban reason:'); if (reason === null) return;`
  →
  `const reason = await promptDialog({ title: 'Ban user', inputPlaceholder: 'Reason for ban' }); if (reason === null) return;`
- **`frontend/src/pages/admin/AdminUserDetail.jsx:48`**,
  **`AdminUsers.jsx:57`**, **`StoriesPage.jsx:104`** — same confirm pattern
  as `PostOptionsMenu`, each keeping its existing message text, all
  `danger: true`.
- **`frontend/src/pages/BlogPostDetails.jsx:305`**
  `alert('Link copied to clipboard!');` → `toast.success('Link copied to clipboard!');`
  (needs `import toast from 'react-hot-toast'` — check whether the file
  already imports it before adding).

## `/download` page rework

### `frontend/src/pages/Download.jsx`

- Replace the single primary-card + collapsed-"Other devices" layout with
  a responsive grid (`grid grid-cols-1 sm:grid-cols-2 gap-4`) of exactly 4
  cards, one per entry in `PLATFORM_INFO` minus `other` (`android`, `ios`,
  `windows`, `macos` — the existing `other` fallback entry is dropped from
  the grid; if `detectPlatform` returns `'other'`, no card gets the "Your
  device" badge and every card behaves as a non-current-device card).
- Each card: icon, label, a "Your device" badge (small pill, reuse the
  `bg-[var(--bg-tertiary)] text-[var(--text-muted)]` pill style already
  used elsewhere) when `platform === detectedPlatform`, and either:
  - "✅ Already installed" text (no button) when
    `platform === detectedPlatform && installed`, or
  - a "Download" button otherwise.
- Local state: `installTarget` (the platform key whose dialog is open, or
  `null`) and `installStep` (`'confirm'` or `'steps'`).
- Clicking a card's Download button sets `installTarget` to that card's
  platform and `installStep` to `'confirm'`.
- Render one `<ConfirmDialog>` (imported directly, not via the
  `useConfirm()` hook — this one needs custom step-driven content, not a
  one-shot yes/no) controlled by `installTarget`:
  - `installStep === 'confirm'`: `title="Install NexVibe on {label}?"`,
    default message, `onConfirm`:
    - if `installTarget === platform && canPrompt` (the real
      `beforeinstallprompt` is available for this exact device right now):
      call the existing `handleInstall()` logic (unchanged from before —
      `getDeferredPrompt().prompt()`, await `userChoice`, toast, clear
      state), then close the dialog (`setInstallTarget(null)`).
    - otherwise: `setInstallStep('steps')` (dialog stays open, re-renders
      with the steps view — does not call `onCancel`/close).
  - `installStep === 'steps'`: `children` = the platform's `MANUAL_STEPS`
    rendered as the existing numbered `<ol>`, `confirmLabel="Got it"`,
    `onConfirm` closes the dialog (`setInstallTarget(null)`).
  - `onCancel` always closes the dialog outright
    (`setInstallTarget(null)`).
- `isStandaloneDisplay()`, `detectPlatform`, `PLATFORM_INFO`, `MANUAL_STEPS`,
  `getDeferredPrompt`/`onInstallPromptAvailable`/`clearDeferredPrompt` all
  stay exactly as they are today — only the layout and the confirm flow
  change.
- `PublicHeader` (see above) replaces this page's own header block, same
  as every other public page.

## Testing

- `npm run build` in `frontend/` — confirms no import errors from the
  header extraction across 10 files.
- Manual, via the `run` skill against the dev server:
  - Visit `/community`, `/security`, `/download`, `/blog`, `/help`, etc. —
    confirm the full nav (Features, Reels, Community, Security, Download,
    Login, Sign up) is present and every link navigates correctly,
    including Features/Reels jumping to the right section on the landing
    page from a different starting page.
  - On the landing page, click a nav link, then Back — confirm the hero
    section still renders correctly under the now-sticky (not fixed)
    header.
  - Trigger each of the 7 converted dialogs (delete a post, ban a user via
    admin, delete a story, etc.) — confirm the custom dialog appears
    instead of a native browser dialog, Cancel and Confirm both behave
    like the original `confirm`/`prompt` did, and the ban-reason input
    dialog passes the typed reason through unchanged.
  - Copy a blog post link — confirm a toast appears instead of a native
    `alert`.
  - On `/download`: click each of the 4 platform cards' Download button —
    confirm the two-step dialog flow (confirm → either real install prompt
    or manual steps) works for both the current device's card and another
    platform's card.
