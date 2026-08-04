# Resolved Reports History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins view a history of resolved report groups (dismissed / content removed / user banned) on the existing `/admin/reports` page, alongside the current pending queue.

**Architecture:** Extend the existing `GET /api/admin/reports` aggregation to group by `(targetType, targetId, resolvedAt)` instead of `(targetType, targetId)`, and accept `status`/`resolution` query params. Extend `AdminReports.jsx` with a Pending/Resolved tab and, when Resolved, a resolution-type filter row; resolved cards show an outcome badge instead of action buttons.

**Tech Stack:** Node/Express/Mongoose backend, React frontend, no automated test framework in this repo — verification is manual (curl/Node scripts against a running dev server), consistent with the rest of the codebase.

## Global Constraints

- No new dependencies. `date-fns` is already a frontend dependency (used in `AdminUsers.jsx`) — reuse `formatDistanceToNow` for relative timestamps.
- No schema change to `backend/models/Report.js` — `status`, `resolution`, `resolvedBy`, `resolvedAt` already exist.
- No change to `resolveReport` or the dashboard `pendingReports` stat — both already correct and out of scope (spec non-goals).
- Follow the existing try/catch → `res.status(500).json({ success:false, message: error.message })` error pattern already in `adminController.js`, including the `CastError → 400` handling already present in `getReports`.

---

### Task 1: Backend — resolved-history support in `GET /api/admin/reports`

**Files:**
- Modify: `backend/controllers/adminController.js:213-276` (the `getReports` function)
- Test: `backend/_verify_reports_history.mjs` (temporary manual-verification script, deleted at the end of this task — not committed)

**Interfaces:**
- Consumes: `Report` model (`backend/models/Report.js`) — no changes needed, all fields already exist. `Post`, `User` models already imported in `adminController.js`.
- Produces: `GET /api/admin/reports` now accepts query params `targetType` (unchanged), `page`/`limit` (unchanged), plus new `status` (`'pending' | 'resolved'`, default `'pending'`) and `resolution` (`'dismissed' | 'content_removed' | 'user_banned'`, only applied when `status === 'resolved'`). Each object in the response's `groups[]` array gains three fields: `resolution` (string or `undefined` for pending groups), `resolvedAt` (ISO date string or `undefined`), `resolvedByUser` (`{ username: string } | null`). All existing fields (`targetType`, `targetId`, `target`, `targetMissing`, `count`, `reasonCounts`, `reporters`, `notes`, `firstReportedAt`, `lastReportedAt`) are unchanged in shape.

- [ ] **Step 1: Replace the `getReports` function body**

Replace lines 213-276 of `backend/controllers/adminController.js` (from `export const getReports = async (req, res) => {` through the closing `};` right before the `resolveReport` export) with:

