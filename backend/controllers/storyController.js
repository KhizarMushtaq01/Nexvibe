// ============= STORY CONTROLLER =============
import Story from '../models/Story.js';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Notification from '../models/Notification.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import fs from 'fs';

export const createStory = async (req, res) => {
  try {
    const { text, textStyle, stickers, music, link, visibility } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'Media required for story' });

    const isVideo = req.file.mimetype.startsWith('video/');
    const result = await uploadToCloudinary(req.file.path, 'nexvibe/stories', {
      resource_type: isVideo ? 'video' : 'image'
    });
    fs.unlinkSync(req.file.path);

    const story = await Story.create({
      author: req.user._id,
      media: {
        url: result.secure_url,
        publicId: result.public_id,
        type: isVideo ? 'video' : 'image',
        duration: result.duration
      },
      text,
      textStyle: textStyle ? JSON.parse(textStyle) : undefined,
      stickers: stickers ? JSON.parse(stickers) : [],
      music: music ? JSON.parse(music) : undefined,
      link,
      visibility: visibility || 'followers'
    });

    const populated = await Story.findById(story._id).populate('author', 'username fullName avatar isVerified');
    res.status(201).json({ success: true, story: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getStories = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);
    const userIds = [req.user._id, ...currentUser.following];

    const stories = await Story.find({
      author: { $in: userIds },
      expiresAt: { $gt: new Date() },
      isArchived: false
    })
      .populate('author', 'username fullName avatar isVerified isPrivate')
      .sort({ createdAt: -1 });

    // Group by author
    const grouped = {};
    stories.forEach(story => {
      const authorId = story.author._id.toString();
      if (!grouped[authorId]) {
        grouped[authorId] = {
          user: story.author,
          stories: [],
          hasUnviewed: false
        };
      }
      grouped[authorId].stories.push(story);
      if (!story.viewers.some(v => v.user.toString() === req.user._id.toString())) {
        grouped[authorId].hasUnviewed = true;
      }
    });

    res.json({ success: true, storyGroups: Object.values(grouped) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const viewStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    const alreadyViewed = story.viewers.some(v => v.user.toString() === req.user._id.toString());
    if (!alreadyViewed) {
      story.viewers.push({ user: req.user._id });
      await story.save();
    }

    res.json({ success: true, message: 'Story viewed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const replyToStory = async (req, res) => {
  try {
    const { text } = req.body;
    const story = await Story.findById(req.params.id).populate('author', 'username');
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    story.replies.push({ user: req.user._id, text });
    await story.save();

    await Notification.create({
      recipient: story.author._id,
      sender: req.user._id,
      type: 'story_reaction',
      story: story._id,
      text: `${req.user.fullName} replied to your story`
    });

    res.json({ success: true, message: 'Reply sent' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const reactToStory = async (req, res) => {
  try {
    const { emoji } = req.body;
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    story.reactions = story.reactions.filter(r => r.user.toString() !== req.user._id.toString());
    story.reactions.push({ user: req.user._id, emoji });
    await story.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story || story.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (story.media?.publicId) await deleteFromCloudinary(story.media.publicId).catch(() => {});
    await story.deleteOne();
    res.json({ success: true, message: 'Story deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getStoryViewers = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id).populate('viewers.user', 'username fullName avatar isVerified');
    if (!story || story.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    res.json({ success: true, viewers: story.viewers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const archiveStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story || story.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    story.isArchived = true;
    story.isHighlight = false;
    await story.save();
    res.json({ success: true, message: 'Story archived' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getArchivedStories = async (req, res) => {
  try {
    const stories = await Story.find({ author: req.user._id, isArchived: true }).sort({ createdAt: -1 });
    res.json({ success: true, stories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addToHighlight = async (req, res) => {
  try {
    const { highlightTitle, highlightId } = req.body;
    const story = await Story.findById(req.params.id);
    if (!story || story.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const user = await User.findById(req.user._id);
    if (highlightId) {
      const highlight = user.highlights.id(highlightId);
      if (highlight) highlight.stories.push(story._id);
    } else {
      user.highlights.push({
        title: highlightTitle || 'Highlight',
        coverImage: story.media.url,
        stories: [story._id]
      });
    }

    story.isHighlight = true;
    await Promise.all([user.save(), story.save()]);
    res.json({ success: true, message: 'Added to highlights' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
