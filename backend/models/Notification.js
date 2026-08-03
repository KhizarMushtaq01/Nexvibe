import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  type: {
    type: String,
    enum: [
      'like', 'comment', 'reply', 'follow', 'follow_request', 'follow_accept',
      'mention', 'tag', 'story_view', 'story_reaction', 'post_share',
      'message', 'comment_like', 'reel_like', 'reel_comment',
      'live', 'reminder', 'security', 'system'
    ],
    required: true
  },
  
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  story: { type: mongoose.Schema.Types.ObjectId, ref: 'Story' },
  comment: mongoose.Schema.Types.ObjectId,
  
  text: String,
  
  isRead: { type: Boolean, default: false },
  readAt: Date,
  
  isSeen: { type: Boolean, default: false }

}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
