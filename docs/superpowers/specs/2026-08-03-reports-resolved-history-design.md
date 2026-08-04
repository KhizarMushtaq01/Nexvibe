# Resolved Reports History — Design

## Problem

`GET /api/admin/reports` hardcodes `status: 'pending'`. Once an admin
dismisses a report group or takes action (remove post / ban user), the
`Report` documents flip to `status: 'resolved'` but become permanently
invisible in the admin UI — there is no way to see what was resolved, by
whom, or how. `resolution`, `resolvedBy`, and `resolvedAt` are recorded on
every `Report` document but never surfaced.

## Goals

- Admins can view a history of resolved report groups: what the target
  was, how many reports it had, the resolution outcome (dismissed /
  content removed / user banned), who resolved it, and when.
- Reuses the existing `/admin/reports` page and its group-card layout
  rather than a separate page.
- Filterable by target type (existing All/Posts/Users tabs) and by
  resolution outcome.

## Non-goals

- No "un-resolve" / reopen action.
- No CSV export or analytics/trends on resolution history.
- No date-range picker.
- No change to the dashboard's "Pending Reports" stat card (still counts
  pending groups only).

## Grouping semantics

A single `resolveReport` call does `Report.updateMany({ targetType,
targetId, status: 'pending' }, { status: 'resolved', resolution,
resolvedBy, resolvedAt: new Date() })` — every report matched by that call
gets the *same* `resolvedAt` timestamp. If the same target is reported,
resolved, then reported and resolved again later, that produces two
distinct resolution events with two different `resolvedAt` values.

History groups by `(targetType, targetId, resolvedAt)` instead of just
`(targetType, targetId)`, so each resolution event is its own card. For
pending reports `resolvedAt` is unset on every document, so grouping by
the extra key is a no-op there — all pending reports for a target still
group into a single card exactly as today.

## Backend — `GET /api/admin/reports`

Two new optional query params:
- `status`: `'pending' | 'resolved'`, default `'pending'`.
- `resolution`: `'dismissed' | 'content_removed' | 'user_banned'`, only
  applied when `status === 'resolved'`.

```js
const { targetType, status = 'pending', resolution, page = 1, limit = 20 } = req.query;
const match = {
  status,
  ...(targetType ? { targetType } : {}),
  ...(status === 'resolved' && resolution ? { resolution } : {})
};

const groups = await Report.aggregate([
  { $match: match },
  { $group: {
      _id: { targetType: '$targetType', targetId: '$targetId', resolvedAt: '$resolvedAt' },
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
```

The `total`/`pages` count query gets the same `$match` and the same
extended `$group._id` (so the count matches the number of cards actually
returned, i.e. events not raw report rows).

Per-group enrichment (existing `results = await Promise.all(groups.map(...))`
block) gains one more lookup alongside the existing target/reporter
lookups, only when a group has a `resolvedBy`:
```js
const resolvedByUser = g.resolvedBy
  ? await User.findById(g.resolvedBy).select('username')
  : null;
```
Returned group shape gains: `resolution`, `resolvedAt: g._id.resolvedAt`,
`resolvedByUser` (`{ username }` or `null`).

No changes to `resolveReport` — it already writes everything this needs.

## Frontend — `AdminReports.jsx`

- New state: `const [status, setStatus] = useState('pending');` and
  `const [resolution, setResolution] = useState('');`. Both reset `page`
  to 1 on change, both included in the `adminAPI.getReports(...)` call
  alongside the existing `targetType`.
- New tab row above the existing All/Posts/Users row: **Pending /
  Resolved**, same pill-button styling as the existing `TABS` map.
- When `status === 'resolved'`, render a third tab row: **All / Dismissed
  / Content Removed / User Banned**, same styling, driving `resolution`.
  Hidden entirely when `status === 'pending'`.
- Header: `{total} pending` → `{total} {status}` (or explicit ternary
  text, matching existing tone).
- Card action area: when `status === 'resolved'`, replace the
  Dismiss/Remove/Ban buttons with a compact outcome line, e.g.:
  ```
  Content Removed
  by @admin1 · 2 days ago
  ```
  (resolution label map: `dismissed → 'Dismissed'`,
  `content_removed → 'Content Removed'`, `user_banned → 'User Banned'`;
  relative time via whatever date-formatting the file already imports —
  if none is imported yet, `new Date(g.resolvedAt).toLocaleDateString()`
  matching the plain-JS-Date usage already in this file). The "View
  Post"/"View Profile" link still renders when `!targetMissing`, exactly
  as today.
- Empty state text when resolved+empty: "No resolved reports yet" (mirrors
  the existing pending empty state's friendly tone, no emoji needed since
  it's not necessarily a "good" empty state).

No changes to `frontend/src/services/api.js` — `adminAPI.getReports`
already forwards an arbitrary `params` object.

## Error handling

Unchanged pattern — same try/catch as the rest of `getReports`, including
the `CastError → 400` handling already in place from the prior fix.

## Testing

No automated test suite exists in this repo (unchanged from the original
feature). Manual verification:

1. Dismiss a pending report group → switch to Resolved tab → confirm the
   card appears with resolution "Dismissed", correct resolver username,
   and a plausible timestamp.
2. Remove a post via a report group → Resolved tab → confirm "Content
   Removed" badge and that the post's normal card preview still renders
   (post is soft-deleted, not hard-deleted, so target lookup still finds
   it — confirm `targetMissing` logic still treats a soft-deleted post as
   missing, matching current pending-view behavior, i.e. it shows "This
   post no longer exists" there too).
3. Ban a user via a report group → Resolved tab, filter to "User Banned"
   → confirm only that card shows, with the "Already banned" indicator
   still correct.
4. Report the same target again after it was resolved (covered by the
   earlier pending-report-dedup fix) → resolve it a second time with a
   different outcome → confirm Resolved tab now shows *two* separate
   cards for that target with different resolutions/timestamps, not one
   merged card.
5. Pagination and the target-type tabs (All/Posts/Users) continue to work
   identically under both Pending and Resolved.
