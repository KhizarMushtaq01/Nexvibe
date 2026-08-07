import Post from '../models/Post.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { getHiddenPrivateAuthorIds } from '../utils/privacy.js';
import fs from 'fs';

// @desc    Create post
// @route   POST /api/posts
export const createPost = async (req, res) => {
  try {
    const { caption, location, visibility, allowComments, hideLikeCount, tags, altText, type } = req.body;
    const hashtags = caption ? (caption.match(/#\w+/g) || []).map(h => h.toLowerCase()) : [];
    const mentions = caption ? (caption.match(/@\w+/g) || []) : [];

    const isReelUpload = type === 'reel' && req.files?.length === 1 && req.files[0].mimetype.startsWith('video/');

    const mediaFiles = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const isVideo = file.mimetype.startsWith('video/');
        const result = await uploadToCloudinary(file.path, isReelUpload ? 'nexvibe/reels' : 'nexvibe/posts', {
          resource_type: isVideo ? 'video' : 'image',
          ...(isVideo ? {} : { transformation: [{ quality: 'auto', fetch_format: 'auto' }] })
        });
        mediaFiles.push({
          url: result.secure_url,
          publicId: result.public_id,
          type: isVideo ? 'video' : 'image',
          width: result.width,
          height: result.height,
          duration: result.duration || null,
          thumbnail: isVideo ? result.thumbnail_url : result.secure_url
        });
        fs.unlinkSync(file.path);
      }
    }

    const post = await Post.create({
      author: req.user._id,
      caption,
      media: mediaFiles,
      hashtags,
      location: location ? JSON.parse(location) : undefined,
      visibility: visibility || 'public',
      allowComments: allowComments !== 'false',
      hideLikeCount: hideLikeCount === 'true',
      altText,
      type: isReelUpload ? 'reel' : (mediaFiles.length > 1 ? 'carousel' : 'post')
    });

    await Post.findById(post._id).populate('author', 'username fullName avatar isVerified');
    await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: 1 } });

    // Notify mentioned users
    for (const mention of mentions) {
      const mentionedUser = await User.findOne({ username: mention.slice(1) });
      if (mentionedUser && mentionedUser._id.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: mentionedUser._id,
          sender: req.user._id,
          type: 'mention',
          post: post._id,
          text: `${req.user.fullName} mentioned you in a post`
        });
      }
    }

    const populated = await Post.findById(post._id).populate('author', 'username fullName avatar isVerified');
    res.status(201).json({ success: true, message: 'Post created', post: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get feed posts
// @route   GET /api/posts/feed
export const getFeed = async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const currentUser = await User.findById(req.user._id);

    const feedUserIds = [req.user._id, ...currentUser.following];

    const posts = await Post.find({
      author: { $in: feedUserIds },
      visibility: { $in: ['public', 'followers'] },
      isDeleted: false,
      isArchived: false,
      type: { $ne: 'reel' }
    })
      .populate('author', 'username fullName avatar isVerified isPrivate')
      .populate('likes', 'username fullName avatar')
      .populate({
        path: 'comments',
        match: { isDeleted: false },
        options: { sort: { createdAt: -1 }, limit: 3 },
        populate: { path: 'user', select: 'username fullName avatar isVerified' }
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Post.countDocuments({
      author: { $in: feedUserIds },
      isDeleted: false,
      isArchived: false,
      type: { $ne: 'reel' }
    });

    res.json({
      success: true,
      posts,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get explore/discover posts
// @route   GET /api/posts/explore
export const getExplorePosts = async (req, res) => {
  try {
    const { page = 1, limit = 18 } = req.query;
    const currentUser = await User.findById(req.user._id);
    const excluded = currentUser ? [...currentUser.following, req.user._id, ...currentUser.blockedUsers] : [];
    const hiddenAuthorIds = await getHiddenPrivateAuthorIds(req.user);

    const posts = await Post.find({
      visibility: 'public',
      isDeleted: false,
      isArchived: false,
      'media.0': { $exists: true },
      author: { $nin: hiddenAuthorIds }
    })
      .populate('author', 'username fullName avatar isVerified')
      .sort({ likesCount: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, posts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single post
// @route   GET /api/posts/:id
export const getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'username fullName avatar isVerified isPrivate')
      .populate('likes', 'username fullName avatar isVerified')
      .populate('tags', 'username fullName avatar')
      .populate({
        path: 'comments',
        match: { isDeleted: false },
        populate: [
          { path: 'user', select: 'username fullName avatar isVerified' },
          { path: 'replies.user', select: 'username fullName avatar isVerified' }
        ]
      });

    if (!post || post.isDeleted) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const isOwner = !!req.user && post.author._id.toString() === req.user._id.toString();
    const isFollower = !!req.user && req.user.following.some(id => id.toString() === post.author._id.toString());
    if (post.author.isPrivate && !isOwner && !isFollower) {
      return res.status(403).json({ success: false, message: 'This account is private' });
    }

    // Increment view count
    post.viewCount += 1;
    await post.save();

    res.json({ success: true, post });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get user posts
// @route   GET /api/posts/user/:userId
export const getUserPosts = async (req, res) => {
  try {
    const { page = 1, limit = 12, type } = req.query;
    const isOwnProfile = req.user && req.user._id.toString() === req.params.userId;

    if (!isOwnProfile) {
      const author = await User.findById(req.params.userId).select('isPrivate');
      const isFollower = !!req.user && req.user.following.some(id => id.toString() === req.params.userId);
      if (author?.isPrivate && !isFollower) {
        return res.json({ success: true, posts: [], total: 0, hasMore: false });
      }
    }

    const query = {
      author: req.params.userId,
      isDeleted: false,
      isArchived: false
    };

    if (type) query.type = type;
    if (!isOwnProfile) query.visibility = { $in: ['public', 'followers'] };

    const posts = await Post.find(query)
      .populate('author', 'username fullName avatar isVerified')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Post.countDocuments(query);

    res.json({
      success: true,
      posts,
      total,
      hasMore: page * limit < total
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Like / Unlike post
// @route   POST /api/posts/:id/like
export const likePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const isLiked = post.likes.includes(req.user._id);

    if (isLiked) {
      post.likes.pull(req.user._id);
    } else {
      post.likes.push(req.user._id);

      if (post.author.toString() !== req.user._id.toString()) {
        await Notification.create({
          recipient: post.author,
          sender: req.user._id,
          type: 'like',
          post: post._id,
          text: `${req.user.fullName} liked your post`
        });

        const io = req.app.get('io');
        if (io) io.emit('post:liked', { ownerId: post.author, likerId: req.user._id, postId: post._id });
      }
    }

    await post.save();
    res.json({ success: true, isLiked: !isLiked, likesCount: post.likes.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add comment
// @route   POST /api/posts/:id/comments
export const addComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'Comment text required' });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (!post.allowComments) return res.status(403).json({ success: false, message: 'Comments disabled on this post' });

    const comment = { user: req.user._id, text, createdAt: new Date() };
    post.comments.push(comment);
    await post.save();

    // Populate new comment
    const populated = await Post.findById(post._id).populate({
      path: 'comments',
      populate: { path: 'user', select: 'username fullName avatar isVerified' }
    });
    const newComment = populated.comments[populated.comments.length - 1];

    if (post.author.toString() !== req.user._id.toString()) {
      await Notification.create({
        recipient: post.author,
        sender: req.user._id,
        type: 'comment',
        post: post._id,
        comment: newComment._id,
        text: `${req.user.fullName} commented: "${text.substring(0, 50)}"`
      });
    }

    res.status(201).json({ success: true, comment: newComment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reply to comment
// @route   POST /api/posts/:id/comments/:commentId/reply
export const replyToComment = async (req, res) => {
  try {
    const { text } = req.body;
    const post = await Post.findById(req.params.id);
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    comment.replies.push({ user: req.user._id, text });
    await post.save();

    const populated = await Post.findById(post._id).populate({
      path: 'comments',
      populate: [
        { path: 'user', select: 'username fullName avatar isVerified' },
        { path: 'replies.user', select: 'username fullName avatar isVerified' }
      ]
    });

    const updatedComment = populated.comments.id(req.params.commentId);

    if (comment.user.toString() !== req.user._id.toString()) {
      await Notification.create({
        recipient: comment.user,
        sender: req.user._id,
        type: 'reply',
        post: post._id,
        comment: comment._id,
        text: `${req.user.fullName} replied to your comment`
      });
    }

    res.status(201).json({ success: true, comment: updatedComment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete comment
// @route   DELETE /api/posts/:id/comments/:commentId
export const deleteComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    if (comment.user.toString() !== req.user._id.toString() && post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    comment.isDeleted = true;
    await post.save();
    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Like comment
// @route   POST /api/posts/:id/comments/:commentId/like
export const likeComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    const isLiked = comment.likes.includes(req.user._id);
    isLiked ? comment.likes.pull(req.user._id) : comment.likes.push(req.user._id);
    await post.save();

    res.json({ success: true, isLiked: !isLiked, likesCount: comment.likes.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Pin/Unpin comment
// @route   POST /api/posts/:id/comments/:commentId/pin
export const pinComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only post author can pin comments' });
    }

    // Unpin all first
    post.comments.forEach(c => { c.isPinned = false; });
    const comment = post.comments.id(req.params.commentId);
    if (comment) comment.isPinned = !comment.isPinned;
    await post.save();

    res.json({ success: true, message: comment?.isPinned ? 'Comment pinned' : 'Comment unpinned' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Save / Unsave post
// @route   POST /api/posts/:id/save
export const savePost = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const isSaved = user.savedPosts.includes(req.params.id);

    if (isSaved) {
      user.savedPosts.pull(req.params.id);
      await Post.findByIdAndUpdate(req.params.id, { $pull: { savedBy: req.user._id } });
    } else {
      user.savedPosts.push(req.params.id);
      await Post.findByIdAndUpdate(req.params.id, { $addToSet: { savedBy: req.user._id } });
    }

    await user.save();
    res.json({ success: true, isSaved: !isSaved, message: isSaved ? 'Removed from saved' : 'Post saved' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get saved posts
// @route   GET /api/posts/saved
export const getSavedPosts = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'savedPosts',
      match: { isDeleted: false },
      populate: { path: 'author', select: 'username fullName avatar isVerified' }
    });
    res.json({ success: true, posts: user.savedPosts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete post
// @route   DELETE /api/posts/:id
export const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Delete media from cloudinary
    for (const media of post.media) {
      if (media.publicId) await deleteFromCloudinary(media.publicId).catch(() => {});
    }

    post.isDeleted = true;
    await post.save();
    await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: -1 } });

    res.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Archive / Unarchive post
// @route   POST /api/posts/:id/archive
export const archivePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    post.isArchived = !post.isArchived;
    await post.save();
    res.json({ success: true, isArchived: post.isArchived, message: post.isArchived ? 'Post archived' : 'Post unarchived' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get archived posts
// @route   GET /api/posts/archived
export const getArchivedPosts = async (req, res) => {
  try {
    const posts = await Post.find({ author: req.user._id, isArchived: true, isDeleted: false })
      .populate('author', 'username fullName avatar')
      .sort({ createdAt: -1 });
    res.json({ success: true, posts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update post
// @route   PUT /api/posts/:id
export const updatePost = async (req, res) => {
  try {
    const { caption, location, visibility, allowComments, hideLikeCount, altText } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post || post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (caption !== undefined) {
      post.caption = caption;
      post.hashtags = caption.match(/#\w+/g)?.map(h => h.toLowerCase()) || [];
    }
    if (location !== undefined) post.location = JSON.parse(location);
    if (visibility !== undefined) post.visibility = visibility;
    if (allowComments !== undefined) post.allowComments = allowComments;
    if (hideLikeCount !== undefined) post.hideLikeCount = hideLikeCount;
    if (altText !== undefined) post.altText = altText;

    await post.save();
    const populated = await Post.findById(post._id).populate('author', 'username fullName avatar isVerified');
    res.json({ success: true, message: 'Post updated', post: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Pin/Unpin post to profile
// @route   POST /api/posts/:id/pin
export const pinPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await Post.updateMany({ author: req.user._id }, { isPinned: false });
    post.isPinned = !post.isPinned;
    await post.save();
    res.json({ success: true, isPinned: post.isPinned });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get trending hashtags
// @route   GET /api/posts/trending
export const getTrending = async (req, res) => {
  try {
    const trending = await Post.aggregate([
      { $match: { isDeleted: false, visibility: 'public', createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
      { $unwind: '$hashtags' },
      { $group: { _id: '$hashtags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    res.json({ success: true, trending });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get posts by hashtag
// @route   GET /api/posts/hashtag/:tag
export const getHashtagPosts = async (req, res) => {
  try {
    const { page = 1, limit = 18 } = req.query;
    const hiddenAuthorIds = await getHiddenPrivateAuthorIds(req.user);
    const query = {
      hashtags: req.params.tag.toLowerCase(),
      visibility: 'public',
      isDeleted: false,
      author: { $nin: hiddenAuthorIds }
    };

    const posts = await Post.find(query)
      .populate('author', 'username fullName avatar isVerified')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Post.countDocuments(query);
    res.json({ success: true, posts, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
