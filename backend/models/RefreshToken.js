import mongoose from 'mongoose';

// Refresh tokens are opaque random strings handed to the client; only their
// SHA-256 hash is ever persisted (see utils/auth.js). Rotation chains are
// tracked via replacedByTokenHash so a reused/stolen token can be detected:
// if a revoked token is presented again, every token in its family is
// revoked (see authController.refreshToken).
const refreshTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  deviceInfo: {
    ip: String,
    userAgent: String
  },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  replacedByTokenHash: String
}, { timestamps: true });

// Let MongoDB reap expired tokens automatically once they're no longer valid.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

refreshTokenSchema.methods.isActive = function () {
  return !this.revokedAt && this.expiresAt > new Date();
};

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
export default RefreshToken;
