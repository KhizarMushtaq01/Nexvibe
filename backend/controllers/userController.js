import User from '../models/User.js';
import Post from '../models/Post.js';
import Notification from '../models/Notification.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import {
  sendProfileUpdatedEmail,
  sendEmailChangedEmail,
  sendAvatarChangedEmail,
  sendOTPEmail
} from '../utils/email.js';
import fs from 'fs';

// @desc    Get user profile by username
// @route   GET /api/users/:username
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password -otp -otpExpiry -emailVerifyToken -passwordResetToken -loginHistory -activeSessions -twoFactorSecret -twoFactorBackupCodes')
      .populate('followers', 'username fullName avatar isVerified')
      .populate('following', 'username fullName avatar isVerified');

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Check if blocked
    if (req.user && user.blockedUsers.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You cannot view this profile' });
    }

    if (req.user && req.user.blockedUsers?.includes(user._id.toString())) {
      return res.status(403).json({ success: false, message: 'You have blocked this user' });
    }

    const isFollowing = req.user ? user.followers.some(f => f._id.toString() === req.user._id.toString()) : false;
    const isOwnProfile = req.user ? user._id.toString() === req.user._id.toString() : false;
    const hasFollowRequest = req.user ? user.followRequests.includes(req.user._id) : false;

    // Fetch post count
    const postsCount = await Post.countDocuments({ author: user._id, isDeleted: false, isArchived: false });

    res.json({
      success: true,
      user: { ...user.toObject(), postsCount },
      isFollowing,
      isOwnProfile,
      hasFollowRequest
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update profile
// @route   PUT /api/users/profile
export const updateProfile = async (req, res) => {
  try {
    const { fullName, bio, website, gender, dateOfBirth, pronouns, category, links } = req.body;
    const user = await User.findById(req.user._id);
    const changes = [];

    if (fullName && fullName !== user.fullName) { user.fullName = fullName; changes.push('Full Name'); }
    if (bio !== undefined && bio !== user.bio) { user.bio = bio; changes.push('Bio'); }
    if (website !== undefined && website !== user.website) { user.website = website; changes.push('Website'); }
    if (gender !== undefined) user.gender = gender;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
    if (pronouns !== undefined) user.pronouns = pronouns;
    if (category !== undefined) user.category = category;
    if (links !== undefined) user.links = links;

    await user.save();

    if (changes.length > 0) {
      await sendProfileUpdatedEmail(user, changes);
    }

    res.json({ success: true, message: 'Profile updated', user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update username
// @route   PUT /api/users/username
export const updateUsername = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Username required' });

    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists && exists._id.toString() !== req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { username: username.toLowerCase() },
      { new: true, runValidators: true }
    );

    await sendProfileUpdatedEmail(user, ['Username']);
    res.json({ success: true, message: 'Username updated', user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Upload/Change avatar
// @route   PUT /api/users/avatar
export const updateAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!req.file && !req.body.avatar) {
      return res.status(400).json({ success: false, message: 'No image provided' });
    }

    // Delete old avatar from cloudinary
    if (user.avatarPublicId) {
      await deleteFromCloudinary(user.avatarPublicId).catch(() => {});
    }

    let avatarUrl, publicId;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.path, 'nexvibe/avatars', {
        transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face' }]
      });
      avatarUrl = result.secure_url;
      publicId = result.public_id;
      fs.unlinkSync(req.file.path);
    } else if (req.body.avatar) {
      const result = await uploadToCloudinary(req.body.avatar, 'nexvibe/avatars');
      avatarUrl = result.secure_url;
      publicId = result.public_id;
    }

    user.avatar = avatarUrl;
    user.avatarPublicId = publicId;
    await user.save();

    await sendAvatarChangedEmail(user);
    res.json({ success: true, message: 'Avatar updated', avatar: avatarUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete avatar
// @route   DELETE /api/users/avatar
export const deleteAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user.avatarPublicId) {
      await deleteFromCloudinary(user.avatarPublicId).catch(() => {});
    }
    user.avatar = '';
    user.avatarPublicId = undefined;
    await user.save();
    res.json({ success: true, message: 'Avatar removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update cover photo
// @route   PUT /api/users/cover
export const updateCoverPhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user.coverPhotoPublicId) {
      await deleteFromCloudinary(user.coverPhotoPublicId).catch(() => {});
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No image provided' });

    const result = await uploadToCloudinary(req.file.path, 'nexvibe/covers', {
      transformation: [{ width: 1080, height: 400, crop: 'fill' }]
    });
    fs.unlinkSync(req.file.path);

    user.coverPhoto = result.secure_url;
    user.coverPhotoPublicId = result.public_id;
    await user.save();

    res.json({ success: true, message: 'Cover photo updated', coverPhoto: result.secure_url });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Follow / Unfollow user
// @route   POST /api/users/:id/follow
export const followUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user._id);

    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    if (targetUser.blockedUsers.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Cannot follow this user' });
    }

    const isFollowing = currentUser.following.includes(req.params.id);

    if (isFollowing) {
      // Unfollow
      currentUser.following.pull(req.params.id);
      targetUser.followers.pull(req.user._id);
      await Promise.all([currentUser.save(), targetUser.save()]);
      return res.json({ success: true, message: 'Unfollowed', isFollowing: false });
    }

    if (targetUser.isPrivate) {
      // Send follow request
      if (!targetUser.followRequests.includes(req.user._id)) {
        targetUser.followRequests.push(req.user._id);
        currentUser.sentFollowRequests.push(req.params.id);
        await Promise.all([targetUser.save(), currentUser.save()]);

        // Notify target user
        const io = req.app.get('io');
        await Notification.create({
          recipient: targetUser._id,
          sender: req.user._id,
          type: 'follow_request',
          text: `${currentUser.fullName} requested to follow you`
        });

        if (io) io.emit('notification:new', { userId: targetUser._id });
      }
      return res.json({ success: true, message: 'Follow request sent', requestSent: true });
    }

    // Public account - follow directly
    currentUser.following.push(req.params.id);
    targetUser.followers.push(req.user._id);
    await Promise.all([currentUser.save(), targetUser.save()]);

    await Notification.create({
      recipient: targetUser._id,
      sender: req.user._id,
      type: 'follow',
      text: `${currentUser.fullName} started following you`
    });

    const io = req.app.get('io');
    if (io) io.emit('notification:new', { userId: targetUser._id });

    res.json({ success: true, message: 'Following', isFollowing: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Accept/Decline follow request
// @route   POST /api/users/follow-requests/:requesterId/respond
export const respondFollowRequest = async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'decline'
    const currentUser = await User.findById(req.user._id);
    const requester = await User.findById(req.params.requesterId);

    if (!requester) return res.status(404).json({ success: false, message: 'User not found' });

    currentUser.followRequests.pull(req.params.requesterId);
    requester.sentFollowRequests.pull(req.user._id);

    if (action === 'accept') {
      currentUser.followers.push(req.params.requesterId);
      requester.following.push(req.user._id);

      await Notification.create({
        recipient: requester._id,
        sender: req.user._id,
        type: 'follow_accept',
        text: `${currentUser.fullName} accepted your follow request`
      });
    }

    await Promise.all([currentUser.save(), requester.save()]);
    res.json({ success: true, message: `Follow request ${action}ed` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get follow requests
// @route   GET /api/users/follow-requests
export const getFollowRequests = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('followRequests', 'username fullName avatar isVerified bio');
    res.json({ success: true, requests: user.followRequests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Block / Unblock user
// @route   POST /api/users/:id/block
export const blockUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot block yourself' });
    }

    const currentUser = await User.findById(req.user._id);
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    const isBlocked = currentUser.blockedUsers.includes(req.params.id);

    if (isBlocked) {
      currentUser.blockedUsers.pull(req.params.id);
      await currentUser.save();
      return res.json({ success: true, message: 'User unblocked', isBlocked: false });
    }

    // Block - also unfollow both ways
    currentUser.blockedUsers.push(req.params.id);
    currentUser.following.pull(req.params.id);
    currentUser.followers.pull(req.params.id);
    targetUser.following.pull(req.user._id);
    targetUser.followers.pull(req.user._id);

    await Promise.all([currentUser.save(), targetUser.save()]);
    res.json({ success: true, message: 'User blocked', isBlocked: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mute / Unmute user
// @route   POST /api/users/:id/mute
export const muteUser = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);
    const isMuted = currentUser.mutedUsers.includes(req.params.id);

    if (isMuted) {
      currentUser.mutedUsers.pull(req.params.id);
      await currentUser.save();
      return res.json({ success: true, message: 'User unmuted', isMuted: false });
    }

    currentUser.mutedUsers.push(req.params.id);
    await currentUser.save();
    res.json({ success: true, message: 'User muted', isMuted: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Restrict / Unrestrict user
// @route   POST /api/users/:id/restrict
export const restrictUser = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);
    const isRestricted = currentUser.restrictedUsers.includes(req.params.id);

    if (isRestricted) {
      currentUser.restrictedUsers.pull(req.params.id);
    } else {
      currentUser.restrictedUsers.push(req.params.id);
    }

    await currentUser.save();
    res.json({ success: true, message: isRestricted ? 'User unrestricted' : 'User restricted', isRestricted: !isRestricted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add/Remove close friend
// @route   POST /api/users/:id/close-friend
export const toggleCloseFriend = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);
    const isCloseFriend = currentUser.closeFriends.includes(req.params.id);

    if (isCloseFriend) {
      currentUser.closeFriends.pull(req.params.id);
    } else {
      currentUser.closeFriends.push(req.params.id);
    }

    await currentUser.save();
    res.json({ success: true, isCloseFriend: !isCloseFriend });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get suggested users
// @route   GET /api/users/suggestions
export const getSuggestions = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);
    const excludeIds = [req.user._id, ...currentUser.following, ...currentUser.blockedUsers];

    const users = await User.find({
      _id: { $nin: excludeIds },
      isBanned: false,
      isDeactivated: false
    })
      .select('username fullName avatar isVerified bio followers')
      .limit(20)
      .sort({ createdAt: -1 });

    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get followers
// @route   GET /api/users/:id/followers
export const getFollowers = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('followers', 'username fullName avatar isVerified bio');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, followers: user.followers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get following
// @route   GET /api/users/:id/following
export const getFollowing = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('following', 'username fullName avatar isVerified bio');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, following: user.following });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update privacy settings
// @route   PUT /api/users/settings/privacy
export const updatePrivacySettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.settings.privacy = { ...user.settings.privacy, ...req.body };
    if (req.body.isPrivate !== undefined) user.isPrivate = req.body.isPrivate;
    await user.save();
    res.json({ success: true, message: 'Privacy settings updated', settings: user.settings.privacy });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update notification settings
// @route   PUT /api/users/settings/notifications
export const updateNotificationSettings = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.settings.notifications = { ...user.settings.notifications, ...req.body };
    await user.save();
    res.json({ success: true, message: 'Notification settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Deactivate account
// @route   POST /api/users/deactivate
export const deactivateAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.isDeactivated = true;
    user.deactivatedAt = new Date();
    await user.save();

    res.cookie('token', '', { expires: new Date(0), httpOnly: true });
    res.json({ success: true, message: 'Account deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete account permanently
// @route   DELETE /api/users/delete-account
export const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (user.authProvider === 'local' && !(await user.comparePassword(password))) {
      return res.status(400).json({ success: false, message: 'Incorrect password' });
    }

    // Delete all posts, stories, etc.
    await Post.deleteMany({ author: req.user._id });
    await User.findByIdAndDelete(req.user._id);

    res.cookie('token', '', { expires: new Date(0), httpOnly: true });
    res.json({ success: true, message: 'Account deleted permanently' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get blocked users
// @route   GET /api/users/blocked
export const getBlockedUsers = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('blockedUsers', 'username fullName avatar');
    res.json({ success: true, blockedUsers: user.blockedUsers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Remove follower
// @route   DELETE /api/users/followers/:id/remove
export const removeFollower = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);
    const follower = await User.findById(req.params.id);
    if (!follower) return res.status(404).json({ success: false, message: 'User not found' });

    currentUser.followers.pull(req.params.id);
    follower.following.pull(req.user._id);
    await Promise.all([currentUser.save(), follower.save()]);

    res.json({ success: true, message: 'Follower removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update account type
// @route   PUT /api/users/account-type
export const updateAccountType = async (req, res) => {
  try {
    const { accountType } = req.body;
    if (!['personal', 'creator', 'business'].includes(accountType)) {
      return res.status(400).json({ success: false, message: 'Invalid account type' });
    }
    const user = await User.findByIdAndUpdate(req.user._id, { accountType }, { new: true });
    res.json({ success: true, message: 'Account type updated', user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Request email change - send OTP
// @route   POST /api/users/change-email/request
export const requestEmailChange = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const exists = await User.findOne({ email: newEmail });
    if (exists) return res.status(400).json({ success: false, message: 'Email already in use' });

    const user = await User.findById(req.user._id);
    const otp = user.generateOTP('change_email');
    user.pendingEmail = newEmail;
    await user.save();
    await sendOTPEmail({ ...user.toObject(), email: newEmail }, otp, 'change_email');

    res.json({ success: true, message: 'OTP sent to new email' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Confirm email change
// @route   POST /api/users/change-email/confirm
export const confirmEmailChange = async (req, res) => {
  try {
    const { otp } = req.body;
    const user = await User.findById(req.user._id);

    if (!user.otp || user.otp !== otp || new Date() > user.otpExpiry) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    const oldEmail = user.email;
    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    await sendEmailChangedEmail(oldEmail, user);
    res.json({ success: true, message: 'Email updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
