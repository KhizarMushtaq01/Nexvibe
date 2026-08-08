# Country Management — Design

## Problem

There is no way to restrict which countries can use NexVibe. The site needs
a site-wide geo-restriction control: an admin-configurable whitelist,
blacklist, or allow-all mode, enforced on every request, with a country
management tab in the admin panel (searchable list of countries, flags,
one active mode at a time).

## Goals

- One active mode at a time: `allow_all` (default), `whitelist` (only
  listed countries may use the site), or `blacklist` (listed countries are
  blocked, everyone else allowed).
- Enforced globally, on (almost) every request — not just signup/login.
- Country detected from the request IP via a local/offline GeoIP database
  (`geoip-lite`) — no external API call, no per-request network latency.
- Admin/moderator/team/superadmin roles are exempt from the block, so an
  admin can never lock themselves out of managing the panel.
- `/api/health` is exempt (uptime monitoring must keep working regardless).
- A blocked visitor gets a clear `403` with a dedicated frontend page
  ("not available in your region"), not a generic error.
- Admin UI: a "Countries" tab with a 3-way mode switch and a searchable,
  flag-illustrated list of ~250 ISO 3166-1 countries to build the active
  mode's list from.

## Non-goals (deferred, not part of this change)

- No per-user "detected country" field or display anywhere in the app —
  this is a pure access-gate, not a profile/analytics feature.
- No external geolocation API integration (accuracy vs. latency/cost
  trade-off was decided in favor of the local database).
- No historical analytics/dashboard of visitor countries.
- No IP allowlist/denylist (individual IPs) — country-level only.
- No automatic content localization based on country.

## Backend

### `backend/models/GeoRestriction.js` (new)

A single-document "settings" collection (same pattern as most app-config
singletons: one document, upserted in place, read into an in-memory cache).

```js
import mongoose from 'mongoose';

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

### `backend/utils/geoRestriction.js` (new)

- `getSettings()` — returns the cached `{ mode, countries: Set<string> }`,
  loading it from Mongo on first call (creating the default `allow_all`
  document if none exists yet) and caching it in a module-level variable.
- `invalidateCache()` — called by the admin `PUT` handler right after
  saving, so the very next request picks up the new settings instead of
  waiting for the process to restart.
- `isCountryAllowed(countryCode, mode, countries)` — pure function, takes
  the mode/countries explicitly (rather than re-reading the cache itself)
  so it's trivially testable in isolation: `allow_all` → always `true`;
  `whitelist` → `countries.has(countryCode)`; `blacklist` →
  `!countries.has(countryCode)`; an unknown/undetected `countryCode` (geoip
  miss) → always `true` (fail-open, matches the audit's "never silently
  degrade legitimate traffic" precedent set for the Redis rate-limit
  fallback).

### `backend/middleware/geoBlock.js` (new)

```js
import geoip from 'geoip-lite';
import { getSettings, isCountryAllowed } from '../utils/geoRestriction.js';
import jwt from 'jsonwebtoken';
import { logSecurityEvent } from '../utils/securityLog.js';

const EXEMPT_ROLES = ['admin', 'moderator', 'team_member', 'superadmin'];

