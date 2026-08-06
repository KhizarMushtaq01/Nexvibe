import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  text: { type: String, required: true, maxlength: 500, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  moderatedAt: Date,
}, { timestamps: true });

reviewSchema.index({ status: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);
export default Review;
