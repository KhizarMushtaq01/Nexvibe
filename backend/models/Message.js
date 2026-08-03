import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file', 'sticker', 'gif', 'post', 'story', 'reel', 'location', 'call'],
    default: 'text'
  },
  
  content: String,
  
  media: {
    url: String,
    publicId: String,
    thumbnail: String,
    duration: Number,
    name: String,
    size: Number
  },
  
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  
  sharedPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  sharedStory: { type: mongoose.Schema.Types.ObjectId, ref: 'Story' },
  
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: String
  }],
  
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  
  deliveredTo: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deliveredAt: { type: Date, default: Date.now }
  }],
  
  isDeleted: { type: Boolean, default: false },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isEdited: { type: Boolean, default: false },
  editedAt: Date,
  
  isUnsent: { type: Boolean, default: false }
  
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  type: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct'
  },
  
  // Group specific
  groupName: String,
  groupAvatar: String,
  groupAvatarPublicId: String,
  groupDescription: String,
  groupAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  lastMessageAt: { type: Date, default: Date.now },
  
  mutedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    until: Date
  }],
  
  pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  disappearingMessages: {
    enabled: { type: Boolean, default: false },
    duration: { type: Number, default: 86400 } // seconds
  },
  
  isEncrypted: { type: Boolean, default: false },
  
  archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  
}, { timestamps: true });

conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
messageSchema.index({ conversation: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
export const Conversation = mongoose.model('Conversation', conversationSchema);
