# Admin Reviews Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Review` data model, admin-only moderation endpoints, and a Pending/Approved/Rejected "Reviews" tab in the admin panel — no public-facing submission UI yet.

**Architecture:** Backend follows the existing Report feature's split exactly: a plain Mongoose model, two new functions on the existing `adminController.js` (list-by-status, moderate), two new routes on the existing `adminRoutes.js` under the same `isAdmin` guard already used by every other admin list/moderate action. Frontend adds one new admin page (`AdminReviews.jsx`, structurally a simplified `AdminReports.jsx`), one nav entry, one route, and two new `adminAPI` service methods.

**Tech Stack:** Express, Mongoose, React, React Router, existing `DialogContext`'s `useConfirm()` for moderation confirmations (no native `confirm()` — matches the rest of the admin panel).

## Global Constraints

- No public submission endpoint, no landing-page UI, no `/` routing change — explicitly deferred per the spec's Non-goals.
- Admin list/read access uses `isAdmin` (`admin`, `moderator`, `superadmin`) — the same guard already used for `getReports`/`getAllUsers`/etc. in `adminRoutes.js`, not the stricter `adminOnly`.
- `Review.user` is `unique: true` in the schema even though nothing populates it yet, per the spec.
- Moderation actions in the UI go through the existing `useConfirm()` dialog (`frontend/src/context/DialogContext.jsx`), never a native `confirm()`.

---

## Task 1: Backend — model, admin endpoints, routes, API service methods

**Files:**
- Create: `backend/models/Review.js`
- Modify: `backend/controllers/adminController.js`
- Modify: `backend/routes/adminRoutes.js`
- Modify: `frontend/src/services/api.js`

**Interfaces:**
- Produces: `GET /api/admin/reviews?status=pending|approved|rejected&page=&limit=` → `{ success, reviews, total, pages }`, each review populated with `user` (`username fullName avatar`) and `moderatedBy` (`username`).
- Produces: `POST /api/admin/reviews/:id/moderate` with body `{ action: 'approve' | 'reject' }` → `{ success, review }`.
- Produces (frontend): `adminAPI.getReviews(params)`, `adminAPI.moderateReview(id, action)` — consumed by Task 2.

- [ ] **Step 1: Create the `Review` model**

