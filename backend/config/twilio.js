import twilio from 'twilio';

// Shared across authController (phone-login OTP) and userController
// (add/change phone number) so there's one client instance, not one per file.
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

export default twilioClient;