```js
export const getReports = async (req, res) => {
  try {
    const { targetType, status = 'pending', resolution, page = 1, limit = 20 } = req.query;
    const match = {
      status,
      ...(targetType ? { targetType } : {}),
      ...(status === 'resolved' && resolution ? { resolution } : {})
    };
    const groupId = { targetType: '$targetType', targetId: '$targetId', resolvedAt: '$resolvedAt' };

    const groups = await Report.aggregate([
      { $match: match },
      { $group: {
          _id: groupId,
          count: { $sum: 1 },
          reasons: { $push: '$reason' },
          reporterIds: { $push: '$reporter' },
          notes: { $push: '$note' },
          firstReportedAt: { $min: '$createdAt' },
          lastReportedAt: { $max: '$createdAt' },
          resolution: { $first: '$resolution' },
          resolvedBy: { $first: '$resolvedBy' }
      } },
      { $sort: status === 'resolved' ? { '_id.resolvedAt': -1 } : { lastReportedAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    ]);

    const totalResult = await Report.aggregate([
      { $match: match },
      { $group: { _id: groupId } },
      { $count: 'total' }
    ]);
    const total = totalResult[0]?.total || 0;

    const results = await Promise.all(groups.map(async (g) => {
      const { targetType: gType, targetId, resolvedAt } = g._id;
      let target = null;
      let targetMissing = false;

      if (gType === 'post') {
        target = await Post.findById(targetId).populate('author', 'username fullName avatar');
        if (target?.isDeleted) target = null;
      } else {
        target = await User.findById(targetId).select('username fullName avatar isBanned');
      }
      if (!target) targetMissing = true;

      const reporters = await User.find({ _id: { $in: g.reporterIds.slice(0, 5) } }).select('username');
      const reasonCounts = g.reasons.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {});
      const notes = (g.notes || []).filter(Boolean);
      const resolvedByUser = g.resolvedBy ? await User.findById(g.resolvedBy).select('username') : null;

      return {
        targetType: gType,
        targetId,
        target,
        targetMissing,
        count: g.count,
        reasonCounts,
        reporters,
        notes,
        firstReportedAt: g.firstReportedAt,
        lastReportedAt: g.lastReportedAt,
        resolution: g.resolution,
        resolvedAt,
        resolvedByUser: resolvedByUser ? { username: resolvedByUser.username } : null
      };
    }));

    res.json({ success: true, groups: results, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check backend/controllers/adminController.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Start the backend dev server**

Run (in `backend/`, in a separate terminal/background process): `npm run dev`
Expected: log line `🚀 NexVibe Server running on port 5000` and `MongoDB Connected: ...`.

- [ ] **Step 4: Write the verification script**

Create `backend/_verify_reports_history.mjs`:

```js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;

const { default: User } = await import('./models/User.js');
const { default: Post } = await import('./models/Post.js');
const { default: Report } = await import('./models/Report.js');
const { generateToken } = await import('./utils/auth.js');

await mongoose.connect(process.env.MONGODB_URI);

const suffix = Date.now();
const mk = (over) => User.create({
  fullName: 'Verify', username: `verify_${over.username}_${suffix}`,
  email: `verify_${over.username}_${suffix}@example.com`,
  password: 'TestPass123!', authProvider: 'local', isEmailVerified: true, ...over
});

const author = await mk({ username: 'author' });
const reporter = await mk({ username: 'reporter' });
const admin = await mk({ username: 'admin', role: 'admin' });

const post = await Post.create({
  author: author._id, caption: 'verify post',
  media: [{ url: 'https://example.com/x.jpg', type: 'image' }], type: 'post'
});
const report = await Report.create({ reporter: reporter._id, targetType: 'post', targetId: post._id, reason: 'spam' });
const adminToken = generateToken(admin._id);

const resolveRes = await fetch(`${BASE}/admin/reports/resolve`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ targetType: 'post', targetId: post._id.toString(), action: 'dismiss' })
});
const resolveBody = await resolveRes.json();
console.log('resolve status:', resolveRes.status, resolveBody);
if (resolveRes.status !== 200) throw new Error('FAIL: resolve call did not return 200');

const pendingRes = await fetch(`${BASE}/admin/reports?status=pending`, { headers: { Authorization: `Bearer ${adminToken}` } });
const pendingBody = await pendingRes.json();
if (pendingBody.groups.some(g => g.targetId === post._id.toString())) {
  throw new Error('FAIL: resolved target still appears under status=pending');
}
console.log('PASS: resolved target no longer in pending list');

const historyRes = await fetch(`${BASE}/admin/reports?status=resolved`, { headers: { Authorization: `Bearer ${adminToken}` } });
const history = await historyRes.json();
console.log('history status:', historyRes.status);
console.log(JSON.stringify(history, null, 2));

const group = history.groups?.find(g => g.targetId === post._id.toString());
if (!group) throw new Error('FAIL: resolved group not found in history');
if (group.resolution !== 'dismissed') throw new Error(`FAIL: expected resolution dismissed, got ${group.resolution}`);
if (group.resolvedByUser?.username !== admin.username) throw new Error(`FAIL: expected resolvedByUser ${admin.username}, got ${JSON.stringify(group.resolvedByUser)}`);
if (!group.resolvedAt) throw new Error('FAIL: resolvedAt missing');
console.log('PASS: resolved history group shape is correct');

