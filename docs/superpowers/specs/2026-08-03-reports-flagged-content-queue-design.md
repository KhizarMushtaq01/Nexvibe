# Reports / Flagged-Content Queue — Design

## Problem

Users have no way to report abusive posts or accounts, and admins have no
way to review reported content. The only existing "Report" UI
(`frontend/src/components/post/PostOptionsMenu.jsx:41`) is a placeholder —
it fires a success toast and does nothing else. No `Report`/`Flag` data
model, API endpoint, or admin UI exists anywhere in the codebase (confirmed
by direct search of `backend/models/`, `backend/routes/`,
`backend/controllers/`).

## Goals

- Users can report a post or a post's author, with a reason.
- Reports are deduplicated per (reporter, target) and grouped by target for
  admin review — one card per reported post/user, not one row per report.
- Admins get a queue page to review pending report groups and either
  dismiss them or take action (remove the post / ban the user), reusing
  the existing `deletePostAdmin`/`banUser` logic rather than duplicating it.
- The admin dashboard shows a "Pending Reports" stat card linking to the
  queue.

## Non-goals

- Reporting comments, messages, or stories.
- A dedicated "report user" entry point on the profile page (no options
  menu exists there today — out of scope to build one; reporting a user
  happens via the post options menu instead, see Frontend section).
- Auto-hide / auto-threshold moderation (e.g. "hide after 5 reports").
- Warning notifications to reported users (considered, explicitly excluded
  — only Dismiss and Remove/Ban are supported actions).
- Reporter-facing status updates, appeals, or analytics/trends on reports.

## Data Model

New file `backend/models/Report.js`:

```js
{
  reporter: { type: ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['post', 'user'], required: true },
  targetId: { type: ObjectId, required: true },
  reason: {
    type: String,
    enum: ['spam', 'nudity', 'harassment', 'hate_speech', 'violence', 'false_info', 'other'],
    required: true
  },
  note: { type: String, maxlength: 500 }, // optional; UI only shows the field when reason === 'other'
  status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  resolution: { type: String, enum: ['dismissed', 'content_removed', 'user_banned'] },
  resolvedBy: { type: ObjectId, ref: 'User' },
  resolvedAt: Date
}
```
`timestamps: true` for `createdAt`/`updatedAt`.

A compound unique index on `(reporter, targetType, targetId)` prevents the
same user from reporting the same target twice. `POST /api/reports` checks
for this first (`Report.findOne(...)`) and returns a friendly 400 message
rather than letting a duplicate-key error surface — the unique index is a
safety net, not the primary UX path.

## Backend — reporting endpoint

New file `backend/routes/reportRoutes.js`, mounted at `/api/reports` in
`backend/server.js` (alongside the other route mounts).

`POST /api/reports` (`protect` middleware only — any logged-in user):
- Body: `{ targetType: 'post' | 'user', targetId, reason, note? }`.
- Validates `targetType` and `reason` against the enums above; 400 if invalid.
- Validates the target exists: `Post.findById(targetId)` for `'post'`,
  `User.findById(targetId)` for `'user'`; 404 if not found.
- Self-report guard: if `targetType === 'user'` and `targetId === req.user._id`,
  400. If `targetType === 'post'` and the post's `author` equals
  `req.user._id`, 400 (mirrors the frontend already never showing "Report"
  on your own posts, but the backend must not trust that).
- Duplicate guard: `Report.findOne({ reporter: req.user._id, targetType, targetId })`
  — if found, 400 "You've already reported this."
- Otherwise creates the `Report` and returns `201 { success: true }`.

## Backend — admin endpoints

Added to the existing `backend/controllers/adminController.js` and
`backend/routes/adminRoutes.js` (keeps the admin API surface centralized,
matching the existing pattern — no new admin route file).

### `GET /api/admin/reports` (`protect` + `authorize('admin', 'moderator')`)

Query params: `targetType` (optional filter: `'post'` | `'user'`), `page`,
`limit` (default 20).

Implementation: aggregate pending reports grouped by `(targetType, targetId)`:

```js
const groups = await Report.aggregate([
  { $match: { status: 'pending', ...(targetType ? { targetType } : {}) } },
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
  { $limit: limit }
]);
```

For each group, resolve the target and reporters for display:
- `targetType === 'post'`: `Post.findById(targetId).populate('author', 'username fullName avatar')` — if the post was already deleted by other means, mark the group with `targetMissing: true` so the frontend can still show "Dismiss" (nothing to remove).
- `targetType === 'user'`: `User.findById(targetId).select('username fullName avatar isBanned')`.
- Reporters: `User.find({ _id: { $in: reporterIds } }).select('username').limit(5)` — cap the populated list at 5 for the card UI; the group's `count` is the true total.
- Reasons: reduce the `reasons` array into counts per reason (e.g. `{ spam: 3, harassment: 1 }`) in the response, not on the frontend.

