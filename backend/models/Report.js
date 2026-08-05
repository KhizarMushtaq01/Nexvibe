import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  targetType: { type: String, enum: ['post', 'user', 'message'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },

  reason: {
    type: String,
    enum: ['spam', 'nudity', 'harassment', 'hate_speech', 'violence', 'false_info', 'other'],
    required: true
  },
  note: { type: String, maxlength: 500 },
  evidenceContent: { type: String, maxlength: 2000 }, // only used when targetType === 'message'; the reporting client's own already-decrypted copy

  status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  resolution: { type: String, enum: ['dismissed', 'content_removed', 'user_banned'] },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date

}, { timestamps: true });

reportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
reportSchema.index({ status: 1, targetType: 1, targetId: 1 });

const Report = mongoose.model('Report', reportSchema);
export default Report;
