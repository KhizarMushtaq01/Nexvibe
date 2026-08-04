import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const APP_NAME = process.env.APP_NAME || 'NexVibe';
const APP_COLOR = '#E1306C';
const APP_LOGO = '✦';

const baseEmailTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8f8f8; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .header { background: linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%); padding: 32px 24px; text-align: center; }
  .logo { font-size: 36px; color: white; font-weight: 900; letter-spacing: -1px; }
  .body { padding: 32px 24px; }
  .title { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }
  .text { font-size: 15px; color: #555; line-height: 1.6; margin-bottom: 16px; }
  .otp-box { background: linear-gradient(135deg, #833ab4, #fd1d1d); border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
  .otp-code { font-size: 40px; font-weight: 900; color: white; letter-spacing: 10px; font-family: monospace; }
  .otp-label { color: rgba(255,255,255,0.8); font-size: 12px; margin-top: 6px; }
  .button { display: inline-block; background: linear-gradient(135deg, #833ab4, #fd1d1d); color: white; text-decoration: none; padding: 14px 32px; border-radius: 50px; font-weight: 600; font-size: 15px; margin: 16px 0; }
  .divider { height: 1px; background: #f0f0f0; margin: 24px 0; }
  .warning { background: #fff8e1; border-left: 4px solid #ffc107; padding: 12px 16px; border-radius: 0 8px 8px 0; font-size: 13px; color: #856404; margin: 16px 0; }
  .footer { padding: 16px 24px; text-align: center; background: #fafafa; }
  .footer-text { font-size: 12px; color: #999; line-height: 1.8; }
  .security-badge { display: inline-flex; align-items: center; gap: 6px; background: #e8f5e9; color: #2e7d32; padding: 6px 12px; border-radius: 50px; font-size: 12px; font-weight: 500; }
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <div class="header">
      <div class="logo">${APP_LOGO} ${APP_NAME}</div>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p class="footer-text">
        You're receiving this email because of activity on your ${APP_NAME} account.<br>
        If you didn't request this, please secure your account immediately.<br><br>
        © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
      </p>
    </div>
  </div>
</div>
</body>
</html>
`;

const sendEmail = async ({ to, subject, html }) => {
  try {
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || `${APP_NAME} <onboarding@resend.dev>`,
      to,
      subject,
      html
    });
    if (error) {
      console.error('Email send error:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Email send error:', error.message);
    return false;
  }
};

// ===== EMAIL TEMPLATES =====

export const sendVerificationEmail = async (user, token) => {
  const url = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: `Verify your ${APP_NAME} email`,
    html: baseEmailTemplate(`
      <h2 class="title">Verify your email ✉️</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">Welcome to ${APP_NAME}! Please verify your email address to activate your account.</p>
      <div style="text-align:center">
        <a href="${url}" class="button">Verify Email Address</a>
      </div>
      <p class="text" style="font-size:13px;color:#999">This link expires in 24 hours.</p>
    `)
  });
};

export const sendOTPEmail = async (user, otp, purpose = 'login') => {
  const purposeText = {
    login: 'sign in to',
    register: 'complete registration on',
    reset: 'reset your password on',
    change_email: 'change your email on',
    change_phone: 'change your phone number on',
    '2fa': 'verify two-factor authentication on'
  }[purpose] || 'access';

  await sendEmail({
    to: user.email,
    subject: `Your ${APP_NAME} verification code: ${otp}`,
    html: baseEmailTemplate(`
      <h2 class="title">Your Verification Code</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">Use the code below to ${purposeText} your ${APP_NAME} account:</p>
      <div class="otp-box">
        <div class="otp-code">${otp}</div>
        <div class="otp-label">Valid for 10 minutes</div>
      </div>
      <div class="warning">⚠️ Never share this code with anyone. ${APP_NAME} will never ask for this code.</div>
    `)
  });
};

export const sendNewMessageEmail = async (user, senderName) => {
  await sendEmail({
    to: user.email,
    subject: `${senderName} sent you a message on ${APP_NAME}`,
    html: baseEmailTemplate(`
      <h2 class="title">New Message 💬</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text"><strong>${senderName}</strong> sent you a message on ${APP_NAME}.</p>
      <div style="text-align:center">
        <a href="${process.env.FRONTEND_URL}/messages" class="button">Open Messages</a>
      </div>
    `)
  });
};

export const sendPasswordResetEmail = async (user, token) => {
  const url = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: `Reset your ${APP_NAME} password`,
    html: baseEmailTemplate(`
      <h2 class="title">Password Reset Request 🔒</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">We received a request to reset your password. Click the button below:</p>
      <div style="text-align:center">
        <a href="${url}" class="button">Reset Password</a>
      </div>
      <div class="warning">⚠️ This link expires in 1 hour. If you didn't request this, ignore this email and your password won't change.</div>
    `)
  });
};

export const sendPasswordChangedEmail = async (user) => {
  await sendEmail({
    to: user.email,
    subject: `Your ${APP_NAME} password was changed`,
    html: baseEmailTemplate(`
      <h2 class="title">Password Changed 🔐</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">Your ${APP_NAME} password was successfully changed on <strong>${new Date().toLocaleString()}</strong>.</p>
      <div class="warning">⚠️ If you didn't make this change, please secure your account immediately by resetting your password.</div>
      <div style="text-align:center">
        <a href="${process.env.FRONTEND_URL}/forgot-password" class="button">Secure My Account</a>
      </div>
    `)
  });
};

export const sendNewLoginEmail = async (user, loginInfo) => {
  await sendEmail({
    to: user.email,
    subject: `New sign-in to your ${APP_NAME} account`,
    html: baseEmailTemplate(`
      <h2 class="title">New Sign-In Detected 📱</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">We noticed a new sign-in to your account:</p>
      <div style="background:#f8f8f8;border-radius:10px;padding:16px;margin:16px 0">
        <p style="font-size:14px;margin-bottom:8px"><strong>📍 Location:</strong> ${loginInfo.location || 'Unknown'}</p>
        <p style="font-size:14px;margin-bottom:8px"><strong>💻 Device:</strong> ${loginInfo.device || 'Unknown'}</p>
        <p style="font-size:14px;margin-bottom:8px"><strong>🕐 Time:</strong> ${new Date().toLocaleString()}</p>
        <p style="font-size:14px"><strong>🌐 IP:</strong> ${loginInfo.ip || 'Unknown'}</p>
      </div>
      <div class="warning">If this wasn't you, please change your password immediately.</div>
    `)
  });
};

export const sendProfileUpdatedEmail = async (user, changes) => {
  await sendEmail({
    to: user.email,
    subject: `Your ${APP_NAME} profile was updated`,
    html: baseEmailTemplate(`
      <h2 class="title">Profile Updated ✏️</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">Your profile was updated. Here's what changed:</p>
      <div style="background:#f8f8f8;border-radius:10px;padding:16px;margin:16px 0">
        ${changes.map(c => `<p style="font-size:14px;margin-bottom:6px">• <strong>${c}</strong></p>`).join('')}
      </div>
      <div class="warning">If you didn't make these changes, please secure your account.</div>
    `)
  });
};

export const sendEmailChangedEmail = async (oldEmail, user) => {
  await sendEmail({
    to: oldEmail,
    subject: `Your ${APP_NAME} email address was changed`,
    html: baseEmailTemplate(`
      <h2 class="title">Email Address Changed 📧</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">Your ${APP_NAME} email address was changed to <strong>${user.email}</strong>.</p>
      <div class="warning">If you didn't do this, please contact support immediately.</div>
    `)
  });
};

export const sendWelcomeEmail = async (user) => {
  await sendEmail({
    to: user.email,
    subject: `Welcome to ${APP_NAME}! 🎉`,
    html: baseEmailTemplate(`
      <h2 class="title">Welcome to ${APP_NAME}! 🎉</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">Your account has been created successfully. You can now:</p>
      <div style="margin:16px 0">
        <p style="font-size:14px;margin-bottom:8px">📸 Share photos & videos</p>
        <p style="font-size:14px;margin-bottom:8px">💬 Chat with friends</p>
        <p style="font-size:14px;margin-bottom:8px">📱 Share Stories that disappear in 24h</p>
        <p style="font-size:14px;margin-bottom:8px">🎬 Create and watch Reels</p>
        <p style="font-size:14px">👥 Connect with people you love</p>
      </div>
      <div style="text-align:center">
        <a href="${process.env.FRONTEND_URL}" class="button">Start Exploring</a>
      </div>
    `)
  });
};

export const sendAccountDeactivatedEmail = async (user) => {
  await sendEmail({
    to: user.email,
    subject: `Your ${APP_NAME} account has been deactivated`,
    html: baseEmailTemplate(`
      <h2 class="title">Account Deactivated</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">Your ${APP_NAME} account has been deactivated. Your data will be preserved for 30 days.</p>
      <p class="text">You can reactivate your account anytime by logging in.</p>
    `)
  });
};

export const sendTwoFactorEnabledEmail = async (user) => {
  await sendEmail({
    to: user.email,
    subject: `Two-factor authentication enabled on ${APP_NAME}`,
    html: baseEmailTemplate(`
      <h2 class="title">2FA Enabled 🛡️</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">Two-factor authentication has been successfully enabled on your ${APP_NAME} account. Your account is now more secure!</p>
      <div class="warning">If you didn't enable this, please change your password immediately.</div>
    `)
  });
};

export const sendAvatarChangedEmail = async (user) => {
  await sendEmail({
    to: user.email,
    subject: `Your ${APP_NAME} profile picture was updated`,
    html: baseEmailTemplate(`
      <h2 class="title">Profile Picture Updated 🖼️</h2>
      <p class="text">Hi <strong>${user.fullName}</strong>,</p>
      <p class="text">Your ${APP_NAME} profile picture was updated on ${new Date().toLocaleString()}.</p>
      <div class="warning">If you didn't do this, please secure your account.</div>
    `)
  });
};

export default sendEmail;
