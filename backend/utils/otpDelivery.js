import twilioClient from '../config/twilio.js';
import { sendOTPEmail } from './email.js';

// Sends an OTP via SMS. Throws on failure/misconfiguration -- callers that
// haven't persisted their user doc yet (see authController.register) rely
// on that to avoid saving an account that never actually received its code.
export const deliverPhoneOTP = async (phone, otp) => {
  if (!twilioClient) throw new Error('SMS delivery is not configured');
  await twilioClient.messages.create({
    body: `Your NexVibe verification code is: ${otp}`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone
  });
};

// Picks email or SMS based on what's actually on file for the user -- an
// account can now have either (see the "email or phone" signup field), and
// unconditionally emailing a phone-only user silently sent nothing at all
// (Resend just no-ops on an undefined `to`).
export const deliverUserOTP = async (user, otp, purpose) => {
  if (user.email) {
    await sendOTPEmail(user, otp, purpose);
    return 'email';
  }
  if (user.phone) {
    await deliverPhoneOTP(user.phone, otp);
    return 'sms';
  }
  throw new Error('No email or phone on file to send a verification code to');
};
