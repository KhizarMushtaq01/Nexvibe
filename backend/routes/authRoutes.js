// authRoutes.js
import express from 'express';
import * as auth from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import {
  loginLimiter,
  registerLimiter,
  verifyOtpLimiter,
  resendOtpLimiter,
  resendOtpCooldownLimiter,
  forgotPasswordLimiter,
  refreshTokenLimiter,
  checkUsernameLimiter
} from '../middleware/rateLimiters.js';

const router = express.Router();

router.get('/check-username/:username', checkUsernameLimiter, auth.checkUsername);
router.post('/register', registerLimiter, auth.register);
router.post('/login', loginLimiter, auth.login);
router.post('/logout', protect, auth.logout);
router.post('/logout-all', protect, auth.logoutAll);
router.post('/refresh-token', refreshTokenLimiter, auth.refreshToken);
router.get('/me', protect, auth.getMe);
router.post('/verify-otp', verifyOtpLimiter, auth.verifyOTP);
// Cooldown limiter (60s/request) runs before the 3-per-5-minutes limiter.
router.post('/resend-otp', resendOtpCooldownLimiter, resendOtpLimiter, auth.resendOTP);
router.get('/verify-email/:token', auth.verifyEmail);
router.post('/forgot-password', forgotPasswordLimiter, auth.forgotPassword);
router.post('/reset-password/:token', auth.resetPassword);
router.put('/change-password', protect, auth.changePassword);
router.post('/oauth', loginLimiter, auth.oauthLogin);
router.post('/phone-otp', loginLimiter, auth.sendPhoneOTP);
router.post('/2fa/toggle', protect, auth.toggle2FA);
router.post('/2fa/request-otp', protect, auth.request2FAOTP);
router.get('/login-history', protect, auth.getLoginHistory);

export default router;