```js
// backend/models/Review.js
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

- [ ] **Step 2: Add the two admin controller functions**

In `backend/controllers/adminController.js`, add the import alongside the existing model imports at the top of the file:

```js
import Review from '../models/Review.js';
```

Then add these two functions at the end of the file (after the existing `resolveReport` function's closing `};`):

```js
export const getReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';

    const reviews = await Review.find({ status })
      .populate('user', 'username fullName avatar')
      .populate('moderatedBy', 'username')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({ status });

    res.json({ success: true, reviews, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const moderateReview = async (req, res) => {
  try {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

    review.status = action === 'approve' ? 'approved' : 'rejected';
    review.moderatedBy = req.user._id;
    review.moderatedAt = new Date();
    await review.save();

    res.json({ success: true, review });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 3: Register the two routes**

In `backend/routes/adminRoutes.js`, add these two lines right after the existing `router.post('/reports/resolve', ...isAdmin, admin.resolveReport);` line, before `export default router;`:

```js
router.get('/reviews', ...isAdmin, admin.getReviews);
router.post('/reviews/:id/moderate', ...isAdmin, admin.moderateReview);
```

- [ ] **Step 4: Add the frontend API service methods**

In `frontend/src/services/api.js`, inside the existing `adminAPI` object, add these two lines right after the existing `resolveReport: (data) => API.post('/admin/reports/resolve', data),` line:

```js
getReviews: (params) => API.get('/admin/reviews', { params }),
moderateReview: (id, action) => API.post(`/admin/reviews/${id}/moderate`, { action }),
```

- [ ] **Step 5: Verify with the running backend**

The dev backend should already be running on port 5000 (started earlier this session). If not, run `npm run dev` inside `backend/`. Log in as the `superadmin` test account created earlier in this session (`navtestuser` / `TestPass123!`) to get a session cookie, then:

```bash
curl -s -c cookies.txt -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d '{"identifier":"navtestuser","password":"TestPass123!"}' -o /dev/null -w "login: %{http_code}\n"
curl -s -b cookies.txt "http://localhost:5000/api/admin/reviews?status=pending"
curl -s -b cookies.txt "http://localhost:5000/api/admin/reviews?status=approved"
```

Expected: both return `{"success":true,"reviews":[],"total":0,"pages":0}` (empty is correct — no reviews exist yet). Confirm no 500 errors, no `CastError`, and that the response shape matches (`reviews`/`total`/`pages` keys present). Then test the moderate endpoint's validation without a real review to moderate:

```bash
curl -s -b cookies.txt -X POST http://localhost:5000/api/admin/reviews/000000000000000000000000/moderate -H "Content-Type: application/json" -d '{"action":"approve"}'
```

Expected: `{"success":false,"message":"Review not found"}` (a valid-format but nonexistent ObjectId) — confirms the 404 path works. Clean up: `rm cookies.txt`.

- [ ] **Step 6: Commit**

```bash
git add backend/models/Review.js backend/controllers/adminController.js backend/routes/adminRoutes.js frontend/src/services/api.js
git commit -m "feat: add Review model and admin moderation endpoints"
```

---

## Task 2: Frontend — Reviews admin page, nav entry, route

**Files:**
- Create: `frontend/src/pages/admin/AdminReviews.jsx`
- Modify: `frontend/src/components/admin/AdminLayout.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `adminAPI.getReviews`, `adminAPI.moderateReview` (Task 1).
- Consumes: `useConfirm` from `frontend/src/context/DialogContext.jsx` (already built in an earlier plan on this codebase).

- [ ] **Step 1: Create `AdminReviews.jsx`**

```jsx
// frontend/src/pages/admin/AdminReviews.jsx
import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { adminAPI } from '../../services/api';
import Avatar from '../../components/common/Avatar';
import toast from 'react-hot-toast';
import { useConfirm } from '../../context/DialogContext';
import { FiCheckCircle } from 'react-icons/fi';
import { AiFillStar, AiOutlineStar } from 'react-icons/ai';

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) =>
        n <= rating
          ? <AiFillStar key={n} className="w-3.5 h-3.5 text-yellow-400" />
          : <AiOutlineStar key={n} className="w-3.5 h-3.5 text-[var(--border)]" />
      )}
    </div>
  );
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('pending');
  const confirmDialog = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminAPI.getReviews({ status, page, limit: 20 });
      setReviews(data.reviews);
      setTotal(data.total);
      setPages(data.pages);
    } catch { toast.error('Failed to load reviews'); }
    finally { setLoading(false); }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  const handleModerate = async (review, action) => {
    const verb = action === 'approve' ? 'Approve' : 'Reject';
    if (!(await confirmDialog({ message: `${verb} this review?`, danger: action === 'reject', confirmLabel: verb }))) return;
    try {
      await adminAPI.moderateReview(review._id, action);
      toast.success(action === 'approve' ? 'Review approved' : 'Review rejected');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Reviews</h1>
        <p className="text-[var(--text-secondary)] text-sm">{total.toLocaleString()} {status}</p>
      </div>

      <div className="flex gap-2 mb-5">
        {STATUS_TABS.map((t) => (
          <button key={t.value} onClick={() => { setStatus(t.value); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${status === t.value ? 'bg-pink-500 text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="h-28 rounded-2xl shimmer" />)
        ) : reviews.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">
            {status === 'pending' ? (
              <span className="flex items-center justify-center gap-1.5">
                <FiCheckCircle className="w-4 h-4 text-green-500" /> No pending reviews
              </span>
            ) : `No ${status} reviews yet`}
          </div>
        ) : (
          reviews.map((r) => (
            <div key={r._id} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Avatar src={r.user?.avatar} size={44} alt={r.user?.fullName} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">@{r.user?.username || 'deleted user'}</p>
                  <StarRating rating={r.rating} />
                  <p className="text-sm text-[var(--text-secondary)] mt-1 break-words">{r.text}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-shrink-0 sm:items-end">
                {status === 'pending' ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleModerate(r, 'reject')}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors">
                      Reject
                    </button>
                    <button onClick={() => handleModerate(r, 'approve')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors">
                      Approve
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-right">
                    <p className="font-semibold capitalize">{status}</p>
                    <p className="text-[var(--text-muted)]">
                      by {r.moderatedBy ? `@${r.moderatedBy.username}` : 'unknown'}
                      {r.moderatedAt && ` · ${formatDistanceToNow(new Date(r.moderatedAt), { addSuffix: true })}`}
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
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">← Prev</button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="btn-outline px-3 py-1.5 text-sm disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Note the `n <= rating ? ... : ...` inside `{[1,2,3,4,5].map((n) => ...)}` has no
`return` because it's an arrow function with an implicit-return expression
body (no `{ }` block) — this is intentional and matches the pattern already
used elsewhere in this codebase (e.g. `MANUAL_STEPS[p].map((step) => <li
key={step}>{step}</li>)` in `Download.jsx`).

- [ ] **Step 2: Add the nav entry**

In `frontend/src/components/admin/AdminLayout.jsx`, add `FiStar` to the existing icon import line:

```js
import { FiUsers, FiFileText, FiBarChart2, FiArrowLeft, FiSun, FiMoon, FiLogOut, FiFlag, FiStar } from 'react-icons/fi';
```

Add one entry to `navItems`, right after the `Reports` entry:

```js
{ to: '/admin/reviews', label: 'Reviews', Icon: FiStar },
```

- [ ] **Step 3: Register the route**

In `frontend/src/App.jsx`, add the import next to the other admin page imports:

```js
import AdminReviews from './pages/admin/AdminReviews';
```

Add the route inside the existing admin `<Route path="/admin" ...>` block, right after the existing `<Route path="reports" element={<AdminReports />} />` line:

```jsx
<Route path="reviews" element={<AdminReviews />} />
```

- [ ] **Step 4: Verify it builds**

Run inside `frontend/`:
```bash
npm run build
```
Expected: build succeeds with no import/reference errors.

- [ ] **Step 5: Manually verify in a real browser**

The dev frontend should already be running on port 5173 (started earlier this session, restart with `npm run dev` in `frontend/` if not). Using the project's `run` skill, log in as `navtestuser` / `TestPass123!` (superadmin), navigate to `/admin/reviews`:
- Confirm the "Reviews" nav entry appears in the admin sidebar with a star icon.
- Confirm all three tabs (Pending/Approved/Rejected) render and each shows "No pending/approved/rejected reviews yet" (there's no data yet — that's expected at this point).
- Confirm switching tabs doesn't error and updates the count text.

Since there's no data yet, the Approve/Reject flow and pagination can't be exercised live in this step — that happens in Step 6 after seeding.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/AdminReviews.jsx frontend/src/components/admin/AdminLayout.jsx frontend/src/App.jsx
git commit -m "feat: add Reviews tab to admin panel"
```

- [ ] **Step 7: Seed dummy data and do the full end-to-end check**

This step is done directly against the running dev backend (same technique already used earlier in this session to create the `navtestuser`/`admintestuser` test accounts) — not a permanent seed script, per the spec's Non-goals.

Register 2-3 throwaway reviewer accounts via the auth API (each needs a unique username/email), for example:
```bash
curl -s -X POST http://localhost:5000/api/auth/register -H "Content-Type: application/json" -d '{"fullName":"Sarah Ahmed","username":"reviewer_sarah","email":"reviewer_sarah@example.com","password":"TestPass123!"}'
curl -s -X POST http://localhost:5000/api/auth/register -H "Content-Type: application/json" -d '{"fullName":"Ali Raza","username":"reviewer_ali","email":"reviewer_ali@example.com","password":"TestPass123!"}'
curl -s -X POST http://localhost:5000/api/auth/register -H "Content-Type: application/json" -d '{"fullName":"Zara Khan","username":"reviewer_zara","email":"reviewer_zara@example.com","password":"TestPass123!"}'
```

Then, from `backend/`, insert Review documents directly for those users (mirroring the earlier direct-DB-update technique used to promote test accounts to admin/superadmin), covering all three statuses, for example:

```bash
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const User = require('./models/User.js').default;
  const Review = require('./models/Review.js').default;
  const sarah = await User.findOne({ username: 'reviewer_sarah' });
  const ali = await User.findOne({ username: 'reviewer_ali' });
  const zara = await User.findOne({ username: 'reviewer_zara' });
  await Review.create({ user: sarah._id, rating: 5, text: 'NexVibe has the best UI of any social app I have used. Love the reels feature!', status: 'approved', moderatedAt: new Date() });
  await Review.create({ user: ali._id, rating: 4, text: 'Great app overall, messaging is super fast and reliable.', status: 'approved', moderatedAt: new Date() });
  await Review.create({ user: zara._id, rating: 5, text: 'Switched from another platform and never looked back. Highly recommend!', status: 'pending' });
  console.log('seeded 3 reviews');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
"
```

(Adjust the exact wording/ratings freely — the point is 2 `approved` + 1 `pending` at minimum, so both the read-only Approved tab and the actionable Pending tab have something to show. A `rejected` example isn't necessary to seed directly — it's easy to produce for real in the next check by rejecting the pending one, or approving it and manually testing the reject path on a second pending entry if you seed one more.)

Then, back in the browser at `/admin/reviews`:
- Confirm the Pending tab now shows the pending review with its star rating, text, and the reviewer's avatar/username.
- Click Reject — confirm the custom dialog (not a native `confirm()`) appears, confirm rejecting it removes it from Pending and it now appears under the Rejected tab with "by @navtestuser" and a relative time.
- Confirm the Approved tab shows the 2 pre-approved reviews correctly, read-only (no Approve/Reject buttons on that tab).
- Resize the browser to a narrow (mobile) width and confirm the review cards reflow sensibly (avatar/text stack above the action buttons per the `flex-col sm:flex-row` layout) with no overflow or clipped content.

Report the real observations from this check (not assumed) as part of finishing this task.
