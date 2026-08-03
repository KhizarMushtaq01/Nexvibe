import User from '../models/User.js';
import Post from '../models/Post.js';

export const search = async (req, res) => {
  try {
    const { q, type = 'all', page = 1, limit = 20 } = req.query;
    if (!q || q.trim().length < 1) {
      return res.status(400).json({ success: false, message: 'Query required' });
    }

    const regex = { $regex: q, $options: 'i' };
    const results = {};

    if (type === 'all' || type === 'users') {
      results.users = await User.find({
        $or: [{ username: regex }, { fullName: regex }],
        isBanned: false,
        isDeactivated: false
      })
        .select('username fullName avatar isVerified bio followers')
        .limit(type === 'users' ? parseInt(limit) : 5);
    }

    if (type === 'all' || type === 'posts') {
      results.posts = await Post.find({
        $or: [
          { caption: regex },
          { hashtags: q.replace('#', '').toLowerCase() }
        ],
        visibility: 'public',
        isDeleted: false
      })
        .populate('author', 'username fullName avatar isVerified')
        .sort({ createdAt: -1 })
        .limit(type === 'posts' ? parseInt(limit) : 6);
    }

    if (type === 'all' || type === 'hashtags') {
      const hashtags = await Post.aggregate([
        { $match: { hashtags: { $regex: q.replace('#', ''), $options: 'i' }, isDeleted: false, visibility: 'public' } },
        { $unwind: '$hashtags' },
        { $match: { hashtags: { $regex: q.replace('#', ''), $options: 'i' } } },
        { $group: { _id: '$hashtags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
      results.hashtags = hashtags;
    }

    res.json({ success: true, results, query: q });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSearchSuggestions = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, suggestions: [] });

    const users = await User.find({
      $or: [
        { username: { $regex: `^${q}`, $options: 'i' } },
        { fullName: { $regex: q, $options: 'i' } }
      ],
      isBanned: false
    })
      .select('username fullName avatar isVerified')
      .limit(8);

    res.json({ success: true, suggestions: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
