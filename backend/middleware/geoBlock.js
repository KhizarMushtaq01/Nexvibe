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
