# Admin Reviews Tab — Design

## Problem

There's no way to collect or moderate user reviews of NexVibe anywhere in the
app. The eventual goal is a public reviews section, but that's explicitly
deferred — this change builds only the admin-facing moderation side first:
a data model, admin-only moderation endpoints, and a Reviews tab in the
admin panel, seeded with dummy data so it's usable/demoable immediately.

## Goals

- A `Review` model that can hold `pending`/`approved`/`rejected` reviews.
- Admin-only endpoints to list reviews by status and to approve/reject one.
- A new "Reviews" tab in the admin panel (Pending / Approved / Rejected),
  matching the existing `AdminReports.jsx` tab pattern, with working
  Approve/Reject actions on pending reviews.
- A handful of dummy reviews (across all three statuses) seeded into the
  dev database directly by the assistant after the feature is built, so the
  tab has real data to demonstrate/test against.

## Non-goals (deferred, not part of this change)

- No landing-page reviews section, no marquee/animation, no "Write a
  review" modal, no login-gated toast.
- No public submission endpoint (`POST /api/reviews`) and no `GET
  /api/reviews/me` — there is no frontend caller for either yet, so they
  are not built now (YAGNI). When the user-facing side is built later, this
  is the natural next addition.
- No change to `App.jsx`'s `/` redirect behavior — not needed without a
  public-facing reviews section.
- No permanent seed *script* — the dummy data is inserted once, directly,
  the same way the earlier test login accounts were created in this
  session (not a reusable dev tool).

## Backend

### `backend/models/Review.js` (new)

Mirrors `backend/models/Report.js`'s style:

```js
import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  text: { type: String, required: true, maxlength: 500, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  moderatedAt: Date,
}, { timestamps: true });

reviewSchema.index({ status: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);
export default Review;
```

`user` is `unique: true` — even though nothing calls the (not-yet-built)
submission endpoint today, the constraint reflects the intended one-review-
per-user rule from the start, so it doesn't need revisiting later.

### `backend/controllers/adminController.js` (add two functions)

Follows the existing `getReports`/`resolveReport` pattern exactly (simpler,
since reviews don't need Report's group-by-target aggregation — a plain
paginated `find` is enough):

- `getReviews(req, res)` — `GET /admin/reviews?status=pending&page=1&limit=20`.
  `status` defaults to `'pending'` if not one of the three valid values.
  Query: `Review.find({ status }).populate('user', 'username fullName
  avatar').populate('moderatedBy', 'username').sort({ createdAt: -1
  }).skip(...).limit(...)`, plus a `Review.countDocuments({ status })` for
  `total`/`pages`, returned as `{ success, reviews, total, pages }` (same
  shape convention as `getAllUsers`/`getAllPosts`).
- `moderateReview(req, res)` — `POST /admin/reviews/:id/moderate`, body
  `{ action: 'approve' | 'reject' }`. Validates `action`, 404s if the review
  doesn't exist, sets `status` to `'approved'`/`'rejected'`,
  `moderatedBy: req.user._id`, `moderatedAt: new Date()`, saves, returns the
  updated review.

### `backend/routes/adminRoutes.js` (add two routes)

Next to the existing reports routes, using the same `isAdmin` guard
(`admin`, `moderator`, `superadmin` — matches every other list/moderate
action in this file, not `adminOnly`):

```js
router.get('/reviews', ...isAdmin, admin.getReviews);
router.post('/reviews/:id/moderate', ...isAdmin, admin.moderateReview);
```

## Frontend

### `frontend/src/services/api.js`

Add to the existing `adminAPI` object, next to `getReports`/`resolveReport`:

```js
getReviews: (params) => API.get('/admin/reviews', { params }),
moderateReview: (id, action) => API.post(`/admin/reviews/${id}/moderate`, { action }),
```

### `frontend/src/pages/admin/AdminReviews.jsx` (new)

Structurally a simplified `AdminReports.jsx`: one row of status tabs
(`Pending` / `Approved` / `Rejected`), a loading-shimmer list, an empty
state, and a paginated card list. Each card shows the reviewer's avatar,
username, star rating (rendered as 5 star icons, filled up to `rating`),
review text, and relative submission time. On the Pending tab only, each
card gets Approve/Reject buttons wired through `useConfirm()` (the same
custom-dialog pattern already used by `AdminReports.jsx`/`AdminUsers.jsx`)
before calling `adminAPI.moderateReview`. Approved/Rejected tabs are
read-only (show who moderated it and when, via `moderatedBy`/`moderatedAt`).

### `frontend/src/components/admin/AdminLayout.jsx`

Add one entry to `navItems`, after `Reports`:

```js
{ to: '/admin/reviews', label: 'Reviews', Icon: FiStar },
```

(`FiStar` added to the existing `react-icons/fi` import line.)

### `frontend/src/App.jsx`

Add `AdminReviews` to the admin route group, next to the existing
`AdminReports` route:

```jsx
<Route path="reviews" element={<AdminReviews />} />
```

## Responsiveness

`AdminReviews.jsx` follows the same responsive card-list layout already
used by `AdminReports.jsx` (which already works down to mobile widths) —
no new responsive-design surface is introduced here.

## Testing

- Backend: manual `curl` calls against `/api/admin/reviews` (with an admin
  session cookie) for each status value, and against the moderate endpoint,
  to confirm the shapes and the `unique` index behavior.
- Frontend: `npm run build`; manual browser check (logged in as the
  `superadmin` test account already created in this session) — visit
  `/admin/reviews`, confirm all three tabs render, confirm Approve/Reject
  on a pending dummy review moves it to the correct tab and disappears from
  Pending, confirm the custom dialog (not a native `confirm()`) appears
  before either action.
- After the build passes review, seed ~5 dummy reviews (mixed across the
  three statuses, using a couple of placeholder reviewer accounts) directly
  into the dev database, then re-verify the tab shows them correctly.
