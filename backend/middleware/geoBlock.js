import jwt from 'jsonwebtoken';
import geoip from 'geoip-lite';
import { getSettings, isCountryAllowed } from '../utils/geoRestriction.js';
import { logSecurityEvent } from '../utils/securityLog.js';

const EXEMPT_ROLES = ['admin', 'moderator', 'team_member', 'superadmin'];

// Paths needed to *obtain* a token in the first place. OTP verification is
// required to complete every password login (the access token isn't issued
// until /api/auth/verify-otp succeeds), so exempting only /login would still
// lock a blocked admin out at the OTP step. Every other route in the app
// remains fully geo-gated, so a blocked non-admin gains nothing beyond being
// able to attempt authentication -- they still can't use anything afterward.
// This is what actually fixes the lockout: an admin with no token at all,
// from a blocked region, can now complete the full login+OTP handshake and
// get a token before ever needing the role-based exemption below.
const AUTH_BOOTSTRAP_PATHS = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/verify-otp',
  '/api/auth/resend-otp',
  '/api/auth/refresh-token',
];

export const geoBlock = async (req, res, next) => {
  if (AUTH_BOOTSTRAP_PATHS.includes(req.path)) return next();

  // Best-effort role check -- this runs before authMiddleware.protect, and
  // must never itself become a source of 500s, so an invalid/missing/
  // expired token here just means "not exempt", not an error.
  try {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.cookies?.token;
    if (token) {
      // ignoreExpiration: this affects only whether geoBlock treats the
      // token as exempt -- it grants no real authorization. The destination
      // route's own authMiddleware.protect still runs jwt.verify normally
      // (no ignoreExpiration) and will correctly reject a genuinely expired
      // token with a real 401. Without this, an admin's token naturally
      // expiring mid-session (15-min access tokens) while in a blocked
      // region would get a 403 REGION_BLOCKED from geoBlock itself before
      // ever reaching protect -- and since the frontend redirects to
      // /blocked on that response, the admin would never get the normal 401
      // that triggers a transparent token refresh. Ignoring expiration here
      // just lets a stale-but-authentically-signed token keep passing this
      // exemption check so the request reaches protect, which then handles
      // real expiry/refresh correctly.
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
      if (EXEMPT_ROLES.includes(decoded.role)) return next();
    }
  } catch { /* not exempt */ }

  let settings;
  try {
    settings = await getSettings();
  } catch (err) {
    console.error('geoBlock: settings lookup failed, allowing request:', err.message);
    return next();
  }
  const { mode, countries } = settings;
  if (mode === 'allow_all') return next();

  const geo = geoip.lookup(req.ip);
  const countryCode = geo?.country;
  if (isCountryAllowed(countryCode, mode, countries)) return next();

  logSecurityEvent('REGION_BLOCKED', req, { meta: { countryCode, mode } });
  res.status(403).json({ success: false, code: 'REGION_BLOCKED', message: 'This service is not available in your region.' });
};
