# Shared Public Nav, Custom Dialog System, Download Page Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every public page shows the same full nav bar (not just the landing page), every native `confirm()`/`alert()`/`prompt()` in the app is replaced with a custom in-app dialog, and `/download` shows all 4 platforms as equal cards each with a button-driven install confirmation.

**Architecture:** A new `PublicHeader` component (extracted from `LandingPage.jsx`'s existing header) is dropped into every public page, replacing each page's own copy-pasted mini-header. A new `ConfirmDialog` (presentational) + `DialogContext` (imperative `useConfirm()`/`usePrompt()` hooks resolving a Promise, mounted once in `App.jsx`) replaces the 7 native dialog call sites app-wide, and is reused directly (without the context) by the reworked `/download` page for its per-platform install-confirmation flow.

**Tech Stack:** React 18, React Router, existing Tailwind utility classes and `.modal-overlay`/`btn-brand`/`btn-outline`/`input-field` classes already defined in `frontend/src/styles/index.css`.

## Global Constraints

- `PublicHeader` uses `sticky top-0` positioning (not `fixed`) — this is a deliberate, spec-approved change from `LandingPage.jsx`'s current `fixed` header; its hero section will sit ~64px lower than today, which is fine.
- `PublicHeader`'s inner container is always `max-w-6xl` regardless of the page's own body content width (some pages use `max-w-4xl` for body text) — a wider header than body content is expected, not a bug.
- No per-page "Back to Home"/"Back to App"/"All Posts" link is preserved — `PublicHeader`'s full nav (plus its logo, which already links to `/`) replaces that.
- The dialog system has no queueing — one dialog open at a time is sufficient for every current call site.
- No native app builds, no `/download` app-store links — still PWA-only.

---

## Task 1: `PublicHeader` component + `LandingPage.jsx` wiring

**Files:**
- Create: `frontend/src/components/common/PublicHeader.jsx`
- Modify: `frontend/src/pages/LandingPage.jsx`

**Interfaces:**
- Produces: `export default function PublicHeader()` — a self-contained component taking no props (reads `useAuth()` and `useTheme()` itself). Consumed by Task 2 and already used here in Task 1.

- [ ] **Step 1: Create `PublicHeader.jsx`**

```jsx
// frontend/src/components/common/PublicHeader.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { FiSun, FiMoon, FiMenu, FiX } from 'react-icons/fi';
import { BsInstagram } from 'react-icons/bs';

const NAV_LINKS = [
  { label: 'Features', path: '/#features' },
  { label: 'Reels', path: '/#reels' },
  { label: 'Community', path: '/community' },
  { label: 'Security', path: '/security' },
  { label: 'Download', path: '/download' },
];

export default function PublicHeader() {
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 ig-gradient rounded-xl flex items-center justify-center">
            <BsInstagram className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-black text-gradient">NexVibe</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(l => (
            <Link key={l.path} to={l.path}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-all">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)]">
            {isDark ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
          </button>
          {user ? (
            <Link to="/feed" className="btn-brand px-4 py-2 text-sm rounded-xl">
              Go to feed
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden sm:block px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors">
                Log in
              </Link>
              <Link to="/register" className="btn-brand px-4 py-2 text-sm rounded-xl">
                Sign up free
              </Link>
            </>
          )}
          <button onClick={() => setMobileMenuOpen(v => !v)} className="md:hidden p-2 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors">
            {mobileMenuOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-[var(--bg-primary)] border-t border-[var(--border)] px-4 py-4 space-y-1 animate-slide-down">
          {NAV_LINKS.map(l => (
            <Link key={l.path} to={l.path} onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-left px-4 py-3 rounded-xl text-sm font-medium hover:bg-[var(--bg-tertiary)] transition-colors">
              {l.label}
            </Link>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            {user ? (
              <Link to="/feed" onClick={() => setMobileMenuOpen(false)} className="btn-brand w-full text-center py-2.5 rounded-xl text-sm">Go to feed</Link>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="btn-outline w-full text-center py-2.5 rounded-xl text-sm">Log in</Link>
                <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="btn-brand w-full text-center py-2.5 rounded-xl text-sm">Sign up free</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 2: Wire it into `LandingPage.jsx`**

In `frontend/src/pages/LandingPage.jsx`:

1. Add the import near the top, alongside the other component imports (there are none currently besides icon libraries — add it right after the `useTheme` import):
   ```js
   import PublicHeader from '../components/common/PublicHeader';
   ```
2. Remove the `NAV_LINKS` array entirely (currently defined right after `PHONE_SCREENS`):
   ```js
   const NAV_LINKS = [
     { label: 'Features', href: '#features' },
     { label: 'Reels', href: '#reels' },
     { label: 'Community', path: '/community' },
     { label: 'Security', path: '/security' },
     { label: 'Download', path: '/download' },
   ];
   ```
3. Remove `FiMenu, FiX,` from the `react-icons/fi` import list (they're only used in the header block being deleted — `FiSun`/`FiMoon` stay, the page's footer has its own separate theme toggle that still needs them).
4. Remove the `const [mobileMenuOpen, setMobileMenuOpen] = useState(false);` line.
5. In the `scrollTo` function, remove the `setMobileMenuOpen(false);` line (no longer relevant — the mobile menu now lives entirely inside `PublicHeader`, and `scrollTo` is only called from in-page CTA buttons, never from a menu that needs closing):
   ```js
   const scrollTo = (id) => {
     document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
   };
   ```
6. Add a hash-scroll effect right after the existing `useEffect` hooks (the "Cycle features highlight" and "Intersection observer for stats" ones), so `/#features`/`/#reels` links from other pages land correctly:
   ```js
   useEffect(() => {
     if (window.location.hash) {
       document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' });
     }
   }, []);
   ```
7. Replace the entire `<header className="fixed top-0 left-0 right-0 z-50 ...">...</header>` block (everything from the `{/* ── NAVBAR ── */}` comment through its matching `</header>` — this includes the desktop nav, the Login/Sign up buttons, and the `{mobileMenuOpen && (...)}` mobile menu block) with a single line:
   ```jsx
   <PublicHeader />
   ```

- [ ] **Step 3: Verify it builds and renders**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds with no import errors.

Run `npm run dev`, then in another terminal:
```bash
curl -s http://localhost:5173/ | grep -o '<div id="root">'
```
Expected: prints `<div id="root">`.

Using the project's `run` skill (browser-driven pattern), open `http://localhost:5173/`:
- Confirm the nav bar (Features, Reels, Community, Security, Download, Log in, Sign up free) renders and is now `sticky` (scroll the page — the header should stay pinned at the top instead of scrolling away, and should not overlap the hero text at the very top of the page).
- Click "Features" — confirm it scrolls to the Features section.
- Click "Community" then browser Back — confirm you land back on the landing page and it still renders correctly.

Stop the dev server after confirming.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/PublicHeader.jsx frontend/src/pages/LandingPage.jsx
git commit -m "feat: extract shared PublicHeader, wire into LandingPage"
```

---

## Task 2: Apply `PublicHeader` to the remaining 9 public pages

**Files:**
- Modify: `frontend/src/pages/Community.jsx`
- Modify: `frontend/src/pages/Security.jsx`
- Modify: `frontend/src/pages/Download.jsx`
- Modify: `frontend/src/pages/Blog.jsx`
- Modify: `frontend/src/pages/BlogPostDetails.jsx`
- Modify: `frontend/src/pages/Cookies.jsx`
- Modify: `frontend/src/pages/Help.jsx`
- Modify: `frontend/src/pages/Privacy.jsx`
- Modify: `frontend/src/pages/Terms.jsx`

**Interfaces:**
- Consumes: `PublicHeader` from `frontend/src/components/common/PublicHeader.jsx` (Task 1) — `import PublicHeader from '../components/common/PublicHeader';` in every file (all 9 files live directly in `src/pages/`, same depth as `LandingPage.jsx`).

**The same 5-part edit applies to every one of the 9 files below.** Read each file first, then:

1. Add `import PublicHeader from '../components/common/PublicHeader';` near the top.
2. Delete the file's entire `<header className="sticky top-0 z-50 ...">...</header>` block (every one of these 9 files has this exact header pattern — logo + theme-toggle button + one "Back to X" link) and replace it with `<PublicHeader />`.
3. Remove the `import { useTheme } from '../context/ThemeContext';` line and the `const { isDark, toggleTheme } = useTheme();` line — confirmed by direct inspection that none of these 9 files use `isDark`/`toggleTheme` anywhere outside the header being deleted.
4. Remove `FiSun` and `FiMoon` from that file's `react-icons/fi` import list (keep every other icon in the list — they're used elsewhere in the page).
5. **Only for these two files**, additionally:
   - `Download.jsx`: remove the now-fully-unused `import { Link } from 'react-router-dom';` line — every `<Link>` in this file was inside the header being deleted, there is no other `<Link>` usage in the file.
   - For all 8 files **except** `BlogPostDetails.jsx`: remove the now-unused `BsInstagram` import (from `react-icons/bs`) — every one of these 8 files only used `BsInstagram` inside the header being deleted. **Do not** remove it from `BlogPostDetails.jsx` — that file also uses `BsInstagram` at a share-icon button elsewhere in the page (unrelated to the header).
   - `Community.jsx`, `Security.jsx`, `Blog.jsx`, `BlogPostDetails.jsx`, `Cookies.jsx`, `Help.jsx`, `Privacy.jsx`, `Terms.jsx` (i.e. every file except `Download.jsx`): keep the `Link` import — each of these has at least one other `<Link>` elsewhere in its body content, unrelated to the header.

- [ ] **Step 1: Apply the edit to all 9 files**

Work through `Community.jsx`, `Security.jsx`, `Download.jsx`, `Blog.jsx`, `BlogPostDetails.jsx`, `Cookies.jsx`, `Help.jsx`, `Privacy.jsx`, `Terms.jsx` one at a time, applying the 5-part edit above to each.

- [ ] **Step 2: Verify it builds**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds with no import errors (no "X is not defined" / no unresolved import errors) across all 9 files.

- [ ] **Step 3: Manually verify each page in a real browser**

Run `npm run dev`, then using the project's `run` skill, visit each of `/community`, `/security`, `/download`, `/blog`, `/blog/:id` (open any post from `/blog`), `/cookies`, `/help`, `/privacy`, `/terms`:
- Confirm the full nav bar renders identically on every page (Features, Reels, Community, Security, Download, Log in, Sign up free).
- Confirm every page's own body content (page title, page-specific text) still renders correctly below the header — the header swap shouldn't have broken anything else on the page.
- Confirm the theme toggle button in the new header still switches dark/light mode on each of these pages.

Stop the dev server after confirming.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Community.jsx frontend/src/pages/Security.jsx frontend/src/pages/Download.jsx frontend/src/pages/Blog.jsx frontend/src/pages/BlogPostDetails.jsx frontend/src/pages/Cookies.jsx frontend/src/pages/Help.jsx frontend/src/pages/Privacy.jsx frontend/src/pages/Terms.jsx
git commit -m "fix: apply shared PublicHeader across all public pages"
```

---

## Task 3: `ConfirmDialog` + `DialogContext` + first call-site conversion

**Files:**
- Create: `frontend/src/components/common/ConfirmDialog.jsx`
- Create: `frontend/src/context/DialogContext.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/post/PostOptionsMenu.jsx`

**Interfaces:**
- Produces: `export default function ConfirmDialog({ open, title, message, children, confirmLabel, cancelLabel, danger, showInput, inputPlaceholder, onConfirm, onCancel })` — consumed by `DialogContext` here, and directly by Task 5 (`Download.jsx`).
- Produces: `export const useConfirm = () => (opts: { title?, message, danger?, confirmLabel? }) => Promise<boolean>` and `export const usePrompt = () => (opts: { title?, inputPlaceholder? }) => Promise<string | null>` from `DialogContext.jsx` — consumed by Task 4's remaining call sites and here by `PostOptionsMenu.jsx`.

- [ ] **Step 1: Create `ConfirmDialog.jsx`**

```jsx
// frontend/src/components/common/ConfirmDialog.jsx
import { useState, useEffect } from 'react';

export default function ConfirmDialog({
  open, title, message, children, confirmLabel = 'OK', cancelLabel = 'Cancel',
  danger = false, showInput = false, inputPlaceholder = '', onConfirm, onCancel
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="absolute bottom-0 left-0 right-0 lg:relative lg:w-[400px] bg-[var(--bg-primary)] rounded-t-3xl lg:rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
        {title && (
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h2 className="font-bold text-sm">{title}</h2>
          </div>
        )}
        <div className="px-5 py-4">
          {children || (message && <p className="text-sm text-[var(--text-secondary)]">{message}</p>)}
          {showInput && (
            <input
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={inputPlaceholder}
              className="input-field mt-3 w-full"
            />
          )}
        </div>
        <div className="flex gap-2 p-4">
          <button onClick={onCancel} className="flex-1 btn-outline py-2.5 rounded-xl text-sm font-semibold">
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(showInput ? value : undefined)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${danger ? 'bg-red-500 hover:bg-red-600 text-white' : 'btn-brand'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `DialogContext.jsx`**

```jsx
// frontend/src/context/DialogContext.jsx
import { createContext, useContext, useState, useCallback } from 'react';
import ConfirmDialog from '../components/common/ConfirmDialog';

const DialogContext = createContext(null);

export const DialogProvider = ({ children }) => {
  const [request, setRequest] = useState(null);

  const confirmDialog = useCallback(({ title, message, danger, confirmLabel } = {}) =>
    new Promise((resolve) => setRequest({ title, message, danger, confirmLabel, showInput: false, resolve })), []);

  const promptDialog = useCallback(({ title, inputPlaceholder } = {}) =>
    new Promise((resolve) => setRequest({ title, showInput: true, inputPlaceholder, resolve })), []);

  const close = (value) => {
    request?.resolve(value);
    setRequest(null);
  };

  return (
    <DialogContext.Provider value={{ confirmDialog, promptDialog }}>
      {children}
      <ConfirmDialog
        open={!!request}
        title={request?.title}
        message={request?.message}
        danger={request?.danger}
        confirmLabel={request?.confirmLabel}
        showInput={request?.showInput}
        inputPlaceholder={request?.inputPlaceholder}
        onConfirm={(value) => close(request?.showInput ? value : true)}
        onCancel={() => close(request?.showInput ? null : false)}
      />
    </DialogContext.Provider>
  );
};

export const useConfirm = () => useContext(DialogContext).confirmDialog;
export const usePrompt = () => useContext(DialogContext).promptDialog;
```

`confirmDialog(...)` resolves `true` on Confirm, `false` on Cancel. `promptDialog(...)` resolves the entered string on Confirm, `null` on Cancel — deliberately close to native `confirm`/`prompt` semantics so call sites barely change.

- [ ] **Step 3: Wire `DialogProvider` into `App.jsx`**

In `frontend/src/App.jsx`, add the import:
```js
import { DialogProvider } from './context/DialogContext';
```

Replace the `<BrowserRouter>...</BrowserRouter>` block with (this wraps the
existing `<AppRoutes />` and `<Toaster ... />` in `<DialogProvider>` —
neither of their own props/content changes, only the new wrapping tag and
its matching indentation):
```jsx
              <BrowserRouter>
                <DialogProvider>
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
                </DialogProvider>
              </BrowserRouter>
```

- [ ] **Step 4: Convert `PostOptionsMenu.jsx`'s delete confirmation**

In `frontend/src/components/post/PostOptionsMenu.jsx`, add the import:
```js
import { useConfirm } from '../../context/DialogContext';
```

Add the hook call inside the component body, right after `const navigate = useNavigate();`:
```js
const confirmDialog = useConfirm();
```

Change:
```js
      label: 'Delete', danger: true, onClick: async () => {
        if (!window.confirm('Delete this post? This cannot be undone.')) return;
        try { await postAPI.deletePost(post._id); toast.success('Post deleted'); onDelete?.(); }
        catch { toast.error('Failed to delete'); }
      }
```
to:
```js
      label: 'Delete', danger: true, onClick: async () => {
        if (!(await confirmDialog({ message: 'Delete this post? This cannot be undone.', danger: true, confirmLabel: 'Delete' }))) return;
        try { await postAPI.deletePost(post._id); toast.success('Post deleted'); onDelete?.(); }
        catch { toast.error('Failed to delete'); }
      }
```

- [ ] **Step 5: Verify it builds**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds with no import/reference errors.

- [ ] **Step 6: Manually verify the dialog end-to-end**

This requires a logged-in session with at least one of your own posts, which the implementer may not have credentials for in this environment. If you can log in:

Run `npm run dev`, using the project's `run` skill, log in, open one of your own posts' options menu, click "Delete":
- Confirm a custom-styled dialog appears (matching the app's rounded-card look) instead of a native browser confirm popup, showing "Delete this post? This cannot be undone." with red "Delete" and outlined "Cancel" buttons.
- Click "Cancel" — confirm the post is NOT deleted and the dialog closes.
- Repeat and click "Delete" — confirm the post is deleted and a success toast appears.

If no login credentials are available in this environment, skip this live check, note it explicitly in your report as unverified, and rely on the build succeeding plus a careful re-read of the diff against this brief.

Stop the dev server after confirming (if you ran it).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/ConfirmDialog.jsx frontend/src/context/DialogContext.jsx frontend/src/App.jsx frontend/src/components/post/PostOptionsMenu.jsx
git commit -m "feat: add custom ConfirmDialog/DialogContext, convert first call site"
```

---

## Task 4: Convert the remaining 6 native dialog call sites

**Files:**
- Modify: `frontend/src/pages/admin/AdminPosts.jsx`
- Modify: `frontend/src/pages/admin/AdminReports.jsx`
- Modify: `frontend/src/pages/admin/AdminUserDetail.jsx`
- Modify: `frontend/src/pages/admin/AdminUsers.jsx`
- Modify: `frontend/src/pages/main/StoriesPage.jsx`
- Modify: `frontend/src/pages/BlogPostDetails.jsx`

**Interfaces:**
- Consumes: `useConfirm`, `usePrompt` from `frontend/src/context/DialogContext.jsx` (Task 3).

- [ ] **Step 1: `AdminPosts.jsx`**

Add import: `import { useConfirm } from '../../context/DialogContext';`
Add inside the component body (near its other hook calls, e.g. right after `useState`/`useCallback` declarations): `const confirmDialog = useConfirm();`

Change:
```js
  const handleDelete = async (id) => {
    if (!confirm('Remove this post?')) return;
```
to:
```js
  const handleDelete = async (id) => {
    if (!(await confirmDialog({ message: 'Remove this post?', danger: true, confirmLabel: 'Remove' }))) return;
```

- [ ] **Step 2: `AdminReports.jsx`**

Add import: `import { useConfirm } from '../../context/DialogContext';`
Add inside the component body: `const confirmDialog = useConfirm();`

Change:
```js
  const handleResolve = async (group, action) => {
    const verb = action === 'dismiss' ? 'Dismiss this report' : group.targetType === 'post' ? 'Remove this post' : 'Ban this user';
    if (!confirm(`${verb}?`)) return;
```
to:
```js
  const handleResolve = async (group, action) => {
    const verb = action === 'dismiss' ? 'Dismiss this report' : group.targetType === 'post' ? 'Remove this post' : 'Ban this user';
    if (!(await confirmDialog({ message: `${verb}?`, danger: action !== 'dismiss', confirmLabel: verb.split(' ')[0] }))) return;
```

- [ ] **Step 3: `AdminUserDetail.jsx`**

Add import: `import { useConfirm, usePrompt } from '../../context/DialogContext';`
Add inside the component body, right after `const { user: currentUser } = useAuth();`:
```js
  const confirmDialog = useConfirm();
  const promptDialog = usePrompt();
```

Change:
```js
  const handleBan = async () => {
    const reason = prompt('Ban reason:');
    if (reason === null) return;
```
to:
```js
  const handleBan = async () => {
    const reason = await promptDialog({ title: 'Ban user', inputPlaceholder: 'Reason for ban' });
    if (reason === null) return;
```

Change:
```js
  const handleDelete = async () => {
    if (!confirm('Permanently delete this user?')) return;
```
to:
```js
  const handleDelete = async () => {
    if (!(await confirmDialog({ message: 'Permanently delete this user?', danger: true, confirmLabel: 'Delete' }))) return;
```

- [ ] **Step 4: `AdminUsers.jsx`**

Add import: `import { useConfirm } from '../../context/DialogContext';`
Add inside the component body: `const confirmDialog = useConfirm();`

Change:
```js
  const handleDelete = async (id) => {
    if (!confirm('Delete this user permanently? This cannot be undone.')) return;
```
to:
```js
  const handleDelete = async (id) => {
    if (!(await confirmDialog({ message: 'Delete this user permanently? This cannot be undone.', danger: true, confirmLabel: 'Delete' }))) return;
```

- [ ] **Step 5: `StoriesPage.jsx`**

Add import: `import { useConfirm } from '../../context/DialogContext';`
Add inside the component body (near its other hooks): `const confirmDialog = useConfirm();`

Change:
```js
  const handleDelete = async () => {
    if (!currentStory) return;
    if (!window.confirm('Delete this story?')) return;
```
to:
```js
  const handleDelete = async () => {
    if (!currentStory) return;
    if (!(await confirmDialog({ message: 'Delete this story?', danger: true, confirmLabel: 'Delete' }))) return;
```

- [ ] **Step 6: `BlogPostDetails.jsx`** — alert → toast (not a dialog conversion)

Check whether `import toast from 'react-hot-toast';` already exists in this file (it does not, per current imports). Add it near the top, alongside the other imports.

Change:
```js
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
  };
```
to:
```js
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied to clipboard!');
  };
```

- [ ] **Step 7: Verify it builds**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds with no import/reference errors across all 6 files.

- [ ] **Step 8: Manually verify what you can**

Using the project's `run` skill against `npm run dev`:
- `BlogPostDetails.jsx`'s share button needs no login — open any blog post at `/blog/:id`, click the copy-link/share action, confirm a toast reads "Link copied to clipboard!" instead of a native alert popup.
- The 5 admin/story dialogs require a logged-in session (an admin account for the 4 admin ones, any account with a story for `StoriesPage.jsx`). If credentials are available, exercise each: confirm the custom dialog appears (not a native popup), Cancel leaves the record untouched, Confirm performs the action, and for the ban-reason prompt specifically, confirm the typed reason is what gets sent (check the resulting ban reason shown afterward matches what you typed).
- If credentials aren't available in this environment, skip the live admin/story checks, note it explicitly in your report, and rely on the build succeeding plus a careful re-read of each diff against this brief.

Stop the dev server after confirming (if you ran it).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/admin/AdminPosts.jsx frontend/src/pages/admin/AdminReports.jsx frontend/src/pages/admin/AdminUserDetail.jsx frontend/src/pages/admin/AdminUsers.jsx frontend/src/pages/main/StoriesPage.jsx frontend/src/pages/BlogPostDetails.jsx
git commit -m "fix: convert remaining native confirm/prompt/alert calls to custom dialogs"
```

---

## Task 5: `/download` page rework — all 4 platforms, button-driven install confirmation

**Files:**
- Modify: `frontend/src/pages/Download.jsx`

**Interfaces:**
- Consumes: `ConfirmDialog` from `frontend/src/components/common/ConfirmDialog.jsx` (Task 3) — used directly, not via `useConfirm()`, because this flow needs custom step-driven content (confirm step → manual-steps step), not a one-shot yes/no.
- Consumes (unchanged from before this task): `detectPlatform` (`frontend/src/lib/deviceDetect.js`), `getDeferredPrompt`/`onInstallPromptAvailable`/`clearDeferredPrompt` (`frontend/src/lib/installPrompt.js`).

- [ ] **Step 1: Replace `Download.jsx`'s body content**

`PublicHeader` is already wired in from Task 2 — this step only changes what comes after it. Replace the entire file with:

```jsx
// frontend/src/pages/Download.jsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import PublicHeader from '../components/common/PublicHeader';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { detectPlatform } from '../lib/deviceDetect';
import { getDeferredPrompt, onInstallPromptAvailable, clearDeferredPrompt } from '../lib/installPrompt';
import { FiDownload, FiCheckCircle } from 'react-icons/fi';
import { FaAndroid, FaApple, FaWindows } from 'react-icons/fa6';

const PLATFORM_INFO = {
  android: { label: 'Android', icon: <FaAndroid className="w-6 h-6" /> },
  ios: { label: 'iPhone & iPad', icon: <FaApple className="w-6 h-6" /> },
  windows: { label: 'Windows', icon: <FaWindows className="w-6 h-6" /> },
  macos: { label: 'Mac', icon: <FaApple className="w-6 h-6" /> },
};

const MANUAL_STEPS = {
  android: ['Open the browser menu (⋮).', 'Tap "Install app" or "Add to Home screen".', 'Confirm to add NexVibe to your home screen.'],
  ios: ["Tap the Share icon in Safari's toolbar.", 'Scroll down and tap "Add to Home Screen".', 'Tap "Add" in the top-right corner.'],
  windows: ['Click the install icon in the address bar, or open the browser menu.', 'Choose "Install NexVibe".', 'Confirm to install.'],
  macos: ['Click the install icon in the address bar, or open the browser menu.', 'Choose "Install NexVibe".', 'Confirm to install.'],
};

const PLATFORM_KEYS = Object.keys(PLATFORM_INFO);

const isStandaloneDisplay = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function Download() {
  const [platform] = useState(() => detectPlatform(navigator.userAgent));
  const [canPrompt, setCanPrompt] = useState(() => !!getDeferredPrompt());
  const [installed, setInstalled] = useState(() => isStandaloneDisplay());
  const [installTarget, setInstallTarget] = useState(null); // platform key whose dialog is open, or null
  const [installStep, setInstallStep] = useState('confirm'); // 'confirm' | 'steps'

  useEffect(() => {
    const unsubscribe = onInstallPromptAvailable(() => setCanPrompt(true));
    return unsubscribe;
  }, []);

  const openInstallDialog = (platformKey) => {
    setInstallTarget(platformKey);
    setInstallStep('confirm');
  };

  const closeInstallDialog = () => {
    setInstallTarget(null);
    setInstallStep('confirm');
  };

  const handleConfirmInstall = async () => {
    if (installTarget === platform && canPrompt) {
      const prompt = getDeferredPrompt();
      if (!prompt) { setInstallStep('steps'); return; }
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
      closeInstallDialog();
    } else {
      setInstallStep('steps');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PublicHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <FiDownload className="w-12 h-12 text-pink-500 mx-auto mb-4" />
          <h1 className="text-4xl sm:text-5xl font-black mb-4">Install NexVibe</h1>
          <p className="text-lg text-[var(--text-secondary)] max-w-xl mx-auto">
            Get the app-like experience — install NexVibe on your device, no app store needed.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLATFORM_KEYS.map((p) => {
            const isCurrent = p === platform;
            return (
              <div key={p} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-orange-400 text-white flex items-center justify-center mx-auto mb-3">
                  {PLATFORM_INFO[p].icon}
                </div>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <h2 className="text-lg font-bold">{PLATFORM_INFO[p].label}</h2>
                  {isCurrent && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)]">Your device</span>
                  )}
                </div>
                {isCurrent && installed ? (
                  <p className="flex items-center justify-center gap-2 text-green-600 font-semibold text-sm">
                    <FiCheckCircle className="w-4 h-4" /> Already installed
                  </p>
                ) : (
                  <button onClick={() => openInstallDialog(p)} className="btn-brand inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
                    <FiDownload className="w-4 h-4" /> Download
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-[var(--text-muted)]">© {new Date().getFullYear()} NexVibe. All rights reserved.</p>
        </div>
      </footer>

      <ConfirmDialog
        open={!!installTarget}
        title={installStep === 'confirm' ? `Install NexVibe on ${installTarget ? PLATFORM_INFO[installTarget].label : ''}?` : `Install on ${installTarget ? PLATFORM_INFO[installTarget].label : ''}`}
        message={installStep === 'confirm' ? 'This will start the install process for NexVibe on this platform.' : undefined}
        confirmLabel={installStep === 'confirm' ? 'Yes, Install' : 'Got it'}
        onConfirm={installStep === 'confirm' ? handleConfirmInstall : closeInstallDialog}
        onCancel={closeInstallDialog}
      >
        {installStep === 'steps' && installTarget && (
          <ol className="text-left space-y-2 text-sm text-[var(--text-secondary)] list-decimal list-inside">
            {MANUAL_STEPS[installTarget].map((step) => <li key={step}>{step}</li>)}
          </ol>
        )}
      </ConfirmDialog>
    </div>
  );
}
```

Note: `ConfirmDialog`'s `children` prop takes precedence over `message` per its own implementation (Task 3) — on the `'confirm'` step `children` is `false` (the `installStep === 'steps' && ...` expression is falsy), so it correctly falls through to rendering `message` instead; on the `'steps'` step `children` is the `<ol>`, which correctly overrides `message` (passed as `undefined` there anyway).

- [ ] **Step 2: Verify it builds**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds with no import/reference errors (in particular, confirm no leftover reference to the old `useTheme`/`FiSun`/`FiMoon`/`Link`/`BsInstagram`/`otherPlatforms` names this full-file replacement removes).

- [ ] **Step 3: Manually verify in a real browser**

Run `npm run dev`, using the project's `run` skill, open `http://localhost:5173/download`:
- Confirm all 4 platform cards render (Android, iPhone & iPad, Windows, Mac) in a grid, each with a Download button, and the card matching your current browser/OS shows a "Your device" badge.
- Click the Download button on your current-device card. Confirm the dialog opens showing "Install NexVibe on {your platform}?" with "Yes, Install" / "Cancel".
  - If your browser supports a real install prompt (Chromium desktop/Android): click "Yes, Install" — confirm the browser's real install flow triggers, and after accepting, the card updates to "Already installed".
  - If not (e.g. Firefox, or emulating iOS via DevTools device toolbar): click "Yes, Install" — confirm the dialog transitions in place to show the numbered manual steps for that platform, with a "Got it" button that closes it.
- Click the Download button on a *different* platform's card (not your current device) — confirm the same two-step flow runs and always lands on the manual-steps view (since a real install prompt is never available for a platform you're not actually on), never attempting a real install.
- Click "Cancel" on the first step of any card — confirm the dialog closes immediately with no action taken.

Stop the dev server after confirming.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Download.jsx
git commit -m "feat: rework /download to show all platforms with confirm-dialog install flow"
```