Also return a `totalGroups` count (same `$match` + `$group` + `$count`) for pagination.

### `POST /api/admin/reports/resolve` (`protect` + `authorize('admin', 'moderator')`)

Confirmed against `backend/routes/adminRoutes.js:6-7,12-13,18`: `banUser`,
`unbanUser`, and `deletePostAdmin` all use the `isAdmin` middleware array
(`authorize('admin', 'moderator')`), not the stricter `adminOnly`
(`authorize('admin')`). Since `resolve` with `action: 'remove'` performs
exactly those same two effects, it uses the same `isAdmin` level for
consistency — not a stricter gate than the actions it wraps.

Body: `{ targetType: 'post' | 'user', targetId, action: 'dismiss' | 'remove' }`.

Logic:
```js
const resolution = action === 'dismiss' ? 'dismissed'
  : targetType === 'post' ? 'content_removed' : 'user_banned';

if (action === 'remove') {
  if (targetType === 'post') {
    await Post.findByIdAndUpdate(targetId, { isDeleted: true }); // same effect as deletePostAdmin
  } else {
    const user = await User.findById(targetId);
    if (user && user.role !== 'admin') {
      user.isBanned = true;
      user.banReason = 'Multiple user reports';
      await user.save();
    } else if (user?.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot ban admin' });
    }
    // if user was already deleted/not found, fall through — still resolve the reports below
  }
}

await Report.updateMany(
  { targetType, targetId, status: 'pending' },
  { status: 'resolved', resolution, resolvedBy: req.user._id, resolvedAt: new Date() }
);

res.json({ success: true });
```
This intentionally reuses the exact field-level effects of `deletePostAdmin`
(`isDeleted: true`) and `banUser` (`isBanned: true`, `banReason`) instead of
calling those controller functions directly (their signatures are
`(req, res)` and not designed to be called internally) — the duplication is
two lines each and matches existing code, not new logic.

## Frontend — reporting UI

`frontend/src/services/api.js`:
```js
export const reportAPI = {
  createReport: (data) => API.post('/reports', data), // { targetType, targetId, reason, note? }
};
```
Add to the existing `adminAPI` object:
```js
getReports: (params) => API.get('/admin/reports', { params }),
resolveReport: (data) => API.post('/admin/reports/resolve', data),
```

New component `frontend/src/components/common/ReportModal.jsx`:
- Props: `{ targetType, targetId, label, onClose }` (`label` is the modal
  heading, e.g. "Report this post" or "Report @username").
- Bottom-sheet style, matching `PostOptionsMenu`'s existing
  `modal-overlay` + slide-up pattern for visual consistency.
- Body: a vertical list of 7 reason buttons (Spam, Nudity or sexual
  content, Harassment or bullying, Hate speech, Violence, False
  information, Other). Selecting one highlights it; selecting "Other"
  reveals a `<textarea maxLength={500}>` for the optional note.
- Footer: "Submit" button (disabled until a reason is selected), "Cancel".
- On submit: `reportAPI.createReport({ targetType, targetId, reason, note })`,
  toast on success ("Report submitted. Thank you.") or on the backend's
  400 messages (duplicate/self-report), then `onClose()`.

`frontend/src/components/post/PostOptionsMenu.jsx` (non-own-post branch,
currently lines 40-58):
- Add local state: `const [reportTarget, setReportTarget] = useState(null); // null | 'post' | 'author'`.
- Change the existing `'Report'` action's `onClick` from the toast stub to
  `() => setReportTarget('post')`.
- Add a new action directly after it: `` `Report @${post.author?.username}` ``,
  `danger: true`, `onClick: () => setReportTarget('author')`.
- At the bottom of the component, before the closing `</div>` of the
  overlay, render:
  ```jsx
  {reportTarget && (
    <ReportModal
      targetType={reportTarget === 'post' ? 'post' : 'user'}
      targetId={reportTarget === 'post' ? post._id : post.author?._id}
      label={reportTarget === 'post' ? 'Report this post' : `Report @${post.author?.username}`}
      onClose={() => { setReportTarget(null); onClose(); }}
    />
  )}
  ```
  (`onClose()` here closes both the report modal and the parent options
  sheet, matching how every other action in this menu already closes the
  sheet after acting.)
