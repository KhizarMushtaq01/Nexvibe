import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 2200 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replies: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, maxlength: 2200 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false }
  }],
  isDeleted: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false }
}, { timestamps: true });

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  caption: {
    type: String,
    maxlength: 2200,
    default: ''
  },
  media: [{
    url: String,
    publicId: String,
    type: { type: String, enum: ['image', 'video'], default: 'image' },
    thumbnail: String,
    width: Number,
    height: Number,
    duration: Number,
    altText: String
  }],
  type: {
    type: String,
    enum: ['post', 'reel', 'story', 'carousel'],
    default: 'post'
  },
  location: {
    name: String,
    lat: Number,
    lng: Number
  },
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  hashtags: [String],
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema],
  
  savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sharedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  viewCount: { type: Number, default: 0 },
  shareCount: { type: Number, default: 0 },
  
  visibility: {
    type: String,
    enum: ['public', 'followers', 'closeFriends', 'private'],
    default: 'public'
  },
  
  isArchived: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  
  allowComments: { type: Boolean, default: true },
  hideLikeCount: { type: Boolean, default: false },
  
  music: {
    title: String,
    artist: String,
    url: String
  },
  
  originalPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' }, // for reposts
  
  filter: String,
  
  altText: String,
  
  boost: {
    isActive: { type: Boolean, default: false },
    endDate: Date,
    budget: Number
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

postSchema.virtual('likesCount').get(function () {
  return this.likes?.length || 0;
});

postSchema.virtual('commentsCount').get(function () {
  return this.comments?.filter(c => !c.isDeleted).length || 0;
});

postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ hashtags: 1 });
postSchema.index({ caption: 'text' });
postSchema.index({ visibility: 1 });

const Post = mongoose.model('Post', postSchema);
export default Post;
