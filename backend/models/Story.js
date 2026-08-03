import mongoose from 'mongoose';

const storySchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  media: {
    url: { type: String, required: true },
    publicId: String,
    type: { type: String, enum: ['image', 'video'], default: 'image' },
    duration: Number,
    thumbnail: String
  },
  text: String,
  textStyle: {
    font: String,
    size: Number,
    color: String,
    bgColor: String,
    position: { x: Number, y: Number }
  },
  stickers: [{
    type: String,
    value: String,
    position: { x: Number, y: Number },
    size: Number
  }],
  music: {
    title: String,
    artist: String,
    url: String,
    startTime: Number
  },
  link: String,
  
  viewers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now }
  }],
  
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String,
    createdAt: { type: Date, default: Date.now }
  }],
  
  replies: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  
  visibility: {
    type: String,
    enum: ['public', 'followers', 'closeFriends', 'custom'],
    default: 'followers'
  },
  hiddenFrom: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  filter: String,
  
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  },
  
  isHighlight: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false }

}, { timestamps: true });

storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ author: 1, createdAt: -1 });

const Story = mongoose.model('Story', storySchema);
export default Story;
