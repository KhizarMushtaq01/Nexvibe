import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import RefreshToken from '../models/RefreshToken.js';

// Short-lived access token; a stolen one is only useful for a few minutes.
// Kept separate from JWT_EXPIRE (which pre-existing deployments may already
// have set to '7d' for the old single-token scheme) so upgrading doesn't
// silently change behavior for anyone relying on that env var elsewhere.
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRE || '15m';
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = (parseInt(process.env.REFRESH_TOKEN_EXPIRE_DAYS, 10) || 7) * 24 * 60 * 60 * 1000;

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// `v` (tokenVersion) lets us invalidate every access token already handed
// out for a user in one write (see User.bumpTokenVersion + authMiddleware).
export const generateToken = (userId, tokenVersion = 0) => {
  return jwt.sign({ id: userId, v: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN
  });
};

export const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

// Issues a new opaque refresh token, persists only its hash, and returns the
// raw value to hand to the client (cookie + JSON body).
export const issueRefreshToken = async (user, req) => {
  const raw = crypto.randomBytes(40).toString('hex');
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(raw),
    deviceInfo: {
      ip: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent']?.substring(0, 200)
    },
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
  });
  return raw;
};

// Looks up an active (not revoked/expired) refresh token by its raw value.
export const findActiveRefreshToken = async (raw) => {
  if (!raw) return null;
  const doc = await RefreshToken.findOne({ tokenHash: hashToken(raw) });
  if (!doc) return null;
  return doc;
};

// One-time-use rotation: the presented token is revoked and chained to a
// freshly issued replacement. If a caller ever presents a token that is
// already revoked, that's a strong signal of theft/replay -- the caller
// (authController.refreshToken) treats that as reuse detection and revokes
// the whole session family.
export const rotateRefreshToken = async (activeDoc, user, req) => {
  const newRaw = await issueRefreshToken(user, req);
  activeDoc.revokedAt = new Date();
  activeDoc.replacedByTokenHash = hashToken(newRaw);
  await activeDoc.save();
  return newRaw;
};

export const revokeRefreshTokenByRaw = async (raw) => {
  if (!raw) return;
  await RefreshToken.updateOne(
    { tokenHash: hashToken(raw), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
};

export const revokeAllUserSessions = async (userId) => {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } }
  );
};

const stripSensitiveFields = (user) => {
  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.password;
  delete userObj.otpHash;
  delete userObj.otpExpiry;
  delete userObj.emailVerifyToken;
  delete userObj.passwordResetToken;
  delete userObj.twoFactorSecret;
  delete userObj.twoFactorBackupCodes;
  return userObj;
};

export const sendTokenResponse = async (user, statusCode, res, message = 'Success', req = null) => {
  const accessToken = generateToken(user._id, user.tokenVersion || 0);
  const refreshToken = await issueRefreshToken(user, req);

  const accessCookieOptions = {
    expires: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
  };

  // Scoped to /api/auth so the refresh cookie isn't replayed on every
  // request -- only sent to the endpoints that actually need it.
  const refreshCookieOptions = {
    expires: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
    path: '/api/auth'
  };

  res
    .status(statusCode)
    .cookie('token', accessToken, accessCookieOptions)
    .cookie('refreshToken', refreshToken, refreshCookieOptions)
    .json({
      success: true,
      message,
      token: accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_MS / 1000,
      user: stripSensitiveFields(user)
    });
};
