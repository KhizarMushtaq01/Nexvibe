# Reel Creation Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user post a single uploaded video as a Reel (not just a normal feed post) through the existing Create flow, with full field parity (caption, location, visibility, allow-comments, hide-like-count).

**Architecture:** Reuse the existing `POST /api/posts` endpoint and `CreatePostModal` component. The backend derives `type: 'reel'` from a client-supplied `type` field, but only honors it when exactly one video file was actually uploaded — it never trusts the client blindly. The frontend shows a "Post | Reel" toggle only when a single video is selected, and sends `type` in the same FormData it already sends. The old, disconnected `POST /api/reels` creation endpoint and `reelAPI.createReel` are deleted as dead code.

**Tech Stack:** React 18 + Vite (frontend), Express + Mongoose + Multer + Cloudinary (backend). No test runner is configured in this repo (`backend/package.json` and `frontend/package.json` have no `test` script) — verification in this plan is manual (curl for backend, browser for frontend), matching the existing codebase's testing approach.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-reel-creation-flow-design.md` — follow it exactly; this plan implements it task-by-task.
- This directory is **not a git repository** (`git status` fails with "not a git repository"). Steps below use a "Checkpoint" instead of a `git commit` step. If the user later runs `git init`, these checkpoints mark good commit boundaries.
- Do not touch: Tagged tab, message call buttons, story quick-react, highlights "+ New", OAuth login, Settings→Help stubs — explicitly out of scope (spec Non-goals).
- Cloudinary folder naming: reel videos go to `nexvibe/reels`, everything else stays in `nexvibe/posts` (matches current pre-change behavior for non-reel uploads).

---

### Task 1: Backend — unified reel type in `createPost`, remove duplicate reel creation route

**Files:**
- Modify: `backend/controllers/postController.js` (the `createPost` function, currently lines 9–70)
- Modify: `backend/routes/reelRoutes.js` (remove the `POST /` handler and its now-unused imports)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `POST /api/posts` now accepts an optional `type` form field. When `type === 'reel'` AND exactly one file was uploaded AND that file is a video, the created `Post` document has `type: 'reel'` (instead of `'post'`/`'carousel'`) and its video is uploaded to the Cloudinary folder `nexvibe/reels`. This is what Task 3's frontend change will call into.

- [ ] **Step 1: Modify `createPost` in `backend/controllers/postController.js`**

Replace the function body (lines 9–70) with:

```js
export const createPost = async (req, res) => {
  try {
    const { caption, location, visibility, allowComments, hideLikeCount, tags, altText, type } = req.body;
    const hashtags = caption ? (caption.match(/#\w+/g) || []).map(h => h.toLowerCase()) : [];
    const mentions = caption ? (caption.match(/@\w+/g) || []) : [];

    const isReelUpload = type === 'reel' && req.files?.length === 1 && req.files[0].mimetype.startsWith('video/');

    const mediaFiles = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const isVideo = file.mimetype.startsWith('video/');
        const result = await uploadToCloudinary(file.path, isReelUpload ? 'nexvibe/reels' : 'nexvibe/posts', {
          resource_type: isVideo ? 'video' : 'image',
          ...(isVideo ? {} : { transformation: [{ quality: 'auto', fetch_format: 'auto' }] })
        });
        mediaFiles.push({
          url: result.secure_url,
          publicId: result.public_id,
          type: isVideo ? 'video' : 'image',
          width: result.width,
          height: result.height,
          duration: result.duration || null,
          thumbnail: isVideo ? result.thumbnail_url : result.secure_url
        });
        fs.unlinkSync(file.path);
      }
    }

    const post = await Post.create({
      author: req.user._id,
      caption,
      media: mediaFiles,
      hashtags,
      location: location ? JSON.parse(location) : undefined,
      visibility: visibility || 'public',
      allowComments: allowComments !== 'false',
      hideLikeCount: hideLikeCount === 'true',
      altText,
      type: isReelUpload ? 'reel' : (mediaFiles.length > 1 ? 'carousel' : 'post')
    });

    await Post.findById(post._id).populate('author', 'username fullName avatar isVerified');
    await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: 1 } });

    // Notify mentioned users
    for (const mention of mentions) {
      const mentionedUser = await User.findOne({ username: mention.slice(1) });
      if (mentionedUser && mentionedUser._id.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: mentionedUser._id,
          sender: req.user._id,
          type: 'mention',
          post: post._id,
          text: `${req.user.fullName} mentioned you in a post`
        });
      }
    }

    const populated = await Post.findById(post._id).populate('author', 'username fullName avatar isVerified');
    res.status(201).json({ success: true, message: 'Post created', post: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

Only two lines changed from the original: the destructure now includes `type`, a new `isReelUpload` const is computed before the upload loop, the Cloudinary folder argument is now conditional, and the `type:` field passed to `Post.create` uses `isReelUpload` first. Everything else is byte-for-byte identical to the current file.

- [ ] **Step 2: Replace `backend/routes/reelRoutes.js` with the feed-only version**

```js
import express from 'express';
import Post from '../models/Post.js';
import { protect } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

