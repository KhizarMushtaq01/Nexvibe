// authRoutes.js
import express from 'express';
import * as auth from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many attempts, try again later' } });

router.post('/register', auth.register);
router.post('/login', loginLimiter, auth.login);
router.post('/logout', protect, auth.logout);
router.get('/me', protect, auth.getMe);
router.post('/verify-otp', loginLimiter, auth.verifyOTP);
router.post('/resend-otp', auth.resendOTP);
router.get('/verify-email/:token', auth.verifyEmail);
router.post('/forgot-password', auth.forgotPassword);
router.post('/reset-password/:token', auth.resetPassword);
router.put('/change-password', protect, auth.changePassword);
router.post('/oauth', loginLimiter, auth.oauthLogin);
router.post('/phone-otp', loginLimiter, auth.sendPhoneOTP);
router.post('/2fa/toggle', protect, auth.toggle2FA);
router.post('/2fa/request-otp', protect, auth.request2FAOTP);
router.get('/login-history', protect, auth.getLoginHistory);

export default router;
