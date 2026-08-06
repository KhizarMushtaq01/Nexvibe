import User from '../models/User.js';
import Post from '../models/Post.js';
import { Message } from '../models/Message.js';
import Notification from '../models/Notification.js';
import Story from '../models/Story.js';
import Report from '../models/Report.js';

export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers, activeUsers, bannedUsers,
      totalPosts, totalStories,
      newUsersToday, newPostsToday,
      verifiedUsers, pendingReportsResult
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isDeactivated: false, isBanned: false }),
      User.countDocuments({ isBanned: true }),
      Post.countDocuments({ isDeleted: false }),
      Story.countDocuments(),
      User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      Post.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      User.countDocuments({ isVerified: true }),
      Report.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: { targetType: '$targetType', targetId: '$targetId' } } },
        { $count: 'total' }
      ])
    ]);
    const pendingReports = pendingReportsResult[0]?.total || 0;

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
      stats: { totalUsers, activeUsers, bannedUsers, totalPosts, totalStories, newUsersToday, newPostsToday, verifiedUsers, pendingReports },
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
    if (user.role === 'admin' || user.role === 'superadmin') return res.status(403).json({ success: false, message: 'Cannot ban admin' });

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
    if (!['user', 'moderator', 'admin', 'superadmin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    // Only a superadmin can grant or revoke the superadmin role.
    if ((role === 'superadmin' || target.role === 'superadmin') && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Only a superadmin can manage the superadmin role.' });
    }

    target.role = role;
    await target.save();
    res.json({ success: true, user: target });
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
    if (user.role === 'admin' || user.role === 'superadmin') return res.status(403).json({ success: false, message: 'Cannot delete admin user' });

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

export const getReports = async (req, res) => {
  try {
    const { targetType, resolution, page = 1, limit = 20 } = req.query;
    const status = req.query.status === 'resolved' ? 'resolved' : 'pending';
    const match = {
      status,
      ...(targetType ? { targetType } : {}),
      ...(status === 'resolved' && resolution ? { resolution } : {})
    };
    const groupId = { targetType: '$targetType', targetId: '$targetId', resolvedAt: '$resolvedAt' };

    const groups = await Report.aggregate([
      { $match: match },
      { $group: {
          _id: groupId,
          count: { $sum: 1 },
          reasons: { $push: '$reason' },
          reporterIds: { $push: '$reporter' },
          notes: { $push: '$note' },
          evidenceContents: { $push: '$evidenceContent' },
          firstReportedAt: { $min: '$createdAt' },
          lastReportedAt: { $max: '$createdAt' },
          resolution: { $first: '$resolution' },
          resolvedBy: { $first: '$resolvedBy' }
      } },
      { $sort: status === 'resolved' ? { '_id.resolvedAt': -1 } : { lastReportedAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    ]);

    const totalResult = await Report.aggregate([
      { $match: match },
      { $group: { _id: groupId } },
      { $count: 'total' }
    ]);
    const total = totalResult[0]?.total || 0;

    const results = await Promise.all(groups.map(async (g) => {
      const { targetType: gType, targetId, resolvedAt } = g._id;
      let target = null;
      let targetMissing = false;

      if (gType === 'post') {
        target = await Post.findById(targetId).populate('author', 'username fullName avatar');
        if (target?.isDeleted) target = null;
      } else if (gType === 'user') {
        target = await User.findById(targetId).select('username fullName avatar isBanned');
      } else {
        target = await Message.findById(targetId).populate('sender', 'username fullName avatar');
      }
      if (!target) targetMissing = true;

      const reporters = await User.find({ _id: { $in: g.reporterIds.slice(0, 5) } }).select('username');
      const reasonCounts = g.reasons.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {});
      const notes = (g.notes || []).filter(Boolean);
      const resolvedByUser = g.resolvedBy ? await User.findById(g.resolvedBy).select('username') : null;

      return {
        targetType: gType,
        targetId,
        target,
        targetMissing,
        count: g.count,
        reasonCounts,
        reporters,
        notes,
        evidenceContent: (g.evidenceContents || []).find(Boolean) || null,
        firstReportedAt: g.firstReportedAt,
        lastReportedAt: g.lastReportedAt,
        resolution: g.resolution,
        resolvedAt,
        resolvedByUser: resolvedByUser ? { username: resolvedByUser.username } : null
      };
    }));

    res.json({ success: true, groups: results, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const resolveReport = async (req, res) => {
  try {
    const { targetType, targetId, action } = req.body;
    if (!['post', 'user', 'message'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid targetType' });
    }
    if (!['dismiss', 'remove'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
    if (targetType === 'message' && action === 'remove') {
      return res.status(400).json({ success: false, message: 'Messages can only be dismissed, not removed' });
    }

    let resolution = 'dismissed';
    if (action === 'remove') {
      resolution = targetType === 'post' ? 'content_removed' : 'user_banned';
    }

    // If we're about to ban a user, guard against banning an admin BEFORE
    // touching the reports, so a blocked action doesn't still mark the
    // reports resolved.
    let userToBan = null;
    if (action === 'remove' && targetType === 'user') {
      userToBan = await User.findById(targetId);
      if (userToBan?.role === 'admin' || userToBan?.role === 'superadmin') {
        return res.status(403).json({ success: false, message: 'Cannot ban admin' });
      }
    }

    // Only proceed with the (possibly destructive) action if there are actually
    // pending reports for this target. This also prevents a race between two
    // admins acting on the same group from leaving an inconsistent audit trail.
    const updateResult = await Report.updateMany(
      { targetType, targetId, status: 'pending' },
      { status: 'resolved', resolution, resolvedBy: req.user._id, resolvedAt: new Date() }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'No pending reports for this target' });
    }

    if (action === 'remove') {
      if (targetType === 'post') {
        await Post.findByIdAndUpdate(targetId, { isDeleted: true });
      } else if (userToBan) {
        userToBan.isBanned = true;
        userToBan.banReason = 'Multiple user reports';
        await userToBan.save();
      }
    }

    res.json({ success: true });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};
