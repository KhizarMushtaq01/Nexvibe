import crypto from 'crypto';
import appleSignin from 'apple-signin-auth';
import User from '../models/User.js';
import twilioClient from '../config/twilio.js';
import {
  sendTokenResponse,
  generateToken,
  findActiveRefreshToken,
  rotateRefreshToken,
  revokeRefreshTokenByRaw,
  revokeAllUserSessions
} from '../utils/auth.js';
import { validatePasswordStrength } from '../utils/validators.js';
import { logSecurityEvent } from '../utils/securityLog.js';
import { deliverPhoneOTP, deliverUserOTP } from '../utils/otpDelivery.js';
import {
  sendVerificationEmail,
  sendOTPEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendNewLoginEmail,
  sendWelcomeEmail,
  sendTwoFactorEnabledEmail
} from '../utils/email.js';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
  path: '/api/auth'
};

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax'
};

// @desc    Register user
// @route   POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { fullName, username, email, password, phone } = req.body;

    if (!fullName || !username || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }
    // Email and username used to both be mandatory; username is now purely a
    // display handle (see login()), so signup just needs one reachable
    // contact method -- either works.
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Please provide an email or phone number' });
    }
    if (!email && phone && !twilioClient) {
      // Fail before touching the DB at all if SMS can't be sent -- no point
      // running the uniqueness query for an account we can't verify anyway.
      return res.status(500).json({ success: false, message: 'SMS delivery is not configured' });
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return res.status(400).json({ success: false, message: strength.message, message_ur: strength.message_ur });
    }

    const dupeConditions = [{ username }];
    if (email) dupeConditions.push({ email });
    if (phone) dupeConditions.push({ phone });
    const existingUser = await User.findOne({ $or: dupeConditions });
    if (existingUser) {
      let field = 'Username';
      if (email && existingUser.email === email) field = 'Email';
      else if (phone && existingUser.phone === phone) field = 'Phone number';
      return res.status(400).json({ success: false, message: `${field} already in use` });
    }

    // Built in-memory first, not persisted yet. For a phone-only signup the
    // SMS send below throws on failure (unlike email sending, which
    // swallows its own errors) -- sending before save() means a failed
    // send never leaves a junk, unverifiable account behind.
    const user = new User({ fullName, username, email, password, phone, authProvider: 'local' });
    const otp = user.generateOTP('register');

    if (email) {
      await user.save();
      const verifyToken = user.generateEmailVerifyToken();
      await user.save();
      await sendWelcomeEmail(user);
      await sendVerificationEmail(user, verifyToken);
      await sendOTPEmail(user, otp, 'register');
    } else {
      await deliverPhoneOTP(phone, otp);
      await user.save();
    }

    res.status(201).json({
      success: true,
      message: email ? 'Account created! Please verify your email.' : 'Account created! Please verify your phone number.',
      userId: user._id,
      requiresOTP: true
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier = email or phone -- username is a display handle only, not a login credential

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Please provide credentials' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { phone: identifier }]
    }).select('+password');

    if (user?.isAccountLocked()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((user.accountLockUntil.getTime() - Date.now()) / 1000));
      logSecurityEvent('ACCOUNT_LOCKED', req, { userId: user._id, email: user.email });
      return res.status(423).json({
        success: false,
        message: 'Account temporarily locked due to too many failed attempts. Please try again later.',
        message_ur: 'Bohat zyada ghalat koshishon ki wajah se account aik dair ke liye lock hai.',
        retryAfterSeconds
      });
    }

    if (!user || !(await user.comparePassword(password))) {
      if (user) {
        user.registerFailedLogin();
        await user.save();
        logSecurityEvent('LOGIN_FAILED', req, { userId: user._id, email: user.email });
      }
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: `Account banned: ${user.banReason || 'Policy violation'}` });
    }

    user.resetLoginAttempts();

    // Password is correct, but the login is not complete yet -- an OTP is
    // always required to finish it (previously this was skipped unless the
    // user had 2FA enabled; now every password login goes through it).
    // loginHistory/the "new sign-in" email are deliberately NOT recorded
    // here: this only proves the password, not the person, so recording it
    // as a successful login now would be wrong for anyone who then fails
    // the OTP step. Both happen in verifyOTP() once the OTP actually passes.
    const otpPurpose = user.twoFactorEnabled ? '2fa' : 'login';
    const otp = user.generateOTP(otpPurpose);
    await user.save();
    const channel = await deliverUserOTP(user, otp, otpPurpose);
    logSecurityEvent('LOGIN_SUCCESS', req, { userId: user._id, email: user.email, meta: { stage: 'password_verified', otpPurpose } });

    return res.status(200).json({
      success: true,
      requiresOTP: true,
      purpose: otpPurpose,
      userId: user._id,
      message: channel === 'sms' ? 'OTP sent to your phone' : 'OTP sent to your email'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
export const verifyOTP = async (req, res) => {
  try {
    const { userId, otp, purpose } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: `Account banned: ${user.banReason || 'Policy violation'}` });
    }

    if (user.isOtpLocked()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((user.otpLockUntil.getTime() - Date.now()) / 1000));
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect codes. Please try again later.',
        message_ur: 'Bohat zyada ghalat codes. Baraye meherbani thodi dair baad koshish karein.',
        retryAfterSeconds
      });
    }

    // Purpose mismatch / no active OTP / expired -- all treated as a plain
    // "invalid or expired" response so we don't leak which case it was.
    if (!user.otpHash || user.otpPurpose !== purpose || new Date() > user.otpExpiry) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    if (!user.compareOTP(otp)) {
      user.registerFailedOtpAttempt();
      await user.save();
      logSecurityEvent('OTP_FAILED', req, { userId: user._id, meta: { purpose } });
      if (user.isOtpLocked()) {
        return res.status(429).json({
          success: false,
          message: 'Too many incorrect codes. Please try again later.',
          message_ur: 'Bohat zyada ghalat codes. Baraye meherbani thodi dair baad koshish karein.'
        });
      }
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Clear OTP
    user.clearOTP();
    logSecurityEvent('OTP_VERIFIED', req, { userId: user._id, meta: { purpose } });

    if (purpose === 'register' || purpose === '2fa' || purpose === 'login' || purpose === 'phone_login') {
      // Mark whichever channel the code actually went through as verified --
      // an account can now be email-only, phone-only, or both (see
      // deliverUserOTP), so this can no longer assume email unconditionally.
      if (purpose === 'phone_login') {
        user.isPhoneVerified = true;
      } else if (user.email) {
        user.isEmailVerified = true;
      } else if (user.phone) {
        user.isPhoneVerified = true;
      }
      user.lastSeen = new Date();
      user.isOnline = true;

      // This is the point a password login (with or without 2FA) actually
      // completes -- record it and notify the user here, not back in
      // login(), so a wrong OTP never gets logged as a successful sign-in.
      if (purpose === 'login' || purpose === '2fa') {
        const loginInfo = {
          ip: req.ip || req.connection.remoteAddress,
          device: req.headers['user-agent']?.substring(0, 100) || 'Unknown',
          location: 'Unknown',
          success: true,
          timestamp: new Date()
        };
        user.loginHistory.push(loginInfo);
        if (user.loginHistory.length > 20) user.loginHistory = user.loginHistory.slice(-20);
        await user.save();
        await sendNewLoginEmail(user, loginInfo);
      } else {
        await user.save();
      }

      await sendTokenResponse(user, 200, res, 'Verified successfully', req);
    } else {
      await user.save();
      res.json({ success: true, message: 'OTP verified', userId: user._id });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
export const resendOTP = async (req, res) => {
  try {
    const { userId, purpose } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const otp = user.generateOTP(purpose || 'login');
    await user.save();
    const channel = await deliverUserOTP(user, otp, purpose || 'login');

    res.json({ success: true, message: channel === 'sms' ? 'OTP resent to your phone' : 'OTP resent to your email' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Check whether a username is free (live check during signup)
// @route   GET /api/auth/check-username/:username
export const checkUsername = async (req, res) => {
  try {
    const username = req.params.username?.toLowerCase().trim();
    if (!username || username.length < 3 || !/^[a-zA-Z0-9._]+$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Invalid username' });
    }
    const exists = await User.findOne({ username });
    res.json({ success: true, available: !exists });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify email token
// @route   GET /api/auth/verify-email/:token
export const verifyEmail = async (req, res) => {
  try {
    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      emailVerifyToken: hashed,
      emailVerifyExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification link' });
    }

    user.isEmailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpiry = undefined;
    await user.save();

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });

    logSecurityEvent('PASSWORD_RESET_REQUESTED', req, { email: email?.toLowerCase(), userId: user?._id });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    // Password-reset is a signed-link flow only -- no OTP is generated or
    // emailed here (see audit report: the 'reset' purpose text in email.js
    // was dead code from an earlier OTP-based design and has been removed).
    const token = user.generatePasswordResetToken();
    await user.save();
    await sendPasswordResetEmail(user, token);

    res.json({ success: true, message: 'Password reset email sent' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
export const resetPassword = async (req, res) => {
  try {
    const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashed,
      passwordResetExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const { password } = req.body;
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return res.status(400).json({ success: false, message: strength.message, message_ur: strength.message_ur });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    // Invalidate every session that existed before this reset -- both
    // outstanding access tokens (via tokenVersion) and refresh tokens.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.resetLoginAttempts();
    await user.save();
    await revokeAllUserSessions(user._id);

    logSecurityEvent('PASSWORD_RESET_SUCCESS', req, { userId: user._id, email: user.email });
    await sendPasswordChangedEmail(user);
    await sendTokenResponse(user, 200, res, 'Password reset successful', req);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    // `-e2e`: the client keeps its own key material in IndexedDB and never
    // reads e2e from this endpoint, so echoing the prekey array (with its
    // per-key `used` flags) back on every call only leaks session-count
    // metadata and bloats a hot response.
    const user = await User.findById(req.user._id)
      .select('-e2e')
      .populate('followers', 'username fullName avatar isVerified')
      .populate('following', 'username fullName avatar isVerified');
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Logout (revokes the current session's refresh token only)
// @route   POST /api/auth/logout
export const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { isOnline: false, lastSeen: new Date() });
    await revokeRefreshTokenByRaw(req.cookies?.refreshToken);
    res.cookie('token', '', { expires: new Date(0), httpOnly: true });
    res.cookie('refreshToken', '', { ...REFRESH_COOKIE_OPTIONS, expires: new Date(0) });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Log out of every device/session (revokes all refresh tokens and
//          bumps tokenVersion so outstanding access tokens stop working too)
// @route   POST /api/auth/logout-all
export const logoutAll = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.isOnline = false;
    user.lastSeen = new Date();
    await user.save();
    await revokeAllUserSessions(user._id);
    logSecurityEvent('SESSION_REVOKED_ALL', req, { userId: user._id });

    res.cookie('token', '', { expires: new Date(0), httpOnly: true });
    res.cookie('refreshToken', '', { ...REFRESH_COOKIE_OPTIONS, expires: new Date(0) });
    res.json({ success: true, message: 'Logged out of all devices' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Exchange a valid refresh token for a new access token, rotating
//          the refresh token itself (single-use, chained for reuse detection)
// @route   POST /api/auth/refresh-token
export const refreshToken = async (req, res) => {
  try {
    const raw = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!raw) {
      return res.status(401).json({ success: false, message: 'No refresh token provided' });
    }

    const doc = await findActiveRefreshToken(raw);
    if (!doc) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    if (!doc.isActive()) {
      // A token that's already revoked being presented again strongly
      // suggests it was stolen and used concurrently by two parties -- kill
      // every session in this user's family, not just this one.
      if (doc.revokedAt) {
        await revokeAllUserSessions(doc.user);
        logSecurityEvent('REFRESH_TOKEN_REUSE_DETECTED', req, { userId: doc.user });
      }
      res.cookie('token', '', { expires: new Date(0), httpOnly: true });
      res.cookie('refreshToken', '', { ...REFRESH_COOKIE_OPTIONS, expires: new Date(0) });
      return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
    }

    const user = await User.findById(doc.user);
    if (!user || user.isBanned) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const newRaw = await rotateRefreshToken(doc, user, req);
    const accessToken = generateToken(user._id, user.tokenVersion || 0);
    const refreshTtlMs = (parseInt(process.env.REFRESH_TOKEN_EXPIRE_DAYS, 10) || 7) * 24 * 60 * 60 * 1000;

    res
      .cookie('token', accessToken, { ...ACCESS_COOKIE_OPTIONS, expires: new Date(Date.now() + 15 * 60 * 1000) })
      .cookie('refreshToken', newRaw, { ...REFRESH_COOKIE_OPTIONS, expires: new Date(Date.now() + refreshTtlMs) })
      .json({ success: true, token: accessToken, refreshToken: newRaw, expiresIn: 15 * 60 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Change password (authenticated)
// @route   PUT /api/auth/change-password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return res.status(400).json({ success: false, message: strength.message, message_ur: strength.message_ur });
    }

    user.password = newPassword;
    // Force every other session to re-authenticate; the request making this
    // very change gets a fresh matching token below so it isn't logged out.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await revokeAllUserSessions(user._id);
    logSecurityEvent('PASSWORD_CHANGED', req, { userId: user._id, email: user.email });
    await sendPasswordChangedEmail(user);

    await sendTokenResponse(user, 200, res, 'Password changed successfully', req);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyGoogleToken = async (accessToken) => {
  const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`);
  if (!infoRes.ok) throw new Error('Invalid Google token');
  const info = await infoRes.json();
  if (info.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('Token audience mismatch');

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const profile = profileRes.ok ? await profileRes.json() : {};

  return {
    providerId: info.sub,
    email: info.email,
    fullName: profile.name,
    avatar: profile.picture,
    emailVerified: info.email_verified === 'true'
  };
};

const verifyFacebookToken = async (accessToken) => {
  const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
  const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${appToken}`);
  const debug = await debugRes.json();
  if (!debug.data?.is_valid || debug.data.app_id !== process.env.FACEBOOK_APP_ID) {
    throw new Error('Invalid Facebook token');
  }

  const profileRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`);
  if (!profileRes.ok) throw new Error('Facebook profile fetch failed');
  const profile = await profileRes.json();

  return {
    providerId: profile.id,
    email: profile.email,
    fullName: profile.name,
    avatar: profile.picture?.data?.url,
    // Graph's /me doesn't return an explicit verified flag; it only includes
    // `email` in the response when it's a verified, primary email.
    emailVerified: !!profile.email
  };
};

const verifyAppleToken = async (idToken) => {
  const payload = await appleSignin.verifyIdToken(idToken, {
    audience: process.env.APPLE_CLIENT_ID,
  });
  return {
    providerId: payload.sub,
    email: payload.email,
    fullName: undefined,
    avatar: undefined,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true'
  };
};

const PROVIDER_VERIFIERS = {
  google: verifyGoogleToken,
  facebook: verifyFacebookToken,
  apple: verifyAppleToken,
};

// @desc    OAuth callback handler (Google/Facebook/Apple)
// @route   POST /api/auth/oauth
export const oauthLogin = async (req, res) => {
  try {
    const { provider, token } = req.body;
    const verify = Object.prototype.hasOwnProperty.call(PROVIDER_VERIFIERS, provider)
      ? PROVIDER_VERIFIERS[provider]
      : null;
    if (!verify || !token) {
      return res.status(400).json({ success: false, message: 'Invalid provider or token' });
    }

    let identity;
    try {
      identity = await verify(token); // { providerId, email, fullName, avatar, emailVerified } -- verified fields only
    } catch {
      return res.status(401).json({ success: false, message: 'Could not verify identity with provider' });
    }

    const { providerId, email, avatar, emailVerified } = identity ?? {};
    if (!providerId) {
      return res.status(401).json({ success: false, message: 'Could not verify identity with provider' });
    }
    // Apple never embeds a display name in the verifiable token -- it hands
    // one to the client directly, once, on first sign-in only. Honored here
    // ONLY for provider === 'apple' (added in Task 4), and only as a
    // fallback name for a brand-new account, never to override
    // providerId/email.
    const fullName = (provider === 'apple' && req.body.fullName) || identity.fullName;

    let user = await User.findOne({ [`${provider}Id`]: providerId });
    // Only link into an existing account by email when the provider actually
    // confirmed the email is verified -- otherwise an unverified provider
    // email could be used to take over an unrelated local-password account.
    if (!user && email && emailVerified) user = await User.findOne({ email });

    if (!user) {
      let username = email?.split('@')[0] || `user${Date.now()}`;
      username = username.toLowerCase().replace(/[^a-z0-9._]/g, '');
      const exists = await User.findOne({ username });
      if (exists) username = `${username}${Math.floor(1000 + Math.random() * 9000)}`;

      user = await User.create({
        fullName: fullName || 'New User',
        username,
        email,
        avatar,
        [`${provider}Id`]: providerId,
        authProvider: provider,
        isEmailVerified: true
      });
      await sendWelcomeEmail(user);
    } else {
      if (user.isBanned) {
        return res.status(403).json({ success: false, message: `Account banned: ${user.banReason || 'Policy violation'}` });
      }

      user[`${provider}Id`] = providerId;
      if (!user.avatar && avatar) user.avatar = avatar;
      if (emailVerified) user.isEmailVerified = true;
      user.lastSeen = new Date();

      // Log login activity (same shape as the local-password login flow)
      const loginInfo = {
        ip: req.ip || req.connection.remoteAddress,
        device: req.headers['user-agent']?.substring(0, 100) || 'Unknown',
        location: 'Unknown',
        success: true,
        timestamp: new Date()
      };
      user.loginHistory.push(loginInfo);
      if (user.loginHistory.length > 20) user.loginHistory = user.loginHistory.slice(-20);

      // Send OTP if 2FA enabled, same as local-password login
      if (user.twoFactorEnabled) {
        const otp = user.generateOTP('2fa');
        await user.save();
        await sendOTPEmail(user, otp, '2fa');
        return res.status(200).json({
          success: true,
          requiresTwoFactor: true,
          userId: user._id,
          message: 'OTP sent to your email'
        });
      }

      await user.save();
      await sendNewLoginEmail(user, loginInfo);
    }

    await sendTokenResponse(user, 200, res, 'OAuth login successful', req);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send phone OTP
// @route   POST /api/auth/phone-otp
export const sendPhoneOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required' });
    if (!twilioClient) return res.status(500).json({ success: false, message: 'SMS delivery is not configured' });

    let user = await User.findOne({ phone });
    const isNewUser = !user;

    if (isNewUser) {
      // Build the user in memory only -- it isn't persisted until the SMS
      // send below succeeds, so a failed/attacker-triggered flood doesn't
      // leave junk user rows behind.
      let username = `user${Date.now()}`;
      const exists = await User.findOne({ username });
      if (exists) username = `${username}${Math.floor(1000 + Math.random() * 9000)}`;
      user = new User({ fullName: 'New User', username, phone, authProvider: 'phone' });
    }

    const otp = user.generateOTP('phone_login');

    await twilioClient.messages.create({
      body: `Your NexVibe verification code is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });

    await user.save();

    res.json({ success: true, message: 'OTP sent', userId: user._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Enable/Disable 2FA
// @route   POST /api/auth/2fa/toggle
export const toggle2FA = async (req, res) => {
  try {
    const { enable, otp } = req.body;
    const user = await User.findById(req.user._id);

    if (enable) {
      // Verify OTP first
      if (!user.otpHash || user.otpPurpose !== '2fa_setup' || !user.otpExpiry || new Date() > user.otpExpiry || !user.compareOTP(otp)) {
        return res.status(400).json({ success: false, message: 'Invalid OTP' });
      }
      user.twoFactorEnabled = true;
      user.clearOTP();
      await user.save();
      await sendTwoFactorEnabledEmail(user);
      return res.json({ success: true, message: '2FA enabled successfully' });
    } else {
      user.twoFactorEnabled = false;
      await user.save();
      return res.json({ success: true, message: '2FA disabled' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Request 2FA OTP
// @route   POST /api/auth/2fa/request-otp
export const request2FAOTP = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const otp = user.generateOTP('2fa_setup');
    await user.save();
    const channel = await deliverUserOTP(user, otp, '2fa');
    res.json({ success: true, message: channel === 'sms' ? 'OTP sent to your phone' : 'OTP sent to your email' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get login history
// @route   GET /api/auth/login-history
export const getLoginHistory = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('loginHistory');
    res.json({ success: true, loginHistory: user.loginHistory.reverse() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
