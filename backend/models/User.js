import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  // Basic Info
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    lowercase: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9._]+$/, 'Username can only contain letters, numbers, dots and underscores']
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [50, 'Full name cannot exceed 50 characters']
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email']
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  // Holds a not-yet-verified new email/phone while its OTP confirmation is
  // pending (see userController.requestEmailChange/requestPhoneChange).
  // Must be declared here -- Mongoose's default strict mode silently drops
  // any path not in the schema on .save(), so without this the "pending"
  // value would never actually persist between the request and confirm steps.
  pendingEmail: { type: String, lowercase: true, trim: true },
  pendingPhone: { type: String, trim: true },
  password: {
    type: String,
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  
  // Profile
  avatar: {
    type: String,
    default: ''
  },
  avatarPublicId: String,
  coverPhoto: {
    type: String,
    default: ''
  },
  coverPhotoPublicId: String,
  bio: {
    type: String,
    maxlength: [150, 'Bio cannot exceed 150 characters'],
    default: ''
  },
  website: {
    type: String,
    default: ''
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Non-binary', 'Prefer not to say', ''],
    default: ''
  },
  dateOfBirth: Date,
  pronouns: {
    type: String,
    enum: ['He/Him', 'She/Her', 'They/Them', 'Other', ''],
    default: ''
  },
  
  // Account type & status
  role: {
    type: String,
    enum: ['user', 'moderator', 'team_member', 'admin', 'superadmin'],
    default: 'user'
  },
  department: {
    type: String,
    trim: true,
    maxlength: [60, 'Department cannot exceed 60 characters'],
    default: ''
  },
  accountType: {
    type: String,
    enum: ['personal', 'creator', 'business'],
    default: 'personal'
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: String,
  isDeactivated: {
    type: Boolean,
    default: false
  },
  deactivatedAt: Date,
  
  // OAuth
  googleId: { type: String, sparse: true },
  facebookId: { type: String, sparse: true },
  appleId: { type: String, sparse: true },
  twitterId: { type: String, sparse: true },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'facebook', 'apple', 'twitter', 'phone'],
    default: 'local'
  },
  
  // Social
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  mutedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  restrictedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  closeFriends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  followRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sentFollowRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Saved posts
  savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  savedCollections: [{
    name: String,
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }]
  }],
  
  // Settings
  settings: {
    notifications: {
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      follows: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      posts: { type: Boolean, default: true },
      stories: { type: Boolean, default: true },
      liveVideos: { type: Boolean, default: true },
      emailNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false }
    },
    privacy: {
      activityStatus: { type: Boolean, default: true },
      storyVisibility: { type: String, enum: ['everyone', 'followers', 'closeFriends', 'none'], default: 'followers' },
      commentFilters: { type: Boolean, default: false },
      hideLikeCount: { type: Boolean, default: false },
      allowTagging: { type: String, enum: ['everyone', 'followers', 'noOne'], default: 'everyone' },
      allowMentions: { type: String, enum: ['everyone', 'followers', 'noOne'], default: 'everyone' },
      messageRequests: { type: String, enum: ['everyone', 'followers', 'noOne'], default: 'everyone' },
      showOnlineStatus: { type: Boolean, default: true },
      twoFactorAuth: { type: Boolean, default: false }
    },
    content: {
      sensitiveContent: { type: Boolean, default: false },
      autoPlayVideos: { type: Boolean, default: true },
      language: { type: String, default: 'en' }
    }
  },
  
  // Two Factor Auth
  twoFactorSecret: String,
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorBackupCodes: [String],
  
  // OTP -- hash only, never store the raw code (see generateOTP/compareOTP)
  otpHash: String,
  otpExpiry: Date,
  otpPurpose: String,
  otpAttempts: { type: Number, default: 0 },
  otpLockUntil: Date,
  lastOtpSentAt: Date,

  // Email verification
  emailVerifyToken: String,
  emailVerifyExpiry: Date,

  // Password reset
  passwordResetToken: String,
  passwordResetExpiry: Date,

  // Login brute-force lockout
  failedLoginAttempts: { type: Number, default: 0 },
  accountLockUntil: Date,

  // Bumped on password change/reset to invalidate all previously issued
  // access/refresh tokens (they carry the version they were minted with).
  tokenVersion: { type: Number, default: 0 },

  // Session & Security
  loginHistory: [{
    ip: String,
    device: String,
    browser: String,
    location: String,
    timestamp: { type: Date, default: Date.now },
    success: Boolean
  }],
  activeSessions: [{
    token: String,
    device: String,
    ip: String,
    createdAt: { type: Date, default: Date.now },
    lastActive: Date
  }],
  
  // Stats
  postsCount: { type: Number, default: 0 },
  reelsCount: { type: Number, default: 0 },
  
  // Activity
  lastSeen: { type: Date, default: Date.now },
  isOnline: { type: Boolean, default: false },
  
  // Profile Category (for business/creator)
  category: String,
  
  // Links (like Instagram link-in-bio)
  links: [{
    title: String,
    url: String
  }],
  
  // Highlights
  highlights: [{
    title: String,
    coverImage: String,
    stories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Story' }]
  }],

  // End-to-end encryption (Phase 1: direct-message text only)
  e2e: {
    identityKey: String, // base64 public X25519 key, set once per device that has ever logged in
    oneTimePreKeys: [{
      keyId: Number,
      publicKey: String, // base64
      used: { type: Boolean, default: false }
    }]
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals
userSchema.virtual('followersCount').get(function () {
  return this.followers?.length || 0;
});

userSchema.virtual('followingCount').get(function () {
  return this.following?.length || 0;
});

// Indexes
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ fullName: 'text', username: 'text', bio: 'text' });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password. Accounts created via phone-OTP or OAuth have no
// password set at all -- bcrypt.compare() throws on a non-string hash, so
// that case has to be handled explicitly rather than left to bcrypt.
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate OTP -- returns the raw code (for the email/SMS) and persists only
// its SHA-256 hash, matching the hashing approach already used for the
// email-verify and password-reset tokens below.
userSchema.methods.generateOTP = function (purpose = 'login') {
  const otp = crypto.randomInt(100000, 1000000).toString();
  this.otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  this.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  this.otpPurpose = purpose;
  this.otpAttempts = 0;
  this.otpLockUntil = undefined;
  this.lastOtpSentAt = new Date();
  return otp;
};