const filteredRes = await fetch(`${BASE}/admin/reports?status=resolved&resolution=content_removed`, { headers: { Authorization: `Bearer ${adminToken}` } });
const filtered = await filteredRes.json();
if (filtered.groups.some(g => g.targetId === post._id.toString())) {
  throw new Error('FAIL: dismissed group leaked into resolution=content_removed filter');
}
console.log('PASS: resolution filter excludes non-matching groups');

await Report.deleteMany({ _id: { $in: [report._id] } });
await Post.deleteOne({ _id: post._id });
await User.deleteMany({ _id: { $in: [author._id, reporter._id, admin._id] } });
await mongoose.disconnect();
console.log('CLEANUP DONE — ALL PASS');
process.exit(0);
```

- [ ] **Step 5: Run the verification script**

Run (in `backend/`): `node _verify_reports_history.mjs`
Expected: ends with `CLEANUP DONE — ALL PASS`, no thrown `FAIL:` error. If `MONGODB_URI` in `backend/.env` points at a remote cluster, this creates and then deletes three throwaway users, one throwaway post, and one throwaway report there — confirm that's acceptable before running, or point `MONGODB_URI` at a local/test database first.

- [ ] **Step 6: Delete the verification script**

Run: `rm backend/_verify_reports_history.mjs`
(Not committed — matches the existing project convention of throwaway `_*.mjs` scratch scripts for manual verification.)

- [ ] **Step 7: Commit**

```bash
git add backend/controllers/adminController.js
git commit -m "Add resolved-report history support to GET /api/admin/reports"
```

---

### Task 2: Frontend — Pending/Resolved tabs and resolution filter in `AdminReports.jsx`

**Files:**
- Modify: `frontend/src/pages/admin/AdminReports.jsx` (full-file rewrite, 153 → ~185 lines)

**Interfaces:**
- Consumes: `adminAPI.getReports(params)` (`frontend/src/services/api.js:172`, unchanged — already forwards an arbitrary params object) called with `{ page, limit, targetType?, status, resolution? }`; response `data.groups[]` items now include `resolution`, `resolvedAt`, `resolvedByUser` per Task 1. `adminAPI.resolveReport` (unchanged, only called for pending groups).
- Produces: no new exports — this is a leaf page component routed at `/admin/reports` (`frontend/src/App.jsx`, unchanged).

- [ ] **Step 1: Replace the full file contents**

Replace all of `frontend/src/pages/admin/AdminReports.jsx` with:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { adminAPI } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import toast from 'react-hot-toast';

const TYPE_TABS = [
  { value: '', label: 'All' },
  { value: 'post', label: 'Posts' },
  { value: 'user', label: 'Users' },
];

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
];

const RESOLUTION_TABS = [
  { value: '', label: 'All' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'content_removed', label: 'Content Removed' },
  { value: 'user_banned', label: 'User Banned' },
];

const RESOLUTION_LABELS = {
  dismissed: 'Dismissed',
  content_removed: 'Content Removed',
  user_banned: 'User Banned',
};

export default function AdminReports() {
  const [groups, setGroups] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [targetType, setTargetType] = useState('');
  const [status, setStatus] = useState('pending');
  const [resolution, setResolution] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getReports({
        page, limit: 20, status,
        ...(targetType ? { targetType } : {}),
        ...(status === 'resolved' && resolution ? { resolution } : {}),
      });
      setGroups(data.groups);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Failed to load reports'); }
    finally { setLoading(false); }
  }, [page, targetType, status, resolution]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (group, action) => {
    const verb = action === 'dismiss' ? 'Dismiss this report' : group.targetType === 'post' ? 'Remove this post' : 'Ban this user';
    if (!confirm(`${verb}?`)) return;
    try {
      await adminAPI.resolveReport({ targetType: group.targetType, targetId: group.targetId, action });
      toast.success(action === 'dismiss' ? 'Dismissed' : 'Action taken');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-[var(--text-secondary)] text-sm">{total.toLocaleString()} {status}</p>
      </div>

      <div className="flex gap-2 mb-3">
        {STATUS_TABS.map(t => (
          <button key={t.value} onClick={() => { setStatus(t.value); setResolution(''); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${status === t.value ? 'bg-pink-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        {TYPE_TABS.map(t => (
          <button key={t.value} onClick={() => { setTargetType(t.value); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${targetType === t.value ? 'bg-pink-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {status === 'resolved' && (
        <div className="flex gap-2 mb-5">
          {RESOLUTION_TABS.map(t => (
            <button key={t.value} onClick={() => { setResolution(t.value); setPage(1); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
                ${resolution === t.value ? 'bg-pink-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {status !== 'resolved' && <div className="mb-5" />}

      <div className="space-y-4">
        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="h-28 rounded-2xl shimmer" />)
        ) : groups.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">
            {status === 'pending' ? 'No pending reports 🎉' : 'No resolved reports yet'}
          </div>
        ) : (
          groups.map(g => (
            <div key={`${g.targetType}-${g.targetId}-${g.resolvedAt || 'pending'}`} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-4">
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
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      @{g.target.username}
                      {g.target.isBanned && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">
                          Already banned
                        </span>
                      )}
                    </p>
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
                {g.notes?.length > 0 && (
                  <p className="text-xs text-[var(--text-muted)] italic mt-1 truncate" title={g.notes.join(' · ')}>
                    "{g.notes[0]}"{g.notes.length > 1 ? ` (+${g.notes.length - 1} more)` : ''}
                  </p>
                )}
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {g.reporters.map(r => `@${r.username}`).join(', ')}{g.count > g.reporters.length ? ` +${g.count - g.reporters.length} more` : ''}
                </p>
              </div>

              <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                {!g.targetMissing && (
                  <Link to={g.targetType === 'post' ? `/p/${g.targetId}` : `/${g.target.username}`} target="_blank"
                    className="text-xs text-center btn-outline px-3 py-1.5 rounded-lg">
                    {g.targetType === 'post' ? 'View Post' : 'View Profile'}
                  </Link>
                )}
                {status === 'pending' ? (
                  <>
                    <button onClick={() => handleResolve(g, 'dismiss')} className="text-xs btn-outline px-3 py-1.5 rounded-lg">
                      Dismiss
                    </button>
                    {!g.targetMissing && (
                      <button onClick={() => handleResolve(g, 'remove')} className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">
                        {g.targetType === 'post' ? 'Remove Post' : 'Ban User'}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-right">
                    <p className="font-semibold">{RESOLUTION_LABELS[g.resolution] || g.resolution}</p>
                    <p className="text-[var(--text-muted)]">
                      by {g.resolvedByUser ? `@${g.resolvedByUser.username}` : 'unknown'}
                      {g.resolvedAt && ` · ${formatDistanceToNow(new Date(g.resolvedAt), { addSuffix: true })}`}
                    </p>
                  </div>
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

- [ ] **Step 2: Lint-check the file**

Run (in `frontend/`): `npx eslint src/pages/admin/AdminReports.jsx`
Expected: no errors (warnings, if the project's config produces any elsewhere, are acceptable — there must be zero errors).

- [ ] **Step 3: Manual verification in the browser**

With the backend still running from Task 1 (`npm run dev` in `backend/`) and the frontend dev server running (`npm run dev` in `frontend/`):

1. Log in as a user with `role: 'admin'` (or `'moderator'`) and go to `/admin/reports`.
2. Confirm it loads on the **Pending** tab by default, behaving exactly as before (existing pending cards, Dismiss/Remove/Ban buttons work).
3. Report any post as a different, non-admin user (via the post's options menu → Report), then as admin, dismiss it from the Pending queue.
4. Switch to the **Resolved** tab. Confirm the resolution-type filter row appears, the dismissed post's card now shows, with an outcome line "Dismissed / by @&lt;your-admin-username&gt; · a few seconds ago" and no Dismiss/Remove/Ban buttons.
5. Click the **Content Removed** resolution filter — confirm the dismissed card disappears (it's filtered out). Click **All** — confirm it reappears.
6. Switch back to **Pending** — confirm the resolution filter row disappears and the header count reflects pending groups only.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/AdminReports.jsx
git commit -m "Add resolved-reports history view to admin Reports page"
```