export const geoBlock = async (req, res, next) => {
  if (req.path === '/api/health') return next();

  // Best-effort role check -- this middleware runs before `protect`, and
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

Note: the JWT payload from `utils/auth.js`'s `generateToken` currently
encodes only `{ id, v }` (see the earlier security-audit work), not
`role` — this design adds `role` to that payload so this middleware can
check it without a DB round-trip on every single request. `authMiddleware.
protect` already re-fetches the full user from the DB independently, so
this is purely an optimization for the geo-block path and doesn't change
`protect`'s own authorization guarantees.

### `backend/utils/auth.js`

`generateToken(userId, tokenVersion, role)` gains a third parameter, added
to the JWT payload as `role`. `sendTokenResponse` passes `user.role`
through when calling it. This lets `geoBlock` check the exempt-role list
directly off the token's claims instead of hitting the DB on every request;
`authMiddleware.protect` is unaffected — it already re-fetches the full
user from Mongo independently and does not rely on this new claim for its
own authorization decisions.

### `backend/server.js`

- `app.set('trust proxy', 1);` — added near the top, before route
  registration. Without it, `req.ip` behind a reverse proxy resolves to the
  proxy's address, not the client's, which would make geo-blocking (and
  incidentally, the existing IP-keyed rate limiters) inaccurate in any
  deployment that sits behind one hop of proxy (Nginx, a PaaS load
  balancer, etc.) — the standard, minimal-trust setting for that case.
- `app.use(geoBlock);` — registered after `cors`/body-parsers (needs
  `req.cookies`, so after `cookieParser()`), before the route mounts.

### `backend/controllers/adminController.js` (add two functions)

- `getGeoRestriction(req, res)` — `GET /admin/geo-restriction`. Returns the
  current `{ mode, countries }` document (creating the default one on first
  access, via `getSettings()`).
- `updateGeoRestriction(req, res)` — `PUT /admin/geo-restriction`. Body
  `{ mode, countries }`. Validates `mode` is one of the three values and
  `countries` is an array of 2-letter strings; upserts the singleton
  document, sets `updatedBy: req.user._id`, calls `invalidateCache()`,
  returns the saved document.

### `backend/routes/adminRoutes.js` (add two routes)

Uses `adminOnly` (`admin`/`superadmin`, not `moderator`) — a site-wide
access gate is sensitive enough to match the existing bar set for
`changeUserRole`/`deleteUserAdmin`/`createTeamMember`:

```js
router.get('/geo-restriction', ...adminOnly, admin.getGeoRestriction);
router.put('/geo-restriction', ...adminOnly, admin.updateGeoRestriction);
```

### `backend/utils/securityLog.js`

Add `'REGION_BLOCKED'` to the `SECURITY_EVENTS` enum array.

### `backend/package.json`

Add `geoip-lite` as a dependency (installed via `npm install`, not just
written into the file).

## Frontend

### `frontend/src/lib/countries.js` (new)

A static array of ISO 3166-1 alpha-2 entries: `{ code: 'US', name: 'United
States' }` for all ~249 assigned codes, sorted alphabetically by name.
Plain data, no dependency — generated once at implementation time from the
standard ISO 3166-1 list.

### `flag-icons` (new frontend dependency)

Provides `fi fi-<lowercased-code>` CSS classes that render a country's flag
as a background-image SVG (`import 'flag-icons/css/flag-icons.min.css'`
once, e.g. in `main.jsx`). Used as `<span className={`fi fi-${code.toLowerCase()}`} />`
wherever a flag is shown.

### `frontend/src/services/api.js`

Add to `adminAPI`:

```js
getGeoRestriction: () => API.get('/admin/geo-restriction'),
updateGeoRestriction: (data) => API.put('/admin/geo-restriction', data),
```

Response interceptor: alongside the existing 401 handling, add a check for
`response?.data?.code === 'REGION_BLOCKED'` → `window.location.href = '/blocked'`
(a hard redirect, same reasoning as the existing 401 bounce-to-login — the
whole app is unusable at that point, no point staying in the SPA's state).

### `frontend/src/pages/BlockedPage.jsx` (new)

A standalone page (outside `MainLayout`/`AdminLayout`, same tier as
`LoginPage`) with a simple centered message: "This service is not
available in your region," no navigation, no retry button (retrying does
nothing useful — the block is server-side and IP-based).

### `frontend/src/pages/admin/AdminCountries.jsx` (new)

- Segmented 3-way control at the top: `Allow all` / `Whitelist` /
  `Blacklist`, mirroring the visual style of existing tab controls
  (`AdminReviews.jsx`'s status tabs).
- When `Allow all` is selected: just an explanatory line ("No restriction
  — everyone can access NexVibe") and the Save button; the country list
  below is hidden (irrelevant in this mode).
- When `Whitelist`/`Blacklist` is selected: a search input (filters the
  ~249-country list by name/code client-side) above a scrollable checklist
  — each row: flag + name + code + checkbox, matching `ToggleRow`'s general
  visual language from the settings page. A live count above the list
  ("12 countries selected").
- Save button calls `adminAPI.updateGeoRestriction({ mode, countries })`.
  Loads current settings via `adminAPI.getGeoRestriction()` on mount.
- No extra confirmation modal — the visible "N countries selected" count
  before saving is the safeguard against an accidental empty-whitelist
  lockout, consistent with keeping this feature simple per the approved
  design.

### `frontend/src/components/admin/AdminLayout.jsx`

Add one entry to `navItems`, after `Reviews`, using `FiGlobe` (added to the
existing `react-icons/fi` import line):

```js
{ to: '/admin/countries', label: 'Countries', Icon: FiGlobe },
```

### `frontend/src/App.jsx`

- Add `AdminCountries` to the admin route group, next to `AdminReviews`.
- Add a top-level `<Route path="/blocked" element={<BlockedPage />} />`
  (public, no auth guard — a blocked visitor isn't logged in by
  definition).

## Responsiveness

`AdminCountries.jsx`'s country checklist follows the same scrollable,
single-column list pattern as `AdminReviews.jsx`/`AdminReports.jsx`
(already responsive down to mobile widths) — no new responsive-design
surface. `BlockedPage.jsx` reuses the same centered-card pattern already
established for `ForgotPasswordPage`/`OTPPage` in this session, which is
already responsive.

## Testing

- Backend: `npm install geoip-lite` then `node --check` on every new/edited
  file. Manual `curl` tests against `/api/admin/geo-restriction` (GET/PUT)
  with an admin token. Manual test of the block itself: temporarily set
  `blacklist` mode with a country matched by a known test IP (geoip-lite
  ships sample/test ranges), confirm `403 REGION_BLOCKED`; confirm an
  admin-role token still gets through in that same blocked state; confirm
  `/api/health` still returns `200` regardless of mode.
- Frontend: Vite HMR compiles clean (checked after each edit, consistent
  with this session's established verification pattern); manual browser
  check of `/admin/countries` — mode switch, search filter, flags render,
  save persists (reload the page and confirm the saved mode/list comes
  back); manual check that `/blocked` renders correctly.
- After both sides pass, restore `allow_all` mode before finishing, so the
  live dev database isn't left in a restricted state.
