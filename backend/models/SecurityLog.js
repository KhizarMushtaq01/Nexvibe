import mongoose from 'mongoose';

// Lightweight, structured audit trail for authentication-security events.
// This is a log sink, not a monitoring/alerting system -- shipping these
// events to an actual dashboard (Datadog/Grafana/etc.) is a separate,
// infra-level decision (see audit report "out of scope" notes).
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

const securityLogSchema = new mongoose.Schema({
  event: { type: String, enum: SECURITY_EVENTS, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  email: String,
  ip: String,
  userAgent: String,
  route: String,
  meta: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

// Keep 90 days of security history, then let Mongo expire it automatically.
securityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

const SecurityLog = mongoose.model('SecurityLog', securityLogSchema);
export default SecurityLog;
