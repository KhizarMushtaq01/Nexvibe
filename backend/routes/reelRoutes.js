import express from 'express';
import Post from '../models/Post.js';
import { protect } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

const router = express.Router();

// Get reels feed
router.get('/feed', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const currentUser = await User.findById(req.user._id);
    const feedUserIds = [req.user._id, ...currentUser.following];

    const reels = await Post.find({
      type: 'reel',
      isDeleted: false,
      $or: [
        { author: { $in: feedUserIds } },
        { visibility: 'public' }
      ]
    })
      .populate('author', 'username fullName avatar isVerified')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, reels, hasMore: reels.length === parseInt(limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
