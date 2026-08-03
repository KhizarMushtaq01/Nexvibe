import express from 'express';
import Post from '../models/Post.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/upload.js';
import { createPost } from '../controllers/postController.js';
import User from '../models/User.js';
import fs from 'fs';
import { uploadToCloudinary } from '../config/cloudinary.js';

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

// Create reel
router.post('/', protect, upload.single('media'), async (req, res) => {
  req.body.type = 'reel';
  if (!req.file) return res.status(400).json({ success: false, message: 'Video required for reel' });

  try {
    const result = await uploadToCloudinary(req.file.path, 'nexvibe/reels', { resource_type: 'video' });
    fs.unlinkSync(req.file.path);

    const reel = await Post.create({
      author: req.user._id,
      caption: req.body.caption || '',
      media: [{
        url: result.secure_url,
        publicId: result.public_id,
        type: 'video',
        thumbnail: result.thumbnail_url,
        duration: result.duration
      }],
      type: 'reel',
      visibility: req.body.visibility || 'public',
      music: req.body.music ? JSON.parse(req.body.music) : undefined
    });

    const populated = await Post.findById(reel._id).populate('author', 'username fullName avatar isVerified');
    res.status(201).json({ success: true, reel: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
