# Reports / Flagged-Content Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users report abusive posts and accounts with a reason, and give admins a grouped queue to dismiss reports or remove the content / ban the user.

**Architecture:** A new `Report` collection stores one document per (reporter, target) pair. A user-facing `POST /api/reports` creates reports (deduplicated, self-report blocked). Admin endpoints aggregate pending reports grouped by target so the queue shows one card per reported post/user regardless of how many people reported it, and a resolve endpoint reuses the exact field-level effects of the existing `deletePostAdmin`/`banUser` logic. The frontend adds a reason-picker modal reused for both "report this post" and "report this post's author" from the existing post options sheet, plus a new admin queue page and a dashboard stat card.

**Tech Stack:** React 18 + Vite (frontend), Express + Mongoose (backend). No test runner is configured in this repo — verification is manual (curl for backend, browser for frontend), matching prior features in this codebase.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-03-reports-flagged-content-queue-design.md` — follow it exactly.
- Reason enum (exact values, used in the model, both controllers, and the frontend modal): `spam`, `nudity`, `harassment`, `hate_speech`, `violence`, `false_info`, `other`.
- `GET /api/admin/reports` and `POST /api/admin/reports/resolve` both use the `isAdmin` middleware array (`authorize('admin', 'moderator')`) — confirmed against `backend/routes/adminRoutes.js:6,12-13,18`, where `banUser`/`unbanUser`/`deletePostAdmin` (the exact actions `resolve` wraps) all use this same level, not the stricter `adminOnly`.
- Non-goals (do not build): reporting comments/messages/stories, a profile-page options menu, auto-hide thresholds, warning notifications, reporter-facing status/appeals/analytics.
- This repo has no automated test suite (`backend/package.json` and `frontend/package.json` have no `test` script) — every task's verification step is manual/boot-check based.
- This is a normal git repo on `master` (not a worktree) as of this plan — commit directly to `master` per task unless told otherwise.
- A prior feature in this codebase found that this sandbox can read from the live MongoDB Atlas cluster but write operations hang indefinitely (network egress restriction, not a code issue). Do not attempt to create real documents against the live database from an automated task in this plan — Task 7 hands live verification to the human partner instead.

---

### Task 1: Backend — Report model + user-facing reporting endpoint

**Files:**
- Create: `backend/models/Report.js`
- Create: `backend/controllers/reportController.js`
- Create: `backend/routes/reportRoutes.js`
- Modify: `backend/server.js` (add import + mount, 2 lines)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the `Report` Mongoose model (used by Task 2 and Task 3), and `POST /api/reports` — body `{ targetType: 'post'|'user', targetId, reason, note? }`, `protect`-only (any logged-in user), returns `201 { success: true, message: 'Report submitted' }` or `400`/`404` on validation failure.

- [ ] **Step 1: Create `backend/models/Report.js`**

```js
import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  targetType: { type: String, enum: ['post', 'user'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },

  reason: {
    type: String,
    enum: ['spam', 'nudity', 'harassment', 'hate_speech', 'violence', 'false_info', 'other'],
    required: true
  },
  note: { type: String, maxlength: 500 },

  status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  resolution: { type: String, enum: ['dismissed', 'content_removed', 'user_banned'] },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date

}, { timestamps: true });

reportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ status: 1, targetType: 1, targetId: 1 });

const Report = mongoose.model('Report', reportSchema);
export default Report;
```

- [ ] **Step 2: Create `backend/controllers/reportController.js`**

```js
import Report from '../models/Report.js';
import Post from '../models/Post.js';
import User from '../models/User.js';

const REASONS = ['spam', 'nudity', 'harassment', 'hate_speech', 'violence', 'false_info', 'other'];