- The `isOwn` branch (lines 11-39) is untouched — you still can't report
  your own posts/yourself, and the backend independently rejects it too
  (see self-report guard above).

## Frontend — admin queue page

New file `frontend/src/pages/admin/AdminReports.jsx`, new route
`/admin/reports` (added to the admin route block in `frontend/src/App.jsx`,
same pattern as the existing `/admin/users`, `/admin/posts` routes), new
nav entry in `frontend/src/components/admin/AdminLayout.jsx`'s sidebar
array (label "Reports", after "Posts").

- Top: filter tabs "All | Posts | Users" (client-side re-fetch with the
  `targetType` query param; "All" omits the param).
- List: one card per group, each showing:
  - Target preview: for posts, the first media thumbnail + truncated
    caption + author `@username` (or "Post no longer exists" if
    `targetMissing`); for users, avatar + `@username` + full name.
  - A count badge, e.g. "5 reports".
  - Reason breakdown as small pills, e.g. "spam ×3", "harassment ×1".
  - Reporter list: up to 5 `@usernames`, comma-separated, plus "+N more"
    if `count > 5`.
  - A "View Post" / "View Profile" link (opens `/p/:id` or `/:username`
    in a new tab).
  - Two buttons: "Dismiss" and, depending on `targetType`, "Remove Post"
    or "Ban User" (both `danger` styled, both call
    `adminAPI.resolveReport({ targetType, targetId, action })` then remove
    the card from local state and toast the result).
- Empty state (no pending groups): "No pending reports 🎉" — matches the
  tone of empty states elsewhere in the admin panel (e.g. the audit
  confirmed other admin pages already use a similar friendly-empty pattern).
- Pagination: reuse whatever simple prev/next pattern `AdminUsers.jsx` or
  `AdminPosts.jsx` already uses for their paginated lists — follow that
  file's existing pagination UI exactly rather than inventing a new one.

## Frontend — dashboard stat card

`backend/controllers/adminController.js`'s `getDashboardStats`: add a
`pendingReports` count to the `Promise.all` array — but as a **distinct
target-group count**, not a raw `Report.countDocuments`, so the number
matches what the queue actually shows (5 reports on one post = "1" pending
item, not "5"):
```js
Report.aggregate([
  { $match: { status: 'pending' } },
  { $group: { _id: { targetType: '$targetType', targetId: '$targetId' } } },
  { $count: 'total' }
]).then(r => r[0]?.total || 0)
```
Add `pendingReports` to the returned `stats` object.

`frontend/src/pages/admin/AdminDashboard.jsx`: add one card to the `cards`
array, e.g. `{ label: 'Pending Reports', value: stats?.stats.pendingReports ?? 0, icon: '🚩', color: 'from-red-500 to-red-600', change: 'Needs review' }`.
Unlike the other 8 cards (which are static divs), wrap this specific card
in a `<Link to="/admin/reports">` (import `Link` from `react-router-dom`,
already used elsewhere in the app) so clicking it navigates straight to
the queue — the only card with this behavior, which is fine since it's the
only one representing actionable pending work rather than a read-only
metric.

## Error handling

- All new backend endpoints follow the existing try/catch → `500` with
  `error.message` pattern used throughout `adminController.js` and
  `postController.js`.
- Frontend `ReportModal` and `AdminReports` follow the existing
  toast-on-catch pattern used throughout the app (e.g.
  `CreatePostModal.jsx`'s `catch (err) { toast.error(...) }`).

## Testing

No automated test suite exists in this repo (confirmed: neither
`package.json` has a `test` script) — verification is manual, consistent
with prior features in this codebase:

1. Report a post (not your own) with reason "Spam" → toast success →
   confirm a `Report` document exists with `status: 'pending'`.
2. Report the same post again as the same user → 400 "already reported".
3. Report the post's author via "Report @username" with a different
   reason → confirm a second `Report` doc for `targetType: 'user'`.
4. As admin, open `/admin/reports` → confirm the post group shows count 1,
   the user group shows count 1, correct reasons and reporter username.
5. Dismiss the user-report group → confirm it disappears from the queue
   and the `Report` doc(s) for that target are `status: 'resolved'`,
   `resolution: 'dismissed'`; the user is NOT banned.
6. Remove the post group → confirm the post is soft-deleted
   (`isDeleted: true`, no longer visible in `/feed`) and its report(s)
   are `resolved`/`content_removed`.
7. Confirm the dashboard's "Pending Reports" card count decreases as
   groups are resolved, and clicking it navigates to `/admin/reports`.
8. Try reporting your own post directly via `POST /api/reports` (bypassing
   the UI, e.g. with curl) → confirm 400, not a silent success.
