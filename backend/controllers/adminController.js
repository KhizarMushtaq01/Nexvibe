import User from '../models/User.js';
import Post from '../models/Post.js';
import { Message } from '../models/Message.js';
import Notification from '../models/Notification.js';
import Story from '../models/Story.js';

export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers, activeUsers, bannedUsers,
      totalPosts, totalStories,
      newUsersToday, newPostsToday,
      verifiedUsers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isDeactivated: false, isBanned: false }),
      User.countDocuments({ isBanned: true }),
      Post.countDocuments({ isDeleted: false }),
      Story.countDocuments(),
      User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      Post.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      User.countDocuments({ isVerified: true })
    ]);

    // Growth data - last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const postGrowth = await Post.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, isDeleted: false } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      stats: { totalUsers, activeUsers, bannedUsers, totalPosts, totalStories, newUsersToday, newPostsToday, verifiedUsers },
      userGrowth,
      postGrowth
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) query.role = role;
    if (status === 'banned') query.isBanned = true;
    if (status === 'active') query.isBanned = false;
    if (status === 'verified') query.isVerified = true;

    const users = await User.find(query)
      .select('-password -otp -emailVerifyToken -passwordResetToken')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({ success: true, users, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const banUser = async (req, res) => {
  try {
    const { reason, duration } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot ban admin' });

    user.isBanned = true;
    user.banReason = reason || 'Policy violation';
    await user.save();

    res.json({ success: true, message: `User ${user.username} banned` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const unbanUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isBanned: false, banReason: '' }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: `User ${user.username} unbanned` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const verifyUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isVerified = !user.isVerified;
    await user.save();
    res.json({ success: true, message: `User ${user.isVerified ? 'verified' : 'unverified'}`, isVerified: user.isVerified });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const changeUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllPosts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const query = { isDeleted: false };
    if (search) query.caption = { $regex: search, $options: 'i' };

    const posts = await Post.find(query)
      .populate('author', 'username fullName avatar isVerified')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Post.countDocuments(query);
    res.json({ success: true, posts, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePostAdmin = async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(req.params.id, { isDeleted: true });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    res.json({ success: true, message: 'Post removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -otp');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const postsCount = await Post.countDocuments({ author: user._id, isDeleted: false });
    res.json({ success: true, user: { ...user.toObject(), postsCount } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteUserAdmin = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot delete admin user' });

    await Post.deleteMany({ author: user._id });
    await User.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'User deleted permanently' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const sendSystemNotification = async (req, res) => {
  try {
    const { userIds, text, type = 'system' } = req.body;
    const targets = userIds === 'all' ? await User.find({}).select('_id') : userIds.map(id => ({ _id: id }));

    const notifications = targets.map(u => ({
      recipient: u._id,
      type,
      text
    }));

    await Notification.insertMany(notifications);
    res.json({ success: true, message: `Notification sent to ${targets.length} users` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
