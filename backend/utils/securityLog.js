import SecurityLog from '../models/SecurityLog.js';

// Fire-and-forget: a logging failure must never break the auth flow it's
// observing, so errors are swallowed (and surfaced only to the console).
export const logSecurityEvent = (event, req, extra = {}) => {
  const { userId, email, meta } = extra;
  SecurityLog.create({
    event,
    user: userId,
    email,
    ip: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.headers?.['user-agent']?.substring(0, 200),
    route: req?.originalUrl,
    meta
  }).catch((err) => console.error('SecurityLog write failed:', err.message));
};
