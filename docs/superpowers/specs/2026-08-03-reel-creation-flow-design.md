# Reel Creation Flow — Design

## Problem

Reels can be viewed (`/reels`) but not created. `reelAPI.createReel` (frontend) and
`POST /api/reels` (backend) exist but are never wired to any UI. The "Create a reel"
button on the empty Reels page navigates to `/create`, which opens the generic
`CreatePostModal` — any video uploaded there is saved as a normal feed post
(`type: 'post'`), never as a reel.

## Goals

- A single video uploaded through the existing Create flow can be posted as a Reel.
- Reels get full field parity with posts: caption, location, audience/visibility,
  allow-comments, hide-like-count.
- No new modal, no new route — reuse the existing `CreatePostModal` and
  `POST /api/posts` endpoint.

## Non-goals

- Music picker UI, custom cover-frame selection, vertical-crop enforcement.
- Fixing other gaps found in the earlier dashboard audit (Tagged tab, message
  call buttons, story quick-react, highlights "+ New", OAuth login, Settings→Help
  stubs) — explicitly out of scope for this change.

## Frontend changes

### `frontend/src/components/post/CreatePostModal.jsx`

- New state: `postType` (`'post' | 'reel'`, default `'post'`).
- Derived: `isSingleVideo = files.length === 1 && files[0].type.startsWith('video/')`.
- In the **details** step, directly under the user row, render a segmented
  "Post | Reel" toggle — **only when `isSingleVideo` is true**. For photos or
  multi-file selections, the toggle is not rendered and `postType` stays `'post'`.
- Whenever `files` changes and `isSingleVideo` becomes false, reset `postType`
  to `'post'` (covers the case where a user goes back and picks different files).
- All other fields (caption, location, audience, allow-comments, hide-likes)
  are unchanged and apply to both post types.
- `handleShare` appends `fd.append('type', postType)` to the existing FormData
  before calling `postAPI.createPost(fd)`. No new API call is introduced.
- Accepts an optional `initialType` prop; when `'reel'` and the first selected
  file set satisfies `isSingleVideo`, `postType` defaults to `'reel'` instead
  of `'post'`. Otherwise ignored.

### `frontend/src/pages/main/CreatePage.jsx`

- Reads `location.state?.intent` (from `useLocation`) and passes it through to
  `CreatePostModal` as `initialType={location.state?.intent === 'reel' ? 'reel' : undefined}`.

### `frontend/src/pages/main/ReelsPage.jsx`

- Empty-state "Create a reel" button changes from `navigate('/create')` to
  `navigate('/create', { state: { intent: 'reel' } })`.

### `frontend/src/services/api.js`

- Remove the unused `reelAPI.createReel` export. `reelAPI` keeps only `getFeed`.

## Backend changes

### `backend/controllers/postController.js` (`createPost`)

- Destructure `type` from `req.body` alongside the existing fields.
- Before the Cloudinary upload loop, compute:
  ```js
  const isReelUpload = type === 'reel' && req.files?.length === 1 &&
    req.files[0].mimetype.startsWith('video/');
  ```
- Use `isReelUpload ? 'nexvibe/reels' : 'nexvibe/posts'` as the Cloudinary folder
  (preserves current folder organization for reel videos).
- Replace the existing `type: mediaFiles.length > 1 ? 'carousel' : 'post'` with:
  ```js
  type: isReelUpload ? 'reel' : (mediaFiles.length > 1 ? 'carousel' : 'post')
  ```
- The server re-derives `isReelUpload` itself from the actual uploaded files —
  it does not blindly trust a client-supplied `type: 'reel'` on a multi-file or
  non-video request; such requests silently fall back to `post`/`carousel`.
- No other logic in `createPost` changes: hashtag parsing, mention notifications,
  `location`, `allowComments`, `hideLikeCount` all already work unmodified and
  now apply to reels too.

### `backend/routes/reelRoutes.js`

- Remove the `POST /` (creation) handler entirely.
- Remove now-unused imports: `createPost`, `upload`, `fs`, `uploadToCloudinary`.
- Keep `GET /feed` unchanged.

## Error handling

- If `type: 'reel'` is sent with multiple files or a non-video file, the backend
  silently falls back to normal `post`/`carousel` type — no error surfaced, since
  the frontend toggle is already gated to prevent this from happening in practice.
- Existing error handling in `createPost` (try/catch → 500 with message) and in
  `CreatePostModal.handleShare` (toast on failure) is unchanged and covers reel
  submissions too.

## Compatibility note

- `POST /api/reels` (the old creation endpoint) is removed. Nothing in the
  codebase calls it after this change. If any external client called it
  directly, it will now 404 — acceptable since it was never reachable from the
  app UI.

## Testing

- Manual: upload a single video via the global "Create" button → toggle appears
  → select "Reel" → submit → verify it appears in `/reels` feed with correct
  caption/visibility, and does *not* appear in the regular `/feed`.
- Manual: upload a single video without touching the toggle → still saved as a
  normal post, appears in `/feed`, not in `/reels`.
- Manual: upload multiple files (including a video) → no toggle shown → saved
  as `carousel`, as before.
- Manual: from Reels empty-state "Create a reel" → select a single video →
  toggle defaults to "Reel".
