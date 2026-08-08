# Country Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a site-wide, admin-configurable geo-restriction system (whitelist / blacklist / allow-all) with a "Countries" tab in the admin panel showing flags, plus a dedicated "not available in your region" page for blocked visitors.

**Architecture:** A single-document Mongo settings collection (`GeoRestriction`) cached in memory, checked by a global Express middleware (`geoBlock`) that looks up each request's country via the offline `geoip-lite` database and compares it against the active mode. Admin/moderator/team/superadmin JWTs (which now carry a `role` claim) and `/api/health` bypass the check. Admin CRUD endpoints manage the settings; a React admin page edits them with a searchable, flag-illustrated country checklist.

**Tech Stack:** Node/Express/Mongoose (backend), React/Vite/Tailwind (frontend), `geoip-lite` (offline IP→country), `country-list` (ISO 3166-1 name/code data), `flag-icons` (SVG flag CSS).

## Global Constraints

- Follow this codebase's existing verification convention: there is no backend test runner (no jest/mocha) and no automated tests for admin pages/controllers anywhere in this repo — verify backend changes with `node --check` plus manual `curl`, and frontend changes by confirming Vite's dev server recompiles with no errors plus a manual browser check. Do not introduce a new test framework as part of this work.
- Default mode is `allow_all` — the feature must never restrict anything until an admin explicitly changes the mode.
- Admin/moderator/team_member/superadmin roles must always bypass the block, and `/api/health` must always bypass it.
- An undetected/unknown country (geoip miss) must fail **open** (allowed), never closed.
- This session's backend dev server has repeatedly needed a restart due to unrelated MongoDB Atlas connectivity flakiness (DNS SRV lookups). Before any curl-based verification step, first confirm `curl http://localhost:5000/api/health` returns `200`; if not, run `touch backend/server.js` (nodemon watches the directory and will restart) and wait ~8 seconds before retrying.

---

### Task 1: GeoRestriction model and settings cache util

**Files:**
- Create: `backend/models/GeoRestriction.js`
- Create: `backend/utils/geoRestriction.js`
- Modify: `backend/package.json` (via `npm install`, not a manual edit)

**Interfaces:**
- Produces: `GeoRestriction` (default export of the model) with fields `mode: 'allow_all'|'whitelist'|'blacklist'`, `countries: string[]`, `updatedBy: ObjectId`.
- Produces: `getSettings(): Promise<{ mode: string, countries: Set<string> }>`, `invalidateCache(): void`, `isCountryAllowed(countryCode: string|undefined, mode: string, countries: Set<string>): boolean` — all named exports of `backend/utils/geoRestriction.js`.

- [ ] **Step 1: Install `geoip-lite`**

```bash
cd backend && npm install geoip-lite
```

- [ ] **Step 2: Create the model**

`backend/models/GeoRestriction.js`:

```js
import mongoose from 'mongoose';

// Single-document settings collection -- there is intentionally only ever
// one GeoRestriction document. getSettings()/updateGeoRestriction() in
// utils/geoRestriction.js and adminController.js treat it that way.
const geoRestrictionSchema = new mongoose.Schema({
  mode: { type: String, enum: ['allow_all', 'whitelist', 'blacklist'], default: 'allow_all' },
  // ISO 3166-1 alpha-2 codes, e.g. ['US', 'PK']. Meaning depends on `mode`;
  // ignored entirely when mode is 'allow_all'.
  countries: [{ type: String, uppercase: true, trim: true }],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const GeoRestriction = mongoose.model('GeoRestriction', geoRestrictionSchema);
export default GeoRestriction;
```

- [ ] **Step 3: Syntax-check the model**

```bash
cd backend && node --check models/GeoRestriction.js
```
Expected: no output (success).

- [ ] **Step 4: Create the settings cache util**

`backend/utils/geoRestriction.js`:

```js
import GeoRestriction from '../models/GeoRestriction.js';

let cache = null; // { mode: string, countries: Set<string> } | null

// Loads the singleton settings document into an in-memory cache (creating
// the default allow_all document on first-ever access), so the geoBlock
// middleware doesn't hit the DB on every single request.
export const getSettings = async () => {
  if (cache) return cache;
  let doc = await GeoRestriction.findOne();
  if (!doc) {
    doc = await GeoRestriction.create({ mode: 'allow_all', countries: [] });
  }
  cache = { mode: doc.mode, countries: new Set(doc.countries) };
  return cache;
};

// Called by the admin PUT handler right after saving, so the very next
// request picks up the new settings instead of waiting for the process to
// restart.
export const invalidateCache = () => {
  cache = null;
};

// Pure function -- takes mode/countries explicitly rather than re-reading
// the cache itself, so it's trivially testable in isolation.
export const isCountryAllowed = (countryCode, mode, countries) => {
  if (mode === 'allow_all') return true;
  if (!countryCode) return true; // geoip miss -- fail open, never block on an unknown IP
  if (mode === 'whitelist') return countries.has(countryCode);
  if (mode === 'blacklist') return !countries.has(countryCode);
  return true;
};
```