export const createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason, note } = req.body;

    if (!['post', 'user'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid targetType' });
    }
    if (!REASONS.includes(reason)) {
      return res.status(400).json({ success: false, message: 'Invalid reason' });
    }

    if (targetType === 'user') {
      if (targetId === req.user._id.toString()) {
        return res.status(400).json({ success: false, message: "You can't report yourself" });
      }
      const target = await User.findById(targetId);
      if (!target) return res.status(404).json({ success: false, message: 'User not found' });
    } else {
      const target = await Post.findById(targetId);
      if (!target) return res.status(404).json({ success: false, message: 'Post not found' });
      if (target.author.toString() === req.user._id.toString()) {
        return res.status(400).json({ success: false, message: "You can't report your own post" });
      }
    }

    const existing = await Report.findOne({ reporter: req.user._id, targetType, targetId });
    if (existing) {
      return res.status(400).json({ success: false, message: "You've already reported this" });
    }

    await Report.create({ reporter: req.user._id, targetType, targetId, reason, note });
    res.status(201).json({ success: true, message: 'Report submitted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 3: Create `backend/routes/reportRoutes.js`**

```js
import express from 'express';
import { createReport } from '../controllers/reportController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createReport);

export default router;
```

- [ ] **Step 4: Mount the route in `backend/server.js`**

Change:
```js
import reelRoutes from './routes/reelRoutes.js';
```
to:
```js
import reelRoutes from './routes/reelRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
```

Change:
```js
app.use('/api/reels', reelRoutes);
```
to:
```js
app.use('/api/reels', reelRoutes);
app.use('/api/reports', reportRoutes);
```

- [ ] **Step 5: Boot-check**

Run from `backend/`:
```bash
npm run dev
```
Expected: server starts on port 5000 with no new import/reference errors beyond the pre-existing Mongoose duplicate-index warnings. Stop it after confirming.

- [ ] **Step 6: Commit**

```bash
git add backend/models/Report.js backend/controllers/reportController.js backend/routes/reportRoutes.js backend/server.js
git commit -m "Add Report model and user-facing POST /api/reports endpoint"
```

---

### Task 2: Backend — admin reports endpoints (grouped list + resolve)

**Files:**
- Modify: `backend/controllers/adminController.js` (add `Report` import + two new exported functions)
- Modify: `backend/routes/adminRoutes.js` (add two routes)

**Interfaces:**
- Consumes: the `Report` model from Task 1.
- Produces: `GET /api/admin/reports?targetType=&page=&limit=` → `{ success, groups: [{ targetType, targetId, target, targetMissing, count, reasonCounts, reporters, firstReportedAt, lastReportedAt }], total, pages }`. `POST /api/admin/reports/resolve` — body `{ targetType, targetId, action: 'dismiss'|'remove' }` → `{ success: true }`. Task 5 (frontend admin page) calls both of these.

- [ ] **Step 1: Add the `Report` import to `backend/controllers/adminController.js`**

Change the top of the file from:
```js
import User from '../models/User.js';
import Post from '../models/Post.js';
import { Message } from '../models/Message.js';
import Notification from '../models/Notification.js';
import Story from '../models/Story.js';
```
to:
```js
import User from '../models/User.js';
import Post from '../models/Post.js';
import { Message } from '../models/Message.js';
import Notification from '../models/Notification.js';
import Story from '../models/Story.js';
import Report from '../models/Report.js';
```

- [ ] **Step 2: Append `getReports` and `resolveReport` to `backend/controllers/adminController.js`**

Add at the end of the file (after the last existing export):

```js
export const getReports = async (req, res) => {
  try {
    const { targetType, page = 1, limit = 20 } = req.query;
    const match = { status: 'pending', ...(targetType ? { targetType } : {}) };

    const groups = await Report.aggregate([
      { $match: match },
      { $group: {
          _id: { targetType: '$targetType', targetId: '$targetId' },
          count: { $sum: 1 },
          reasons: { $push: '$reason' },
          reporterIds: { $push: '$reporter' },
          firstReportedAt: { $min: '$createdAt' },
          lastReportedAt: { $max: '$createdAt' }
      } },
      { $sort: { lastReportedAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    ]);

    const totalResult = await Report.aggregate([
      { $match: match },
      { $group: { _id: { targetType: '$targetType', targetId: '$targetId' } } },
      { $count: 'total' }
    ]);
    const total = totalResult[0]?.total || 0;

    const results = await Promise.all(groups.map(async (g) => {
      const { targetType: gType, targetId } = g._id;
      let target = null;
      let targetMissing = false;

      if (gType === 'post') {
        target = await Post.findById(targetId).populate('author', 'username fullName avatar');
      } else {
        target = await User.findById(targetId).select('username fullName avatar isBanned');
      }
      if (!target) targetMissing = true;

      const reporters = await User.find({ _id: { $in: g.reporterIds.slice(0, 5) } }).select('username');
      const reasonCounts = g.reasons.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {});

      return {
        targetType: gType,
        targetId,
        target,
        targetMissing,
        count: g.count,
        reasonCounts,
        reporters,
        firstReportedAt: g.firstReportedAt,
        lastReportedAt: g.lastReportedAt
      };
    }));

    res.json({ success: true, groups: results, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const resolveReport = async (req, res) => {
  try {
    const { targetType, targetId, action } = req.body;
    if (!['post', 'user'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid targetType' });
    }
    if (!['dismiss', 'remove'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    let resolution = 'dismissed';

    if (action === 'remove') {
      if (targetType === 'post') {
        await Post.findByIdAndUpdate(targetId, { isDeleted: true });
        resolution = 'content_removed';
      } else {
        const user = await User.findById(targetId);
        if (user) {
          if (user.role === 'admin') {
            return res.status(403).json({ success: false, message: 'Cannot ban admin' });
          }
          user.isBanned = true;
          user.banReason = 'Multiple user reports';
          await user.save();
        }
        resolution = 'user_banned';
      }
    }

    await Report.updateMany(
      { targetType, targetId, status: 'pending' },
      { status: 'resolved', resolution, resolvedBy: req.user._id, resolvedAt: new Date() }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 3: Add the two routes to `backend/routes/adminRoutes.js`**

Change:
```js
router.post('/notifications/send', ...isAdmin, admin.sendSystemNotification);
export default router;
```
to:
```js
router.post('/notifications/send', ...isAdmin, admin.sendSystemNotification);
router.get('/reports', ...isAdmin, admin.getReports);
router.post('/reports/resolve', ...isAdmin, admin.resolveReport);
export default router;
```

- [ ] **Step 4: Boot-check**

Run from `backend/`: `npm run dev`, confirm clean boot (no import errors), stop it.

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/adminController.js backend/routes/adminRoutes.js
git commit -m "Add admin endpoints for grouped report listing and resolution"
```

---

### Task 3: Backend — dashboard "pending reports" stat

**Files:**
- Modify: `backend/controllers/adminController.js` (`getDashboardStats` function only)

**Interfaces:**
- Consumes: the `Report` model (already imported in this file by Task 2).
- Produces: `stats.pendingReports` (integer — count of distinct pending report *groups*, not raw report rows) in the `GET /api/admin/dashboard` response. Task 6 (frontend dashboard card) reads this field.

- [ ] **Step 1: Modify `getDashboardStats` in `backend/controllers/adminController.js`**

Change:
```js
export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers, activeUsers, bannedUsers,
      totalPosts, totalStories,
      newUsersToday, newPostsToday,
      verifiedUsers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isDeactivated: false, isBanned: false }),
      User.countDocuments({ isBanned: true }),
      Post.countDocuments({ isDeleted: false }),
      Story.countDocuments(),
      User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      Post.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      User.countDocuments({ isVerified: true })
    ]);
```
to:
```js
export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers, activeUsers, bannedUsers,
      totalPosts, totalStories,
      newUsersToday, newPostsToday,
      verifiedUsers, pendingReportsResult
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isDeactivated: false, isBanned: false }),
      User.countDocuments({ isBanned: true }),
      Post.countDocuments({ isDeleted: false }),
      Story.countDocuments(),
      User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      Post.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      User.countDocuments({ isVerified: true }),
      Report.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: { targetType: '$targetType', targetId: '$targetId' } } },
        { $count: 'total' }
      ])
    ]);
    const pendingReports = pendingReportsResult[0]?.total || 0;
```

Then change the response object from:
```js
    res.json({
      success: true,
      stats: { totalUsers, activeUsers, bannedUsers, totalPosts, totalStories, newUsersToday, newPostsToday, verifiedUsers },
      userGrowth,
      postGrowth
    });
```
to:
```js
    res.json({
      success: true,
      stats: { totalUsers, activeUsers, bannedUsers, totalPosts, totalStories, newUsersToday, newPostsToday, verifiedUsers, pendingReports },
      userGrowth,
      postGrowth
    });
```

- [ ] **Step 2: Boot-check**

Run from `backend/`: `npm run dev`, confirm clean boot, stop it.

- [ ] **Step 3: Commit**

```bash
git add backend/controllers/adminController.js
git commit -m "Add pendingReports count to admin dashboard stats"
```

---

### Task 4: Frontend — ReportModal + reportAPI + wire into PostOptionsMenu

**Files:**
- Create: `frontend/src/components/common/ReportModal.jsx`
- Modify: `frontend/src/services/api.js` (add `reportAPI`)
- Modify: `frontend/src/components/post/PostOptionsMenu.jsx`

**Interfaces:**
- Consumes: `POST /api/reports` (Task 1) via the new `reportAPI.createReport`.
- Produces: `ReportModal` component — props `{ targetType: 'post'|'user', targetId, label, onClose }` — used only by `PostOptionsMenu` in this task, but self-contained enough for any future caller.

- [ ] **Step 1: Add `reportAPI` to `frontend/src/services/api.js`**

Insert directly before the `// ADMIN` section comment:
```js
// REPORTS
export const reportAPI = {
  createReport: (data) => API.post('/reports', data),
};

// ADMIN
```

- [ ] **Step 2: Add `getReports`/`resolveReport` to the existing `adminAPI` object in `frontend/src/services/api.js`**

Change:
```js
export const adminAPI = {
  getDashboard: () => API.get('/admin/dashboard'),
  getUsers: (params) => API.get('/admin/users', { params }),
  getUser: (id) => API.get(`/admin/users/${id}`),
  banUser: (id, data) => API.post(`/admin/users/${id}/ban`, data),
  unbanUser: (id) => API.post(`/admin/users/${id}/unban`),
  verifyUser: (id) => API.post(`/admin/users/${id}/verify`),
  changeRole: (id, role) => API.put(`/admin/users/${id}/role`, { role }),
  deleteUser: (id) => API.delete(`/admin/users/${id}`),
  getPosts: (params) => API.get('/admin/posts', { params }),
  deletePost: (id) => API.delete(`/admin/posts/${id}`),
  sendNotification: (data) => API.post('/admin/notifications/send', data),
};
```
to:
```js
export const adminAPI = {
  getDashboard: () => API.get('/admin/dashboard'),
  getUsers: (params) => API.get('/admin/users', { params }),
  getUser: (id) => API.get(`/admin/users/${id}`),
  banUser: (id, data) => API.post(`/admin/users/${id}/ban`, data),
  unbanUser: (id) => API.post(`/admin/users/${id}/unban`),
  verifyUser: (id) => API.post(`/admin/users/${id}/verify`),
  changeRole: (id, role) => API.put(`/admin/users/${id}/role`, { role }),
  deleteUser: (id) => API.delete(`/admin/users/${id}`),
  getPosts: (params) => API.get('/admin/posts', { params }),
  deletePost: (id) => API.delete(`/admin/posts/${id}`),
  sendNotification: (data) => API.post('/admin/notifications/send', data),
  getReports: (params) => API.get('/admin/reports', { params }),
  resolveReport: (data) => API.post('/admin/reports/resolve', data),
};
```

- [ ] **Step 3: Create `frontend/src/components/common/ReportModal.jsx`**

```jsx
import { useState } from 'react';
import { reportAPI } from '../../services/api';
import toast from 'react-hot-toast';

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'violence', label: 'Violence' },
  { value: 'false_info', label: 'False information' },
  { value: 'other', label: 'Other' },
];

export default function ReportModal({ targetType, targetId, label, onClose }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await reportAPI.createReport({ targetType, targetId, reason, note: reason === 'other' ? note : undefined });
      toast.success('Report submitted. Thank you.');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute bottom-0 left-0 right-0 lg:relative lg:w-[400px] bg-[var(--bg-primary)] rounded-t-3xl lg:rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-sm">{label}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">Why are you reporting this?</p>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {REASONS.map(r => (
            <button key={r.value} onClick={() => setReason(r.value)}
              className={`w-full text-left px-5 py-3.5 text-sm border-b border-[var(--border)] transition-colors
                ${reason === r.value ? 'bg-[var(--bg-tertiary)] font-semibold' : 'hover:bg-[var(--bg-tertiary)]'}`}>
              {r.label}
            </button>
          ))}
          {reason === 'other' && (
            <div className="px-5 py-3">
              <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3}
                placeholder="Tell us more (optional)"
                className="w-full bg-[var(--bg-tertiary)] rounded-xl p-3 text-sm resize-none outline-none placeholder:text-[var(--text-muted)]" />
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4">
          <button onClick={onClose} className="flex-1 btn-outline py-2.5 rounded-xl text-sm font-semibold">Cancel</button>
          <button onClick={handleSubmit} disabled={!reason || submitting}
            className="flex-1 btn-brand py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `PostOptionsMenu.jsx` to open `ReportModal`**

Replace the entire file content with:
```jsx
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { postAPI, userAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import ReportModal from '../common/ReportModal';

export default function PostOptionsMenu({ post, onClose, onDelete, onUpdate }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwn = post.author?._id === user?._id || post.author === user?._id;
  const [reportTarget, setReportTarget] = useState(null); // null | 'post' | 'author'

  const actions = isOwn ? [
    {
      label: 'Delete', danger: true, onClick: async () => {
        if (!window.confirm('Delete this post? This cannot be undone.')) return;
        try { await postAPI.deletePost(post._id); toast.success('Post deleted'); onDelete?.(); }
        catch { toast.error('Failed to delete'); }
      }
    },
    {
      label: post.isArchived ? 'Unarchive' : 'Archive', onClick: async () => {
        try { const { data } = await postAPI.archivePost(post._id); onUpdate?.({ isArchived: data.isArchived }); toast.success(data.isArchived ? 'Archived' : 'Unarchived'); onClose(); }
        catch { toast.error('Failed'); }
      }
    },
    {
      label: post.isPinned ? 'Unpin from profile' : 'Pin to profile', onClick: async () => {
        try { await postAPI.pinPost(post._id); onUpdate?.({ isPinned: !post.isPinned }); toast.success(post.isPinned ? 'Unpinned' : 'Pinned to profile'); onClose(); }
        catch { toast.error('Failed'); }
      }
    },
    { label: 'Go to post', onClick: () => { navigate(`/p/${post._id}`); onClose(); } },
    {
      label: 'Copy link', onClick: () => {
        navigator.clipboard.writeText(`${window.location.origin}/p/${post._id}`);
        toast.success('Link copied!');
        onClose();
      }
    },
    { label: 'Cancel', onClick: onClose },
  ] : [
    { label: 'Report', danger: true, onClick: () => setReportTarget('post') },
    { label: `Report @${post.author?.username}`, danger: true, onClick: () => setReportTarget('author') },
    { label: 'Not interested', onClick: () => { onDelete?.(); onClose(); toast('Got it, we\'ll show you fewer posts like this'); } },
    {
      label: `Unfollow @${post.author?.username}`, danger: true, onClick: async () => {
        try { await userAPI.followUser(post.author?._id); toast.success(`Unfollowed @${post.author?.username}`); onClose(); }
        catch { toast.error('Failed'); }
      }
    },
    { label: 'Go to post', onClick: () => { navigate(`/p/${post._id}`); onClose(); } },
    {
      label: 'Copy link', onClick: () => {
        navigator.clipboard.writeText(`${window.location.origin}/p/${post._id}`);
        toast.success('Link copied!');
        onClose();
      }
    },
    { label: 'Cancel', onClick: onClose },
  ];

  if (reportTarget) {
    return (
      <ReportModal
        targetType={reportTarget === 'post' ? 'post' : 'user'}
        targetId={reportTarget === 'post' ? post._id : post.author?._id}
        label={reportTarget === 'post' ? 'Report this post' : `Report @${post.author?.username}`}
        onClose={() => { setReportTarget(null); onClose(); }}
      />
    );
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute bottom-0 left-0 right-0 lg:relative lg:w-[400px] bg-[var(--bg-primary)] rounded-t-3xl lg:rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
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

Key change from the original: the `isOwn` branch is byte-for-byte unchanged. The non-own `actions` array gains a second entry (`Report @username`) and the first entry's `onClick` now sets `reportTarget` instead of showing a toast. A new early return renders `ReportModal` in place of the action sheet when `reportTarget` is set — this swaps the sheet for the reason picker rather than stacking two overlays, and closing the modal (`onClose` prop) closes the whole `PostOptionsMenu` too (calls the parent's `onClose` after clearing local state), matching how every other action in this menu already closes the sheet after acting.

- [ ] **Step 5: Manual verification**

With both dev servers running (`backend`: `npm run dev`, `frontend`: `npm run dev`), log in as a user, open someone else's post, click the "···" options button:
1. Confirm both "Report" and `Report @<their-username>` appear.
2. Click "Report" → confirm the reason list replaces the sheet, "Submit" is disabled until a reason is picked, picking "Other" reveals the note textarea.
3. Pick "Spam", submit → confirm a success toast and the sheet closes.
4. Repeat on the same post → confirm the backend's "already reported" message surfaces as an error toast (this proves the dedup check works end-to-end).
5. Open the same post's menu again, click `Report @username`, submit with a different reason → confirm success (different targetType, not deduped against the post report).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/ReportModal.jsx frontend/src/services/api.js frontend/src/components/post/PostOptionsMenu.jsx
git commit -m "Add ReportModal and wire post/author reporting into PostOptionsMenu"
```

---

### Task 5: Frontend — Admin Reports queue page

**Files:**
- Create: `frontend/src/pages/admin/AdminReports.jsx`
- Modify: `frontend/src/App.jsx` (add route)
- Modify: `frontend/src/components/admin/AdminLayout.jsx` (add nav item)

**Interfaces:**
- Consumes: `adminAPI.getReports`/`adminAPI.resolveReport` (Task 4), backed by the Task 2 endpoints.
- Produces: the `/admin/reports` route, reachable from the admin sidebar.

- [ ] **Step 1: Create `frontend/src/pages/admin/AdminReports.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import toast from 'react-hot-toast';

const TABS = [
  { value: '', label: 'All' },
  { value: 'post', label: 'Posts' },
  { value: 'user', label: 'Users' },
];

export default function AdminReports() {
  const [groups, setGroups] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getReports({ page, limit: 20, ...(targetType ? { targetType } : {}) });
      setGroups(data.groups);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Failed to load reports'); }
    finally { setLoading(false); }
  }, [page, targetType]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (group, action) => {
    const verb = action === 'dismiss' ? 'Dismiss this report' : group.targetType === 'post' ? 'Remove this post' : 'Ban this user';
    if (!confirm(`${verb}?`)) return;
    try {
      await adminAPI.resolveReport({ targetType: group.targetType, targetId: group.targetId, action });
      setGroups(prev => prev.filter(g => !(g.targetType === group.targetType && g.targetId === group.targetId)));
      setTotal(t => t - 1);
      toast.success(action === 'dismiss' ? 'Dismissed' : 'Action taken');
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-[var(--text-secondary)] text-sm">{total.toLocaleString()} pending</p>
      </div>

      <div className="flex gap-2 mb-5">
        {TABS.map(t => (
          <button key={t.value} onClick={() => { setTargetType(t.value); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${targetType === t.value ? 'bg-pink-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="h-28 rounded-2xl shimmer" />)
        ) : groups.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">No pending reports 🎉</div>
        ) : (
          groups.map(g => (
            <div key={`${g.targetType}-${g.targetId}`} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-4">
              {g.targetMissing ? (
                <div className="flex-1 text-sm text-[var(--text-muted)]">This {g.targetType} no longer exists.</div>
              ) : g.targetType === 'post' ? (
                <>
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-[var(--bg-tertiary)] flex-shrink-0">
                    {g.target.media?.[0] && (
                      g.target.media[0].type === 'video'
                        ? <video src={g.target.media[0].url} className="w-full h-full object-cover" muted />
                        : <img src={g.target.media[0].url} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">@{g.target.author?.username}</p>
                    {g.target.caption && <p className="text-xs text-[var(--text-secondary)] truncate">{g.target.caption}</p>}
                  </div>
                </>
              ) : (
                <>
                  <Avatar src={g.target.avatar} size={44} alt={g.target.fullName} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">@{g.target.username}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{g.target.fullName}</p>
                  </div>
                </>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold mb-1">{g.count} report{g.count > 1 ? 's' : ''}</p>
                <div className="flex flex-wrap gap-1 mb-1">
                  {Object.entries(g.reasonCounts).map(([reason, count]) => (
                    <span key={reason} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                      {reason} ×{count}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {g.reporters.map(r => `@${r.username}`).join(', ')}{g.count > g.reporters.length ? ` +${g.count - g.reporters.length} more` : ''}
                </p>
              </div>

              <div className="flex flex-col gap-2 flex-shrink-0">
                {!g.targetMissing && (
                  <Link to={g.targetType === 'post' ? `/p/${g.targetId}` : `/${g.target.username}`} target="_blank"
                    className="text-xs text-center btn-outline px-3 py-1.5 rounded-lg">
                    {g.targetType === 'post' ? 'View Post' : 'View Profile'}
                  </Link>
                )}
                <button onClick={() => handleResolve(g, 'dismiss')} className="text-xs btn-outline px-3 py-1.5 rounded-lg">
                  Dismiss
                </button>
                {!g.targetMissing && (
                  <button onClick={() => handleResolve(g, 'remove')} className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
                    {g.targetType === 'post' ? 'Remove Post' : 'Ban User'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-[var(--text-muted)]">Page {page} of {pages} · {total} total</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">← Prev</button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route in `frontend/src/App.jsx`**

Add the import alongside the other admin page imports:
```js
import AdminPosts from './pages/admin/AdminPosts';
import AdminUserDetail from './pages/admin/AdminUserDetail';
```
becomes:
```js
import AdminPosts from './pages/admin/AdminPosts';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import AdminReports from './pages/admin/AdminReports';
```

Add the route:
```jsx
        <Route path="posts" element={<AdminPosts />} />
      </Route>
```
becomes:
```jsx
        <Route path="posts" element={<AdminPosts />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>
```

- [ ] **Step 3: Add the nav item in `frontend/src/components/admin/AdminLayout.jsx`**

Change the icon import:
```js
import { FiUsers, FiFileText, FiBarChart2, FiArrowLeft, FiSun, FiMoon, FiLogOut } from 'react-icons/fi';
```
to:
```js
import { FiUsers, FiFileText, FiBarChart2, FiArrowLeft, FiSun, FiMoon, FiLogOut, FiFlag } from 'react-icons/fi';
```

Change the nav array:
```js
  const navItems = [
    { to: '/admin', label: 'Dashboard', Icon: FiBarChart2, end: true },
    { to: '/admin/users', label: 'Users', Icon: FiUsers },
    { to: '/admin/posts', label: 'Posts', Icon: FiFileText },
  ];
```
to:
```js
  const navItems = [
    { to: '/admin', label: 'Dashboard', Icon: FiBarChart2, end: true },
    { to: '/admin/users', label: 'Users', Icon: FiUsers },
    { to: '/admin/posts', label: 'Posts', Icon: FiFileText },
    { to: '/admin/reports', label: 'Reports', Icon: FiFlag },
  ];
```

- [ ] **Step 4: Manual verification**

With both dev servers running and reports created from Task 4's verification still pending in the database, log in as an admin/moderator and go to `/admin/reports`:
1. Confirm the "Reports" nav item appears and is reachable.
2. Confirm the pending post-report and user-report from Task 4 both show up as separate grouped cards with correct counts, reason pills, and reporter usernames.
3. Click the "Posts" tab → confirm only the post-report card shows; "Users" tab → only the user-report card.
4. Click "Dismiss" on one card → confirm it disappears and a toast confirms.
5. Click "Remove Post" (or "Ban User") on the other → confirm it disappears, and separately confirm (via `/feed` or `/admin/users`) that the underlying post is gone from the feed / the user is banned.
6. With both resolved, confirm the empty state ("No pending reports 🎉") appears.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/AdminReports.jsx frontend/src/App.jsx frontend/src/components/admin/AdminLayout.jsx
git commit -m "Add admin Reports queue page, route, and nav item"
```

---

### Task 6: Frontend — dashboard "Pending Reports" stat card

**Files:**
- Modify: `frontend/src/pages/admin/AdminDashboard.jsx`

**Interfaces:**
- Consumes: `stats.stats.pendingReports` from `adminAPI.getDashboard()` (Task 3's backend addition).
- Produces: nothing consumed by later tasks — this is the last piece of frontend wiring.

- [ ] **Step 1: Add the `Link` import**

Change:
```jsx
import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
```
to:
```jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
```

- [ ] **Step 2: Update the loading skeleton count**

Change:
```jsx
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array(8).fill(0).map((_, i) => <div key={i} className="h-28 rounded-2xl shimmer" />)}
      </div>
```
to:
```jsx
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array(9).fill(0).map((_, i) => <div key={i} className="h-28 rounded-2xl shimmer" />)}
      </div>
```

- [ ] **Step 3: Add the 9th card to the `cards` array**

Change:
```jsx
  const cards = [
    { label: 'Total Users', value: stats?.stats.totalUsers?.toLocaleString() || 0, icon: '👥', color: 'from-blue-500 to-blue-600', change: `+${stats?.stats.newUsersToday} today` },
    { label: 'Active Users', value: stats?.stats.activeUsers?.toLocaleString() || 0, icon: '✅', color: 'from-green-500 to-green-600', change: 'Currently active' },
    { label: 'Total Posts', value: stats?.stats.totalPosts?.toLocaleString() || 0, icon: '📸', color: 'from-pink-500 to-pink-600', change: `+${stats?.stats.newPostsToday} today` },
    { label: 'Verified Users', value: stats?.stats.verifiedUsers?.toLocaleString() || 0, icon: '☑️', color: 'from-purple-500 to-purple-600', change: 'Verified accounts' },
    { label: 'Total Stories', value: stats?.stats.totalStories?.toLocaleString() || 0, icon: '🔵', color: 'from-orange-500 to-orange-600', change: 'Active stories' },
    { label: 'Banned Users', value: stats?.stats.bannedUsers?.toLocaleString() || 0, icon: '🚫', color: 'from-red-500 to-red-600', change: 'Need review' },
    { label: 'New Today', value: stats?.stats.newUsersToday?.toLocaleString() || 0, icon: '🆕', color: 'from-teal-500 to-teal-600', change: 'Registered today' },
    { label: 'Posts Today', value: stats?.stats.newPostsToday?.toLocaleString() || 0, icon: '📝', color: 'from-indigo-500 to-indigo-600', change: 'Created today' },
  ];
```
to:
```jsx
  const cards = [
    { label: 'Total Users', value: stats?.stats.totalUsers?.toLocaleString() || 0, icon: '👥', color: 'from-blue-500 to-blue-600', change: `+${stats?.stats.newUsersToday} today` },
    { label: 'Active Users', value: stats?.stats.activeUsers?.toLocaleString() || 0, icon: '✅', color: 'from-green-500 to-green-600', change: 'Currently active' },
    { label: 'Total Posts', value: stats?.stats.totalPosts?.toLocaleString() || 0, icon: '📸', color: 'from-pink-500 to-pink-600', change: `+${stats?.stats.newPostsToday} today` },
    { label: 'Verified Users', value: stats?.stats.verifiedUsers?.toLocaleString() || 0, icon: '☑️', color: 'from-purple-500 to-purple-600', change: 'Verified accounts' },
    { label: 'Total Stories', value: stats?.stats.totalStories?.toLocaleString() || 0, icon: '🔵', color: 'from-orange-500 to-orange-600', change: 'Active stories' },
    { label: 'Banned Users', value: stats?.stats.bannedUsers?.toLocaleString() || 0, icon: '🚫', color: 'from-red-500 to-red-600', change: 'Need review' },
    { label: 'New Today', value: stats?.stats.newUsersToday?.toLocaleString() || 0, icon: '🆕', color: 'from-teal-500 to-teal-600', change: 'Registered today' },
    { label: 'Posts Today', value: stats?.stats.newPostsToday?.toLocaleString() || 0, icon: '📝', color: 'from-indigo-500 to-indigo-600', change: 'Created today' },
    { label: 'Pending Reports', value: stats?.stats.pendingReports?.toLocaleString() || 0, icon: '🚩', color: 'from-red-500 to-red-600', change: 'Needs review', link: '/admin/reports' },
  ];
```

- [ ] **Step 4: Wrap linkable cards**

Change the card-rendering map:
```jsx
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card, i) => (
          <div key={i} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <span className={`text-xs font-medium bg-gradient-to-r ${card.color} bg-clip-text text-transparent`}>
                {card.change}
              </span>
            </div>
            <p className="text-2xl font-bold mb-1">{card.value}</p>
            <p className="text-xs text-[var(--text-muted)]">{card.label}</p>
          </div>
        ))}
      </div>
```
to:
```jsx
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card, i) => {
          const cardBody = (
            <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-5 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{card.icon}</span>
                <span className={`text-xs font-medium bg-gradient-to-r ${card.color} bg-clip-text text-transparent`}>
                  {card.change}
                </span>
              </div>
              <p className="text-2xl font-bold mb-1">{card.value}</p>
              <p className="text-xs text-[var(--text-muted)]">{card.label}</p>
            </div>
          );
          return card.link
            ? <Link key={i} to={card.link}>{cardBody}</Link>
            : <div key={i}>{cardBody}</div>;
        })}
      </div>
```

- [ ] **Step 5: Manual verification**

With reports resolved/pending from Task 5's verification, load `/admin` (the dashboard):
1. Confirm 9 cards render (grid doesn't visually break with an odd count on the `lg:grid-cols-4` layout — 9 wraps to a 3rd row with 1 card, which is expected and fine).
2. Confirm "Pending Reports" shows the correct count.
3. Click the card → confirm it navigates to `/admin/reports`.
4. Confirm none of the other 8 cards became clickable/changed appearance.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/AdminDashboard.jsx
git commit -m "Add clickable Pending Reports stat card to admin dashboard"
```

---

### Task 7: End-to-end verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: the complete feature from Tasks 1-6.
- Produces: confirmation the full reporting → admin-resolution pipeline works, matching the spec's Testing section.

Note: a prior feature in this codebase found this sandbox can read from the live MongoDB Atlas cluster but not write to it (writes hang indefinitely — a network egress restriction, not a code problem). Do not attempt automated database writes here. This task is a boot-check plus a handoff of the real click-through to the human partner.

- [ ] **Step 1: Backend boot-check**

Run from `backend/`: `npm run dev`. Confirm the server boots cleanly with all new routes mounted (no import errors from `Report.js`, `reportController.js`, `reportRoutes.js`, or the `adminController.js`/`adminRoutes.js` additions). Stop it.

- [ ] **Step 2: Frontend boot-check**

Run from `frontend/`: `npm run dev`. Confirm Vite starts with no build errors (a JSX syntax mistake in `ReportModal.jsx`, `PostOptionsMenu.jsx`, `AdminReports.jsx`, `AdminLayout.jsx`, or `AdminDashboard.jsx` would surface here). Stop it.

- [ ] **Step 3: Report the full manual test plan to the human partner**

Present this checklist for them to run in their own environment (real Atlas data, real login):
1. Report a post (not your own) with reason "Spam" → toast success.
2. Report the same post again as the same user → error toast "You've already reported this."
3. Report the post's author via "Report @username" with a different reason → success.
4. As admin, open `/admin/reports` → confirm the post group shows count 1, the user group shows count 1, with correct reasons and reporter username.
5. Dismiss the user-report group → confirm it disappears from the queue and the user is NOT banned.
6. Remove the post group → confirm the post disappears from `/feed` and the report is resolved.
7. Confirm the dashboard's "Pending Reports" card count reflects the remaining pending groups and links to `/admin/reports`.
8. Try `POST /api/reports` on your own post directly (e.g. via curl/Postman) → confirm 400, not a silent success.

- [ ] **Step 4: Checkpoint**

Feature complete pending the human partner's manual pass from Step 3.
