import crypto from 'crypto';
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

    if (purpose === 'register' || purpose === '2fa' || purpose === 'login') {
      user.isEmailVerified = true;
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
    const user = await User.findById(req.user._id)
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

// @desc    OAuth callback handler (Google/Facebook/Apple/Twitter)
// @route   POST /api/auth/oauth
export const oauthLogin = async (req, res) => {
  try {
    const { provider, providerId, email, fullName, avatar, username: suggestedUsername } = req.body;

    let user = await User.findOne({ [`${provider}Id`]: providerId });

    if (!user && email) {
      user = await User.findOne({ email });
    }

    if (!user) {
      // Create new user
      let username = suggestedUsername || email?.split('@')[0] || `user${Date.now()}`;
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
  // In production, integrate with Twilio or similar
  try {
    const { phone } = req.body;
    // For now, simulate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    let user = await User.findOne({ phone });
    if (!user) {
      // Store temp OTP for registration
      return res.json({ success: true, message: 'OTP sent', isNewUser: true, otp }); // remove otp in production
    }

    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.otpPurpose = 'phone_login';
    await user.save();

    res.json({ success: true, message: 'OTP sent to your phone', userId: user._id });
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