const router = express.Router();

// Get reels feed
router.get('/feed', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const currentUser = await User.findById(req.user._id);
    const feedUserIds = [req.user._id, ...currentUser.following];

    const reels = await Post.find({
      type: 'reel',
      isDeleted: false,
      $or: [
        { author: { $in: feedUserIds } },
        { visibility: 'public' }
      ]
    })
      .populate('author', 'username fullName avatar isVerified')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, reels, hasMore: reels.length === parseInt(limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
```

This drops the `POST /` handler and the now-unused `upload`, `fs`, `uploadToCloudinary`, `createPost` imports, plus the pre-existing unused `optionalAuth` import.

- [ ] **Step 3: Start the backend and verify it boots cleanly**

Run from `backend/`:
```bash
npm run dev
```
Expected: server starts on port 5000 with no import/reference errors (a leftover reference to the deleted `createPost` import or `upload` in `reelRoutes.js` would throw immediately on boot). Leave it running for Step 4.

- [ ] **Step 4: Manually verify the new `type` field with curl**

Log in first to get a JWT (replace `<EMAIL>`/`<PASSWORD>` with a real test account), then use the token below. From a shell with a small video file at `./test.mp4`:

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<EMAIL>","password":"<PASSWORD>"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -s -X POST http://localhost:5000/api/posts \
  -H "Authorization: Bearer $TOKEN" \
  -F "media=@./test.mp4" \
  -F "caption=test reel" \
  -F "type=reel" | node -pe 'JSON.parse(require("fs").readFileSync(0)).post.type'
```
Expected output: `reel`

Then confirm a normal post is unaffected:
```bash
curl -s -X POST http://localhost:5000/api/posts \
  -H "Authorization: Bearer $TOKEN" \
  -F "media=@./test.mp4" \
  -F "caption=test normal video post" | node -pe 'JSON.parse(require("fs").readFileSync(0)).post.type'
```
Expected output: `post`

- [ ] **Step 5: Checkpoint**

Backend change verified working. Note the two files touched (`backend/controllers/postController.js`, `backend/routes/reelRoutes.js`) as a clean commit boundary if git is initialized later.

---

### Task 2: Frontend — remove dead `reelAPI.createReel`

**Files:**
- Modify: `frontend/src/services/api.js` (the `reelAPI` export, currently around lines 150–153)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new; this only deletes an unused export. No other task depends on `reelAPI.createReel` existing (Task 3 posts through `postAPI.createPost`, which already exists).

- [ ] **Step 1: Edit `reelAPI` in `frontend/src/services/api.js`**

Replace:
```js
export const reelAPI = {
  getFeed: (page = 1) => API.get(`/reels/feed?page=${page}`),
  createReel: (formData) => API.post('/reels', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};
```
with:
```js
export const reelAPI = {
  getFeed: (page = 1) => API.get(`/reels/feed?page=${page}`),
};
```

- [ ] **Step 2: Confirm nothing else references `createReel`**

Run from the repo root:
```bash
grep -rn "createReel" frontend/src
```
Expected: no output (the only prior usage was the export itself, which is now gone).

- [ ] **Step 3: Checkpoint**

Single-file cleanup verified. Commit boundary: `frontend/src/services/api.js`.

---

### Task 3: Frontend — Post/Reel toggle in `CreatePostModal`

**Files:**
- Modify: `frontend/src/components/post/CreatePostModal.jsx`

**Interfaces:**
- Consumes: `postAPI.createPost(fd)` (unchanged signature, already imported in this file). Backend behavior from Task 1 (`type: 'reel'` field on the FormData).
- Produces: `CreatePostModal` now accepts an optional `initialType` prop (`'reel' | undefined`). Task 4 passes this prop in from `CreatePage`.

- [ ] **Step 1: Update the component signature and add `postType` state**

In `frontend/src/components/post/CreatePostModal.jsx`, change:
```js
export default function CreatePostModal({ onClose }) {
  const { user } = useAuth();
  const [step, setStep] = useState('select'); // select | edit | details
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [allowComments, setAllowComments] = useState(true);
  const [hideLikes, setHideLikes] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
```
to:
```js
export default function CreatePostModal({ onClose, initialType }) {
  const { user } = useAuth();
  const [step, setStep] = useState('select'); // select | edit | details
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [allowComments, setAllowComments] = useState(true);
  const [hideLikes, setHideLikes] = useState(false);
  const [postType, setPostType] = useState('post');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const isSingleVideo = files.length === 1 && files[0]?.type?.startsWith('video/');
```

- [ ] **Step 2: Set `postType` when files are selected, in `handleFiles`**

Change:
```js
  const handleFiles = useCallback(accepted => {
    if (!accepted.length) return;
    const validFiles = Array.from(accepted).filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/')
    ).slice(0, 10);
    if (!validFiles.length) { toast.error('Only images and videos allowed'); return; }
    setFiles(validFiles);
    setPreviews(validFiles.map(f => ({ url: URL.createObjectURL(f), type: f.type.startsWith('video') ? 'video' : 'image', name: f.name })));
    setStep('edit');
  }, []);
```
to:
```js
  const handleFiles = useCallback(accepted => {
    if (!accepted.length) return;
    const validFiles = Array.from(accepted).filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/')
    ).slice(0, 10);
    if (!validFiles.length) { toast.error('Only images and videos allowed'); return; }
    setFiles(validFiles);
    setPreviews(validFiles.map(f => ({ url: URL.createObjectURL(f), type: f.type.startsWith('video') ? 'video' : 'image', name: f.name })));
    const singleVideo = validFiles.length === 1 && validFiles[0].type.startsWith('video/');
    setPostType(singleVideo && initialType === 'reel' ? 'reel' : 'post');
    setStep('edit');
  }, [initialType]);
```

This is the only place `files` is ever set, so it's the single source of truth for keeping `postType` in sync: picking a photo, multiple files, or going back and re-picking always resets `postType` to `'post'` unless the new selection is a single video and the modal was opened with reel intent.

- [ ] **Step 3: Send `type` in the FormData, in `handleShare`**

Change:
```js
      const fd = new FormData();
      files.forEach(f => fd.append('media', f));
      fd.append('caption', caption);
      fd.append('visibility', visibility);
      fd.append('allowComments', String(allowComments));
      fd.append('hideLikeCount', String(hideLikes));
      if (location) fd.append('location', JSON.stringify({ name: location }));
```
to:
```js
      const fd = new FormData();
      files.forEach(f => fd.append('media', f));
      fd.append('caption', caption);
      fd.append('visibility', visibility);
      fd.append('allowComments', String(allowComments));
      fd.append('hideLikeCount', String(hideLikes));
      fd.append('type', postType);
      if (location) fd.append('location', JSON.stringify({ name: location }));
```

- [ ] **Step 4: Render the Post/Reel toggle in the details step**

In the `details` step JSX, directly below the "User" block and above the "Caption" block, change:
```jsx
              {/* User */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
                <Avatar src={user?.avatar} size={30} alt={user?.fullName} />
                <span className="font-semibold text-sm">{user?.username}</span>
              </div>

              {/* Caption */}
```
to:
```jsx
              {/* User */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
                <Avatar src={user?.avatar} size={30} alt={user?.fullName} />
                <span className="font-semibold text-sm">{user?.username}</span>
              </div>

              {/* Post / Reel toggle */}
              {isSingleVideo && (
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
                  <button type="button" onClick={() => setPostType('post')}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${postType === 'post' ? 'bg-blue-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                    Post
                  </button>
                  <button type="button" onClick={() => setPostType('reel')}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${postType === 'reel' ? 'bg-blue-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
                    Reel
                  </button>
                </div>
              )}

              {/* Caption */}
```

- [ ] **Step 5: Manually verify in the browser**

With backend running (`backend/`: `npm run dev`) and frontend running (`frontend/`: `npm run dev`), log in, click the global "Create" button:

1. Select a single video file → in the details step, confirm the "Post | Reel" toggle appears, defaulting to "Post" highlighted.
2. Select a single photo instead (go back, pick a `.jpg`) → confirm the toggle does NOT appear.
3. Select two files (photo + video, or two videos) → confirm the toggle does NOT appear.
4. Go back and re-select a single video, click "Reel" in the toggle, fill a caption, click Share → confirm no console errors and the modal closes.

- [ ] **Step 6: Checkpoint**

`CreatePostModal.jsx` toggle behavior verified in-browser for all 4 cases above. Commit boundary: `frontend/src/components/post/CreatePostModal.jsx`.

---

### Task 4: Frontend — wire "Create a reel" intent through `CreatePage` and `ReelsPage`

**Files:**
- Modify: `frontend/src/pages/main/CreatePage.jsx`
- Modify: `frontend/src/pages/main/ReelsPage.jsx`

**Interfaces:**
- Consumes: `CreatePostModal`'s `initialType` prop (produced in Task 3).
- Produces: nothing further downstream — this is the last piece of the frontend wiring.

- [ ] **Step 1: Update `frontend/src/pages/main/CreatePage.jsx`**

Replace the whole file:
```jsx
import { useNavigate, useLocation } from 'react-router-dom';
import CreatePostModal from '../../components/post/CreatePostModal';

export default function CreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <CreatePostModal
      onClose={() => navigate(-1)}
      initialType={location.state?.intent === 'reel' ? 'reel' : undefined}
    />
  );
}
```

(This also drops the pre-existing unused `useEffect` import from the original file.)

- [ ] **Step 2: Update the "Create a reel" button in `frontend/src/pages/main/ReelsPage.jsx`**

Change:
```jsx
      <button onClick={() => navigate('/create')} className="btn-brand px-6 py-2.5 rounded-xl">
        Create a reel
      </button>
```
to:
```jsx
      <button onClick={() => navigate('/create', { state: { intent: 'reel' } })} className="btn-brand px-6 py-2.5 rounded-xl">
        Create a reel
      </button>
```

- [ ] **Step 3: Manually verify in the browser**

1. Go to `/reels` with an account that follows no one with reels yet (or temporarily view as a fresh account) so the empty state shows.
2. Click "Create a reel" → the Create modal opens → select a single video file.
3. Confirm the "Post | Reel" toggle appears **already set to "Reel"** (not "Post").
4. As a control, click the global "Create" button from the navbar directly (not through the empty-reels-page link) and select a single video → confirm the toggle appears defaulted to "Post" this time.

- [ ] **Step 4: Checkpoint**

Intent-passing verified for both entry points. Commit boundary: `frontend/src/pages/main/CreatePage.jsx`, `frontend/src/pages/main/ReelsPage.jsx`.

---

### Task 5: End-to-end verification

**Files:** none (verification only, no code changes).

**Interfaces:**
- Consumes: the complete feature from Tasks 1–4.
- Produces: confirmation the feature works end-to-end, matching the spec's Testing section.

- [ ] **Step 1: Full reel flow**

With both dev servers running, log in, click "Create", select one video, toggle to "Reel", add a caption, submit.
Expected: toast "Post shared!", modal closes, page reloads.
Navigate to `/reels` → the new reel appears at the top of the feed with the correct caption.
Navigate to `/feed` → the new reel does **not** appear there.

- [ ] **Step 2: Full normal single-video post flow**

Click "Create", select one video, leave the toggle on "Post" (or don't touch it), submit.
Navigate to `/feed` → the post appears there with a working video player.
Navigate to `/reels` → it does **not** appear there.

- [ ] **Step 3: Carousel unaffected**

Click "Create", select 2+ files (mix of photos/videos), submit (no toggle should have appeared).
Navigate to `/feed` → the carousel post appears and paginates through all selected media correctly, exactly as it did before this change.

- [ ] **Step 4: Photo-only post unaffected**

Click "Create", select a single photo, submit (no toggle should have appeared).
Navigate to `/feed` → confirm the photo post appears normally.

- [ ] **Step 5: Checkpoint**

All four flows confirmed working with no regressions. Feature complete.
