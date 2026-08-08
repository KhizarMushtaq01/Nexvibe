// Password complexity policy shared by register / reset-password / change-password.
// Deliberately does NOT check against breached-password databases (e.g. HaveIBeenPwned)
// -- that requires picking an external API/dataset and is left as a follow-up
// decision (see audit report).
export const validatePasswordStrength = (password) => {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required.', message_ur: 'Password zaroori hai.' };
  }
  if (password.length < 8) {
    return {
      valid: false,
      message: 'Password must be at least 8 characters.',
      message_ur: 'Password kam az kam 8 characters ka hona chahiye.'
    };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one uppercase letter.',
      message_ur: 'Password mein kam az kam ek bara herf (A-Z) hona chahiye.'
    };
  }
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one lowercase letter.',
      message_ur: 'Password mein kam az kam ek chota herf (a-z) hona chahiye.'
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one number.',
      message_ur: 'Password mein kam az kam ek number hona chahiye.'
    };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain at least one special character.',
      message_ur: 'Password mein kam az kam ek special character hona chahiye.'
    };
  }
  return { valid: true };
};
