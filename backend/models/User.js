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
    required: [true, 'Email is required'],
    unique: true,
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
    enum: ['user', 'admin', 'moderator'],
    default: 'user'
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
  
  // OTP
  otp: String,
  otpExpiry: Date,
  otpPurpose: String,
  
  // Email verification
  emailVerifyToken: String,
  emailVerifyExpiry: Date,
  
  // Password reset
  passwordResetToken: String,
  passwordResetExpiry: Date,
  
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
  }]

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

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate OTP
userSchema.methods.generateOTP = function (purpose = 'login') {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;
  this.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  this.otpPurpose = purpose;
  return otp;
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