// Constant-time compare of a candidate code against the stored hash.
userSchema.methods.compareOTP = function (candidate) {
  if (!this.otpHash || !candidate) return false;
  const candidateHash = crypto.createHash('sha256').update(String(candidate)).digest('hex');
  const a = Buffer.from(this.otpHash, 'hex');
  const b = Buffer.from(candidateHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

userSchema.methods.clearOTP = function () {
  this.otpHash = undefined;
  this.otpExpiry = undefined;
  this.otpPurpose = undefined;
  this.otpAttempts = 0;
  this.otpLockUntil = undefined;
};

userSchema.methods.isOtpLocked = function () {
  return !!(this.otpLockUntil && this.otpLockUntil > new Date());
};

// 5 wrong codes -> 15 minute lock on further verify attempts for this OTP.
userSchema.methods.registerFailedOtpAttempt = function () {
  this.otpAttempts = (this.otpAttempts || 0) + 1;
  if (this.otpAttempts >= 5) {
    this.otpLockUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
};

userSchema.methods.isAccountLocked = function () {
  return !!(this.accountLockUntil && this.accountLockUntil > new Date());
};

// 5 failed logins -> 15 minute lock, 10 failed logins -> 1 hour lock.
userSchema.methods.registerFailedLogin = function () {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  if (this.failedLoginAttempts >= 10) {
    this.accountLockUntil = new Date(Date.now() + 60 * 60 * 1000);
  } else if (this.failedLoginAttempts >= 5) {
    this.accountLockUntil = new Date(Date.now() + 15 * 60 * 1000);
  }
};

userSchema.methods.resetLoginAttempts = function () {
  this.failedLoginAttempts = 0;
  this.accountLockUntil = undefined;
};

// Generate email verify token
userSchema.methods.generateEmailVerifyToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerifyToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  return token;
};

const User = mongoose.model('User', userSchema);
export default User;
