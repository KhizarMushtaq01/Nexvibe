import Report from '../models/Report.js';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { Message, Conversation } from '../models/Message.js';

const REASONS = ['spam', 'nudity', 'harassment', 'hate_speech', 'violence', 'false_info', 'other'];

export const createReport = async (req, res) => {
  try {
    const { targetType, targetId, reason, note, evidenceContent } = req.body;

    if (!['post', 'user', 'message'].includes(targetType)) {
      return res.status(400).json({ success: false, message: 'Invalid targetType' });
    }
    if (!REASONS.includes(reason)) {
      return res.status(400).json({ success: false, message: 'Invalid reason' });
    }

    if (targetType === 'user') {
      if (targetId === req.user._id.toString()) {
        return res.status(400).json({ success: false, message: "You can't report yourself" });
      }
      const target = await User.findById(targetId);
      if (!target) return res.status(404).json({ success: false, message: 'User not found' });
    } else if (targetType === 'post') {
      const target = await Post.findById(targetId);
      if (!target || target.isDeleted) return res.status(404).json({ success: false, message: 'Post not found' });
      if (target.author.toString() === req.user._id.toString()) {
        return res.status(400).json({ success: false, message: "You can't report your own post" });
      }
    } else {
      const target = await Message.findById(targetId);
      if (!target) return res.status(404).json({ success: false, message: 'Message not found' });
      const conversation = await Conversation.findById(target.conversation);
      if (!conversation?.participants.some(p => p.toString() === req.user._id.toString())) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
      if (target.sender.toString() === req.user._id.toString()) {
        return res.status(400).json({ success: false, message: "You can't report your own message" });
      }
      if (!evidenceContent?.trim()) {
        return res.status(400).json({ success: false, message: 'evidenceContent is required for message reports' });
      }
    }

    const existing = await Report.findOne({ reporter: req.user._id, targetType, targetId, status: 'pending' });
    if (existing) {
      return res.status(400).json({ success: false, message: "You've already reported this" });
    }

    await Report.create({ reporter: req.user._id, targetType, targetId, reason, note, evidenceContent });
    res.status(201).json({ success: true, message: 'Report submitted' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid target id' });
    }
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "You've already reported this" });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};