- [ ] **Step 5: Syntax-check the util**

```bash
cd backend && node --check utils/geoRestriction.js
```
Expected: no output (success).

- [ ] **Step 6: Manually verify `isCountryAllowed`'s branches**

No test runner exists in this backend, so verify the pure function directly with a one-off ESM script (the package's `"type": "module"` means `node -e` needs `--input-type=module` for `import` syntax):

```bash
cd backend && node --input-type=module -e "
import { isCountryAllowed } from './utils/geoRestriction.js';
const cases = [
  [isCountryAllowed('US', 'allow_all', new Set()), true, 'allow_all always true'],
  [isCountryAllowed('US', 'whitelist', new Set(['US'])), true, 'whitelist: in list'],
  [isCountryAllowed('PK', 'whitelist', new Set(['US'])), false, 'whitelist: not in list'],
  [isCountryAllowed('US', 'blacklist', new Set(['US'])), false, 'blacklist: in list'],
  [isCountryAllowed('PK', 'blacklist', new Set(['US'])), true, 'blacklist: not in list'],
  [isCountryAllowed(undefined, 'blacklist', new Set(['US'])), true, 'unknown country fails open'],
];
let failed = false;
for (const [actual, expected, label] of cases) {
  const ok = actual === expected;
  console.log(ok ? 'PASS' : 'FAIL', '-', label);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
"
```
Expected: six `PASS` lines, exit code 0.

- [ ] **Step 7: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add backend/models/GeoRestriction.js backend/utils/geoRestriction.js backend/package.json backend/package-lock.json && git commit -m "feat: add GeoRestriction model and settings cache util"
```
(`package-lock.json` is gitignored in this repo — if `git add` reports it as ignored, that's expected; just confirm `package.json`'s new `geoip-lite` dependency line is staged.)

---

### Task 2: Carry the user's role in the JWT

**Files:**
- Modify: `backend/utils/auth.js:17-21` (`generateToken`), `backend/utils/auth.js:89-90` (`sendTokenResponse`'s call to it)
- Modify: `backend/controllers/authController.js:471` (`refreshToken`'s call to `generateToken`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `generateToken(userId, tokenVersion = 0, role)` — JWT payload now includes `role`. Every access token minted anywhere in the app (login, OTP verify, OAuth, refresh) now carries the user's role, which Task 3's `geoBlock` middleware reads to decide exemption.

- [ ] **Step 1: Update `generateToken`**

In `backend/utils/auth.js`, replace:

```js
export const generateToken = (userId, tokenVersion = 0) => {
  return jwt.sign({ id: userId, v: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN
  });
};
```

with:

```js
export const generateToken = (userId, tokenVersion = 0, role) => {
  return jwt.sign({ id: userId, v: tokenVersion, role }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN
  });
};
```

- [ ] **Step 2: Pass the role through in `sendTokenResponse`**

In the same file, replace:

```js
export const sendTokenResponse = async (user, statusCode, res, message = 'Success', req = null) => {
  const accessToken = generateToken(user._id, user.tokenVersion || 0);
```

with:

```js
export const sendTokenResponse = async (user, statusCode, res, message = 'Success', req = null) => {
  const accessToken = generateToken(user._id, user.tokenVersion || 0, user.role);
```

- [ ] **Step 3: Pass the role through in the standalone refresh-token call site**

In `backend/controllers/authController.js`, replace:

```js
    const accessToken = generateToken(user._id, user.tokenVersion || 0);
```

with:

```js
    const accessToken = generateToken(user._id, user.tokenVersion || 0, user.role);
```

(This is inside `refreshToken`, the one place that mints a token without going through `sendTokenResponse` — without this change, a token obtained via refresh would silently lose its `role` claim and lose admin geo-exemption after the first refresh cycle.)

- [ ] **Step 4: Syntax-check both files**

```bash
cd backend && node --check utils/auth.js && node --check controllers/authController.js
```
Expected: no output (success).

- [ ] **Step 5: Manually verify the JWT payload**

```bash
cd backend && node --input-type=module -e "
import { generateToken, verifyToken } from './utils/auth.js';
import dotenv from 'dotenv';
dotenv.config();
const token = generateToken('000000000000000000000001', 0, 'superadmin');
const decoded = verifyToken(token);
console.log(decoded.role === 'superadmin' ? 'PASS - role present' : 'FAIL - role missing: ' + JSON.stringify(decoded));
"
```
Expected: `PASS - role present`.

- [ ] **Step 6: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add backend/utils/auth.js backend/controllers/authController.js && git commit -m "feat: carry user role in the access-token JWT payload"
```

---

### Task 3: geoBlock middleware

**Files:**
- Create: `backend/middleware/geoBlock.js`
- Modify: `backend/models/SecurityLog.js:7-20` (add `'REGION_BLOCKED'` to the `SECURITY_EVENTS` enum array — this is where the enum is defined; `backend/utils/securityLog.js` only holds the `logSecurityEvent` helper that writes to it)

**Interfaces:**
- Consumes: `getSettings`, `isCountryAllowed` from `backend/utils/geoRestriction.js` (Task 1); `logSecurityEvent` from `backend/utils/securityLog.js`.
- Produces: `geoBlock` (named export) — an Express middleware `(req, res, next) => Promise<void>`, mounted globally in Task 4.

- [ ] **Step 1: Add the new security-log event type**

In `backend/models/SecurityLog.js`, replace:

```js
export const SECURITY_EVENTS = [
  'RATE_LIMIT_EXCEEDED',
  'LOGIN_FAILED',
  'LOGIN_SUCCESS',
  'ACCOUNT_LOCKED',
  'OTP_FAILED',
  'OTP_LOCKED',
  'OTP_VERIFIED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_SUCCESS',
  'PASSWORD_CHANGED',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'SESSION_REVOKED_ALL'
];
```

with:

```js
export const SECURITY_EVENTS = [
  'RATE_LIMIT_EXCEEDED',
  'LOGIN_FAILED',
  'LOGIN_SUCCESS',
  'ACCOUNT_LOCKED',
  'OTP_FAILED',
  'OTP_LOCKED',
  'OTP_VERIFIED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_SUCCESS',
  'PASSWORD_CHANGED',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'SESSION_REVOKED_ALL',
  'REGION_BLOCKED'
];
```

- [ ] **Step 2: Create the middleware**

`backend/middleware/geoBlock.js`:

```js
import jwt from 'jsonwebtoken';
import geoip from 'geoip-lite';
import { getSettings, isCountryAllowed } from '../utils/geoRestriction.js';
import { logSecurityEvent } from '../utils/securityLog.js';

const EXEMPT_ROLES = ['admin', 'moderator', 'team_member', 'superadmin'];

export const geoBlock = async (req, res, next) => {
  if (req.path === '/api/health') return next();

  // Best-effort role check -- this runs before authMiddleware.protect, and
  // must never itself become a source of 500s, so an invalid/missing/
  // expired token here just means "not exempt", not an error.
  try {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.cookies?.token;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (EXEMPT_ROLES.includes(decoded.role)) return next();
    }
  } catch { /* not exempt */ }

  const { mode, countries } = await getSettings();
  if (mode === 'allow_all') return next();

  const geo = geoip.lookup(req.ip);
  const countryCode = geo?.country;
  if (isCountryAllowed(countryCode, mode, countries)) return next();

  logSecurityEvent('REGION_BLOCKED', req, { meta: { countryCode, mode } });
  res.status(403).json({ success: false, code: 'REGION_BLOCKED', message: 'This service is not available in your region.' });
};
```

- [ ] **Step 3: Syntax-check both files**

```bash
cd backend && node --check models/SecurityLog.js && node --check middleware/geoBlock.js
```
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add backend/middleware/geoBlock.js backend/models/SecurityLog.js && git commit -m "feat: add geoBlock middleware and REGION_BLOCKED security event"
```

(Not yet wired into the app or behaviorally testable end-to-end — that happens in Task 4/5.)

---

### Task 4: Wire geoBlock into the server

**Files:**
- Modify: `backend/server.js`

**Interfaces:**
- Consumes: `geoBlock` from `backend/middleware/geoBlock.js` (Task 3).

- [ ] **Step 1: Add `trust proxy` and the `geoBlock` import**

Replace:

```js
import connectDB from './config/db.js';
import { connectRedis } from './config/redis.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import { initSocket } from './config/socket.js';
```

with:

```js
import connectDB from './config/db.js';
import { connectRedis } from './config/redis.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import { geoBlock } from './middleware/geoBlock.js';
import { initSocket } from './config/socket.js';
```

Replace:

```js
const app = express();
const server = http.createServer(app);
```

with:

```js
const app = express();
const server = http.createServer(app);

// Trust the first proxy hop (Nginx/PaaS load balancer) so req.ip reflects
// the real client address instead of the proxy's -- needed for accurate
// geo-blocking and for the IP-keyed rate limiters to work correctly behind
// any reverse proxy.
app.set('trust proxy', 1);
```

- [ ] **Step 2: Mount the middleware after cookies are parsed**

Replace:

```js
// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
```

with:

```js
// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Site-wide geo-restriction gate -- needs cookies (checks the access-token
// cookie as a fallback) and must run before any route is mounted.
app.use(geoBlock);
```

- [ ] **Step 3: Syntax-check**

```bash
cd backend && node --check server.js
```
Expected: no output (success).

- [ ] **Step 4: Verify the server still boots and normal traffic is unaffected**

Nodemon (already running per this session's dev setup) picks up the change automatically. Confirm:

```bash
curl -s -o /dev/null -w "health: %{http_code}\n" --max-time 5 http://localhost:5000/api/health
```
Expected: `health: 200`. If it's not `200`, run `touch backend/server.js`, wait ~8 seconds, and retry (see Global Constraints).

Then confirm an ordinary request still works normally (mode is still `allow_all` by default, so nothing should be blocked yet):

```bash
curl -s --max-time 10 -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d '{"identifier":"nonexistent@example.com","password":"wrong"}'
```
Expected: `{"success":false,"message":"Invalid credentials"}` (a normal auth failure, not a `403 REGION_BLOCKED` — proves the middleware is passing ordinary traffic through untouched in the default mode).

- [ ] **Step 5: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add backend/server.js && git commit -m "feat: wire geoBlock middleware into the server, trust first proxy hop"
```

---

### Task 5: Admin CRUD endpoints and full blocking behavior verification

**Files:**
- Modify: `backend/controllers/adminController.js` (add two functions + one import line)
- Modify: `backend/routes/adminRoutes.js:24-26`

**Interfaces:**
- Consumes: `GeoRestriction` model (Task 1), `getSettings`/`invalidateCache` from `backend/utils/geoRestriction.js` (Task 1).
- Produces: `getGeoRestriction`, `updateGeoRestriction` (named exports of `adminController.js`), mounted as `GET`/`PUT /api/admin/geo-restriction`.

- [ ] **Step 1: Add the import**

At the top of `backend/controllers/adminController.js`, add (next to the other model imports):

```js
import GeoRestriction from '../models/GeoRestriction.js';
import { getSettings, invalidateCache } from '../utils/geoRestriction.js';
```

- [ ] **Step 2: Add the two controller functions**

Append to `backend/controllers/adminController.js`:

```js
const VALID_GEO_MODES = ['allow_all', 'whitelist', 'blacklist'];

// @desc    Get current geo-restriction settings
// @route   GET /api/admin/geo-restriction
export const getGeoRestriction = async (req, res) => {
  try {
    const { mode, countries } = await getSettings();
    res.json({ success: true, mode, countries: [...countries] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update geo-restriction mode/country list
// @route   PUT /api/admin/geo-restriction
export const updateGeoRestriction = async (req, res) => {
  try {
    const { mode, countries } = req.body;
    if (!VALID_GEO_MODES.includes(mode)) {
      return res.status(400).json({ success: false, message: 'Invalid mode' });
    }
    if (!Array.isArray(countries) || countries.some((c) => typeof c !== 'string' || c.length !== 2)) {
      return res.status(400).json({ success: false, message: 'countries must be an array of 2-letter codes' });
    }

    let doc = await GeoRestriction.findOne();
    if (!doc) doc = new GeoRestriction();
    doc.mode = mode;
    doc.countries = countries.map((c) => c.toUpperCase());
    doc.updatedBy = req.user._id;
    await doc.save();
    invalidateCache();

    res.json({ success: true, mode: doc.mode, countries: doc.countries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

- [ ] **Step 3: Add the routes**

In `backend/routes/adminRoutes.js`, replace:

```js
router.get('/reviews', ...isAdmin, admin.getReviews);
router.post('/reviews/:id/moderate', ...isAdmin, admin.moderateReview);
export default router;
```

with:

```js
router.get('/reviews', ...isAdmin, admin.getReviews);
router.post('/reviews/:id/moderate', ...isAdmin, admin.moderateReview);
router.get('/geo-restriction', ...adminOnly, admin.getGeoRestriction);
router.put('/geo-restriction', ...adminOnly, admin.updateGeoRestriction);
export default router;
```

- [ ] **Step 4: Syntax-check**

```bash
cd backend && node --check controllers/adminController.js && node --check routes/adminRoutes.js
```
Expected: no output (success).

- [ ] **Step 5: Confirm the server is healthy, then mint an admin token for testing**

```bash
curl -s -o /dev/null -w "health: %{http_code}\n" --max-time 5 http://localhost:5000/api/health
```
Expected: `health: 200` (restart per Global Constraints if not).

There is no way to obtain a real login token via curl anymore (every password login now requires an OTP step the test script can't read), so mint one directly the same way this session has done for every prior admin/authenticated endpoint test — using the existing superadmin test account (`navtestuser`, id `6a749440031fa3afcf68dabc`, role `superadmin`):

```bash
cd backend && cat > _tmp_mint_admin.mjs << 'EOF'
import dotenv from 'dotenv';
dotenv.config();
import { generateToken } from './utils/auth.js';
console.log(generateToken('6a749440031fa3afcf68dabc', 0, 'superadmin'));
EOF
node _tmp_mint_admin.mjs
```

Copy the printed token for the remaining steps (referred to below as `$TOKEN`).

- [ ] **Step 6: Verify GET returns the default settings**

```bash
curl -s --max-time 10 http://localhost:5000/api/admin/geo-restriction -H "Authorization: Bearer $TOKEN"
```
Expected: `{"success":true,"mode":"allow_all","countries":[]}`.

- [ ] **Step 7: Verify PUT updates the settings, and GET reflects it**

```bash
curl -s --max-time 10 -X PUT http://localhost:5000/api/admin/geo-restriction \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"mode":"blacklist","countries":["US"]}'
echo ""
curl -s --max-time 10 http://localhost:5000/api/admin/geo-restriction -H "Authorization: Bearer $TOKEN"
```
Expected: both calls return `{"success":true,"mode":"blacklist","countries":["US"]}`.

- [ ] **Step 8: Verify a blacklisted country is actually blocked**

With `trust proxy` set to `1` (Task 4), a direct local `curl` connection is treated as the trusted proxy hop, so its `X-Forwarded-For` header is honored as `req.ip` — this is the standard way to simulate a specific origin IP against a local dev server. `8.8.8.8` (Google Public DNS) is a well-known, stable US-geolocated IP in the MaxMind data `geoip-lite` bundles:

```bash
curl -s --max-time 10 -w "\nHTTP %{http_code}\n" http://localhost:5000/api/health -H "X-Forwarded-For: 8.8.8.8"
```
Expected: `HTTP 200` — `/api/health` stays exempt even while blacklist mode is active.

```bash
curl -s --max-time 10 -w "\nHTTP %{http_code}\n" http://localhost:5000/api/posts/feed -H "X-Forwarded-For: 8.8.8.8"
```
Expected: `{"success":false,"code":"REGION_BLOCKED","message":"This service is not available in your region."}` with `HTTP 403`.

- [ ] **Step 9: Verify the admin role bypasses the block**

Same blacklist state, same spoofed US IP, but now with the admin token attached:

```bash
curl -s --max-time 10 -w "\nHTTP %{http_code}\n" http://localhost:5000/api/posts/feed \
  -H "X-Forwarded-For: 8.8.8.8" -H "Authorization: Bearer $TOKEN"
```
Expected: **not** a `403 REGION_BLOCKED` (some other status — likely `200` or a normal data response — proving the exempt role short-circuited the geo-check before it ever ran).

- [ ] **Step 10: Verify whitelist mode blocks a country not on the list**

```bash
curl -s --max-time 10 -X PUT http://localhost:5000/api/admin/geo-restriction \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"mode":"whitelist","countries":["PK"]}'
echo ""
curl -s --max-time 10 -w "\nHTTP %{http_code}\n" http://localhost:5000/api/posts/feed -H "X-Forwarded-For: 8.8.8.8"
```
Expected: PUT succeeds; the second call returns `403 REGION_BLOCKED` (US, via the spoofed 8.8.8.8, is not in the `['PK']` whitelist).

- [ ] **Step 11: Reset to the safe default and clean up**

```bash
curl -s --max-time 10 -X PUT http://localhost:5000/api/admin/geo-restriction \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"mode":"allow_all","countries":[]}'
```
Expected: `{"success":true,"mode":"allow_all","countries":[]}` — confirms the dev database isn't left in a restricted state.

```bash
cd backend && rm -f _tmp_mint_admin.mjs
```

- [ ] **Step 12: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add backend/controllers/adminController.js backend/routes/adminRoutes.js && git commit -m "feat: add admin geo-restriction CRUD endpoints"
```

---

### Task 6: Country data file

**Files:**
- Create: `frontend/src/lib/countries.js`
- Modify: `frontend/package.json` (via `npm install`)

**Interfaces:**
- Produces: `COUNTRIES` (named export) — `Array<{ code: string, name: string }>`, all ISO 3166-1 assigned countries, sorted by name. Consumed by Task 11's `AdminCountries.jsx`.

- [ ] **Step 1: Install `country-list`**

```bash
cd frontend && npm install country-list
```

- [ ] **Step 2: Create the data file**

`frontend/src/lib/countries.js`:

```js
import { getData } from 'country-list';

// { code: 'US', name: 'United States' } for every ISO 3166-1 assigned
// country, sorted alphabetically by name for the admin country picker.
export const COUNTRIES = getData()
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name));
```

- [ ] **Step 3: Verify the data loads and has the expected shape**

```bash
cd frontend && node --input-type=module -e "
import { COUNTRIES } from './src/lib/countries.js';
const ok = Array.isArray(COUNTRIES) && COUNTRIES.length > 190 &&
  COUNTRIES.every((c) => typeof c.code === 'string' && c.code.length === 2 && typeof c.name === 'string');
console.log(ok ? 'PASS - ' + COUNTRIES.length + ' countries loaded' : 'FAIL');
console.log(COUNTRIES.slice(0, 3));
"
```
Expected: `PASS - <N> countries loaded` where N is comfortably above 190, plus a preview of the first 3 (alphabetically first) entries.

- [ ] **Step 4: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add frontend/src/lib/countries.js frontend/package.json frontend/package-lock.json && git commit -m "feat: add static ISO 3166-1 country list for the admin country picker"
```

---

### Task 7: Flag icons dependency

**Files:**
- Modify: `frontend/package.json` (via `npm install`)
- Modify: `frontend/src/main.jsx`

**Interfaces:**
- Produces: the CSS classes `fi` and `fi-<lowercase-code>` (e.g. `fi fi-us`) become globally available for rendering a flag as `<span className="fi fi-us" />`. Consumed by Task 11's `AdminCountries.jsx`.

- [ ] **Step 1: Install `flag-icons`**

```bash
cd frontend && npm install flag-icons
```

- [ ] **Step 2: Import the CSS globally**

Replace `frontend/src/main.jsx`:

```js
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

with:

```js
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import 'flag-icons/css/flag-icons.min.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 3: Verify Vite compiles with no errors**

The dev server (already running per this session's setup) picks this up via HMR. Check its log for a clean reload with no error lines mentioning `main.jsx` or `flag-icons` after saving.

- [ ] **Step 4: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add frontend/src/main.jsx frontend/package.json frontend/package-lock.json && git commit -m "feat: add flag-icons for rendering country flags"
```

---

### Task 8: API client additions

**Files:**
- Modify: `frontend/src/services/api.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `adminAPI.getGeoRestriction()`, `adminAPI.updateGeoRestriction({ mode, countries })`. Consumed by Task 11's `AdminCountries.jsx`.

- [ ] **Step 1: Add the two admin API calls**

In `frontend/src/services/api.js`, find the `adminAPI` object (it ends with `moderateReview`) and add the two new calls right after it:

```js
  moderateReview: (id, action) => API.post(`/admin/reviews/${id}/moderate`, { action }),
  getGeoRestriction: () => API.get('/admin/geo-restriction'),
  updateGeoRestriction: (data) => API.put('/admin/geo-restriction', data),
```

(i.e. replace the existing `moderateReview: (id, action) => API.post(\`/admin/reviews/${id}/moderate\`, { action }),` line with all three lines above.)

- [ ] **Step 2: Add the `REGION_BLOCKED` redirect to the response interceptor**

Find this block in `frontend/src/services/api.js`:

```js
API.interceptors.response.use(
  (res) => res,
  (err) => {
    const { response, config } = err;
    const isRefreshExempt = !config || AUTH_ENDPOINTS_WITHOUT_REFRESH.some((p) => config.url?.includes(p));

    if (response?.status !== 401 || config._retry || isRefreshExempt) {
      if (response?.status === 401) bounceToLogin();
      return Promise.reject(err);
    }
```

Replace it with:

```js
API.interceptors.response.use(
  (res) => res,
  (err) => {
    const { response, config } = err;

    // A blocked region makes the entire app unusable -- same reasoning as
    // the 401 bounce-to-login below, this is a hard redirect out of the
    // SPA's state rather than something a component could meaningfully
    // recover from.
    if (response?.status === 403 && response?.data?.code === 'REGION_BLOCKED') {
      window.location.href = '/blocked';
      return Promise.reject(err);
    }

    const isRefreshExempt = !config || AUTH_ENDPOINTS_WITHOUT_REFRESH.some((p) => config.url?.includes(p));

    if (response?.status !== 401 || config._retry || isRefreshExempt) {
      if (response?.status === 401) bounceToLogin();
      return Promise.reject(err);
    }
```

- [ ] **Step 3: Verify Vite compiles with no errors**

Check the dev server log for a clean HMR reload of `api.js` with no error lines.

- [ ] **Step 4: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add frontend/src/services/api.js && git commit -m "feat: add geo-restriction admin API calls and REGION_BLOCKED redirect"
```

---

### Task 9: Blocked page and route

**Files:**
- Create: `frontend/src/pages/BlockedPage.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: nothing (static page, no props, no API calls).
- Produces: the `/blocked` route, targeted by Task 8's interceptor redirect.

- [ ] **Step 1: Create the page**

`frontend/src/pages/BlockedPage.jsx`:

```jsx
import { FiGlobe } from 'react-icons/fi';

export default function BlockedPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex items-center justify-center p-3 sm:p-4">
      <div className="card p-6 sm:p-8 w-full max-w-[380px] text-center animate-fade-in">
        <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full bg-pink-500/10 flex items-center justify-center">
          <FiGlobe className="w-7 h-7 sm:w-8 sm:h-8 text-pink-500" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold mb-2">Not available in your region</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          This service isn't available where you're currently located.
        </p>
      </div>
    </div>
  );
}
```

(No navigation, no retry button — matches the design spec: retrying does nothing useful since the block is server-side and IP-based. Layout follows the same responsive centered-card pattern already used by `ForgotPasswordPage`/`OTPPage`.)

- [ ] **Step 2: Register the route**

In `frontend/src/App.jsx`, add the import next to the other page imports:

```js
import NotFoundPage from './pages/NotFoundPage';
```
becomes:
```js
import NotFoundPage from './pages/NotFoundPage';
import BlockedPage from './pages/BlockedPage';
```

Add the route — replace:

```jsx
      {/* 404 Not Found */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
```

with:

```jsx
      {/* Shown when the geo-restriction middleware returns 403 REGION_BLOCKED
          (see services/api.js's response interceptor) */}
      <Route path="/blocked" element={<BlockedPage />} />

      {/* 404 Not Found */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
```

(Placed as a plain top-level route, not wrapped in `ProtectedRoute`/`PublicRoute` — a blocked visitor is neither guaranteed to be logged out nor logged in, and the page must render regardless of auth state.)

- [ ] **Step 3: Verify Vite compiles with no errors, then manually visit the page**

Check the dev server log for a clean HMR reload. Then open `http://localhost:5173/blocked` in a browser and confirm the page renders (icon, heading, message, no navigation).

- [ ] **Step 4: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add frontend/src/pages/BlockedPage.jsx frontend/src/App.jsx && git commit -m "feat: add /blocked page for region-blocked visitors"
```

---

### Task 10: Admin nav item

**Files:**
- Modify: `frontend/src/components/admin/AdminLayout.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a visible "Countries" sidebar link pointing at `/admin/countries` (the route Task 11 registers).

- [ ] **Step 1: Add `FiGlobe` to the icon import**

Replace:

```js
import { FiUsers, FiFileText, FiBarChart2, FiArrowLeft, FiSun, FiMoon, FiLogOut, FiFlag, FiStar, FiBriefcase, FiMenu, FiX } from 'react-icons/fi';
```

with:

```js
import { FiUsers, FiFileText, FiBarChart2, FiArrowLeft, FiSun, FiMoon, FiLogOut, FiFlag, FiStar, FiBriefcase, FiMenu, FiX, FiGlobe } from 'react-icons/fi';
```

- [ ] **Step 2: Add the nav entry**

Replace:

```js
  const navItems = [
    { to: '/admin', label: 'Dashboard', Icon: FiBarChart2, end: true },
    { to: '/admin/users', label: 'Users', Icon: FiUsers },
    { to: '/admin/team', label: 'Team', Icon: FiBriefcase },
    { to: '/admin/posts', label: 'Posts', Icon: FiFileText },
    { to: '/admin/reports', label: 'Reports', Icon: FiFlag },
    { to: '/admin/reviews', label: 'Reviews', Icon: FiStar },
  ];
```

with:

```js
  const navItems = [
    { to: '/admin', label: 'Dashboard', Icon: FiBarChart2, end: true },
    { to: '/admin/users', label: 'Users', Icon: FiUsers },
    { to: '/admin/team', label: 'Team', Icon: FiBriefcase },
    { to: '/admin/posts', label: 'Posts', Icon: FiFileText },
    { to: '/admin/reports', label: 'Reports', Icon: FiFlag },
    { to: '/admin/reviews', label: 'Reviews', Icon: FiStar },
    { to: '/admin/countries', label: 'Countries', Icon: FiGlobe },
  ];
```

- [ ] **Step 3: Verify Vite compiles with no errors**

Check the dev server log for a clean HMR reload of `AdminLayout.jsx`.

- [ ] **Step 4: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add frontend/src/components/admin/AdminLayout.jsx && git commit -m "feat: add Countries nav item to the admin sidebar"
```

(The link will 404 until Task 11 registers the route it points to — expected at this point in the plan.)

---

### Task 11: AdminCountries page

**Files:**
- Create: `frontend/src/pages/admin/AdminCountries.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `adminAPI.getGeoRestriction`/`updateGeoRestriction` (Task 8), `COUNTRIES` from `frontend/src/lib/countries.js` (Task 6), `flag-icons` CSS classes (Task 7).
- Produces: the `/admin/countries` route.

- [ ] **Step 1: Create the page**

`frontend/src/pages/admin/AdminCountries.jsx`:

```jsx
import { useState, useEffect, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';
import { adminAPI } from '../../services/api';
import { COUNTRIES } from '../../lib/countries';
import toast from 'react-hot-toast';

const MODES = [
  { key: 'allow_all', label: 'Allow all' },
  { key: 'whitelist', label: 'Whitelist' },
  { key: 'blacklist', label: 'Blacklist' },
];

export default function AdminCountries() {
  const [mode, setMode] = useState('allow_all');
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminAPI.getGeoRestriction();
        setMode(data.mode);
        setSelected(new Set(data.countries));
      } catch {
        toast.error('Failed to load geo-restriction settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [search]);

  const toggle = (code) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await adminAPI.updateGeoRestriction({ mode, countries: [...selected] });
      setSelected(new Set(data.countries));
      toast.success('Geo-restriction settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-[var(--text-secondary)]">Loading...</div>;
  }

  return (
    <div className="max-w-[600px] p-4 sm:p-6">
      <h1 className="text-xl font-bold mb-1">Country management</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-5">
        Control which countries can access NexVibe. Default is "Allow all" -- no restriction.
      </p>

      <div className="flex gap-2 mb-5 border border-[var(--border)] rounded-xl p-1">
        {MODES.map((m) => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mode === m.key ? 'bg-pink-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'allow_all' ? (
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          No restriction — everyone can access NexVibe.
        </p>
      ) : (
        <>
          <div className="relative mb-3">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input type="text" placeholder="Search countries..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9" />
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-2">{selected.size} countries selected</p>
          <div className="border border-[var(--border)] rounded-2xl divide-y divide-[var(--border)] max-h-[400px] overflow-y-auto">
            {filtered.map((c) => (
              <label key={c.code} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
                <span className={`fi fi-${c.code.toLowerCase()} flex-shrink-0 rounded-sm`} />
                <span className="text-sm flex-1 min-w-0 truncate">{c.name}</span>
                <span className="text-xs text-[var(--text-muted)]">{c.code}</span>
                <input type="checkbox" checked={selected.has(c.code)} onChange={() => toggle(c.code)}
                  className="w-4 h-4 accent-pink-500 flex-shrink-0" />
              </label>
            ))}
          </div>
        </>
      )}

      <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-2.5 rounded-xl mt-5">
        {saving ? 'Saving...' : 'Save changes'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Register the route**

In `frontend/src/App.jsx`, add the import next to `AdminReviews`:

```js
import AdminReviews from './pages/admin/AdminReviews';
```
becomes:
```js
import AdminReviews from './pages/admin/AdminReviews';
import AdminCountries from './pages/admin/AdminCountries';
```

Add the route — replace:

```jsx
        <Route path="reviews" element={<AdminReviews />} />
      </Route>
```

with:

```jsx
        <Route path="reviews" element={<AdminReviews />} />
        <Route path="countries" element={<AdminCountries />} />
      </Route>
```

- [ ] **Step 3: Verify Vite compiles with no errors**

Check the dev server log for a clean HMR reload with no errors.

- [ ] **Step 4: Manual browser verification**

Log into the app as the `navtestuser` / `khizarmushtaq1188@gmail.com` superadmin test account, navigate to `/admin/countries`, and confirm:
- The three mode buttons render and switching between them shows/hides the country list correctly.
- Typing in the search box filters the list by name and by 2-letter code.
- Flags render next to each country name (not blank boxes — confirms `flag-icons` CSS loaded correctly).
- Checking a few countries in Whitelist mode, clicking "Save changes", then reloading the page shows the same mode and the same countries still checked (confirms the round-trip through the backend from Task 5 works from the UI, not just curl).
- After confirming persistence works, switch back to "Allow all" and save, leaving the dev database in the safe default state.

- [ ] **Step 5: Commit**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git add frontend/src/pages/admin/AdminCountries.jsx frontend/src/App.jsx && git commit -m "feat: add AdminCountries page with mode switch and flag-illustrated country picker"
```

---

### Task 12: Final end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Confirm both dev servers are healthy**

```bash
curl -s -o /dev/null -w "backend: %{http_code}\n" --max-time 5 http://localhost:5000/api/health
curl -s -o /dev/null -w "frontend: %{http_code}\n" --max-time 5 http://localhost:5173/
```
Expected: both `200`.

- [ ] **Step 2: Confirm the geo-restriction settings are back at the safe default**

```bash
curl -s --max-time 10 http://localhost:5000/api/admin/geo-restriction -H "Authorization: Bearer $TOKEN"
```
(Mint a fresh `$TOKEN` the same way as Task 5, Step 5, if the previous one has expired — access tokens are 15 minutes.)
Expected: `{"success":true,"mode":"allow_all","countries":[]}`.

- [ ] **Step 3: Confirm ordinary, unauthenticated traffic is unaffected**

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 http://localhost:5000/api/health
```
Expected: `200`.

- [ ] **Step 4: Confirm the admin nav, page, and blocked page all render correctly in the browser**

- Visit `/admin` while logged in as the superadmin test account, confirm "Countries" appears in the sidebar and navigates to a working page (re-verifies Task 10/11 together, post-final-state).
- Visit `/blocked` directly, confirm it renders (re-verifies Task 9).

- [ ] **Step 5: Final commit (if any stray changes remain)**

```bash
cd "F:\Programming\Projects\FullStack\Nexvibe\Nexvibe" && git status --porcelain
```
Expected: empty (every task already committed its own changes). If anything unexpected shows up, review it before deciding whether to commit or discard.
