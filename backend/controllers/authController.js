import crypto from 'crypto';
import twilio from 'twilio';
import appleSignin from 'apple-signin-auth';
import User from '../models/User.js';
import { sendTokenResponse, generateToken } from '../utils/auth.js';
import {
  sendVerificationEmail,
  sendOTPEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendNewLoginEmail,
  sendWelcomeEmail,
  sendTwoFactorEnabledEmail
} from '../utils/email.js';

// @desc    Register user
// @route   POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { fullName, username, email, password, phone } = req.body;

    if (!fullName || !username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({ success: false, message: `${field} already in use` });
    }

    const user = await User.create({ fullName, username, email, password, phone, authProvider: 'local' });

    // Send welcome + verification email
    const verifyToken = user.generateEmailVerifyToken();
    await user.save();
    await sendWelcomeEmail(user);
    await sendVerificationEmail(user, verifyToken);

    // Generate OTP for login confirmation
    const otp = user.generateOTP('register');
    await user.save();
    await sendOTPEmail(user, otp, 'register');

    res.status(201).json({
      success: true,
      message: 'Account created! Please verify your email.',
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
    const { identifier, password } = req.body; // identifier = email or username

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Please provide credentials' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }]
    }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: `Account banned: ${user.banReason || 'Policy violation'}` });
    }

    // Log login activity
    const loginInfo = {
      ip: req.ip || req.connection.remoteAddress,
      device: req.headers['user-agent']?.substring(0, 100) || 'Unknown',
      location: 'Unknown',
      success: true,
      timestamp: new Date()
    };

    user.loginHistory.push(loginInfo);
    if (user.loginHistory.length > 20) user.loginHistory = user.loginHistory.slice(-20);
    user.lastSeen = new Date();
    user.isOnline = true;

    // Send OTP if 2FA enabled
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

    // Send login notification email
    await user.save();
    await sendNewLoginEmail(user, loginInfo);

    sendTokenResponse(user, 200, res, 'Logged in successfully');
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

    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ success: false, message: 'OTP has expired' });
    }

    // Clear OTP
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.otpPurpose = undefined;

    if (purpose === 'register' || purpose === '2fa' || purpose === 'login' || purpose === 'phone_login') {
      user.isEmailVerified = true;
      if (purpose === 'phone_login') user.isPhoneVerified = true;
      user.lastSeen = new Date();
      await user.save();
      sendTokenResponse(user, 200, res, 'Verified successfully');
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
    await sendOTPEmail(user, otp, purpose || 'login');

    res.json({ success: true, message: 'OTP resent to your email' });
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

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

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
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();

    await sendPasswordChangedEmail(user);
    sendTokenResponse(user, 200, res, 'Password reset successful');
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

// @desc    Logout
// @route   POST /api/auth/logout
export const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { isOnline: false, lastSeen: new Date() });
    res.cookie('token', '', { expires: new Date(0), httpOnly: true });
    res.json({ success: true, message: 'Logged out successfully' });
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

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters' });
    }

    user.password = newPassword;
    await user.save();
    await sendPasswordChangedEmail(user);

    res.json({ success: true, message: 'Password changed successfully' });
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

  return { providerId: info.sub, email: info.email, fullName: profile.name, avatar: profile.picture };
};

const verifyFacebookToken = async (accessToken) => {
  const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
  const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${appToken}`);
  const debug = await debugRes.json();
  if (!debug.data?.is_valid || debug.data.app_id !== process.env.FACEBOOK_APP_ID) {
    throw new Error('Invalid Facebook token');
  }

  const profileRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`);
  const profile = await profileRes.json();

  return { providerId: profile.id, email: profile.email, fullName: profile.name, avatar: profile.picture?.data?.url };
};

const verifyAppleToken = async (idToken) => {
  const payload = await appleSignin.verifyIdToken(idToken, {
    audience: process.env.APPLE_CLIENT_ID,
  });
  return { providerId: payload.sub, email: payload.email, fullName: undefined, avatar: undefined };
};

const PROVIDER_VERIFIERS = {
  google: verifyGoogleToken,
  facebook: verifyFacebookToken,
  apple: verifyAppleToken,
};

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// @desc    OAuth callback handler (Google/Facebook/Apple)
// @route   POST /api/auth/oauth
export const oauthLogin = async (req, res) => {
  try {
    const { provider, token } = req.body;
    const verify = PROVIDER_VERIFIERS[provider];
    if (!verify || !token) {
      return res.status(400).json({ success: false, message: 'Invalid provider or token' });
    }

    let identity;
    try {
      identity = await verify(token); // { providerId, email, fullName, avatar } -- verified fields only
    } catch {
      return res.status(401).json({ success: false, message: 'Could not verify identity with provider' });
    }
    const { providerId, email, avatar } = identity;
    // Apple never embeds a display name in the verifiable token -- it hands
    // one to the client directly, once, on first sign-in only. Honored here
    // ONLY for provider === 'apple' (added in Task 4), and only as a
    // fallback name for a brand-new account, never to override
    // providerId/email.
    const fullName = (provider === 'apple' && req.body.fullName) || identity.fullName;

    let user = await User.findOne({ [`${provider}Id`]: providerId });
    if (!user && email) user = await User.findOne({ email });

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
      user[`${provider}Id`] = providerId;
      if (!user.avatar && avatar) user.avatar = avatar;
      user.isEmailVerified = true;
      user.lastSeen = new Date();
      await user.save();
    }

    sendTokenResponse(user, 200, res, 'OAuth login successful');
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
    if (!user) {
      const username = `user${Date.now()}`;
      user = await User.create({ fullName: 'New User', username, phone, authProvider: 'phone' });
    }

    const otp = user.generateOTP('phone_login');
    await user.save();

    await twilioClient.messages.create({
      body: `Your NexVibe verification code is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });

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
      if (user.otp !== otp || new Date() > user.otpExpiry) {
        return res.status(400).json({ success: false, message: 'Invalid OTP' });
      }
      user.twoFactorEnabled = true;
      user.otp = undefined;
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
    await sendOTPEmail(user, otp, '2fa');
    res.json({ success: true, message: 'OTP sent to your email' });
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
