// Review model for rating system
import mongoose, { Schema, Document } from "mongoose";

export interface IReview extends Document {
  task: mongoose.Types.ObjectId;
  reviewer: mongoose.Types.ObjectId;
  reviewee: mongoose.Types.ObjectId;
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    reviewer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 500, trim: true },
  },
  { timestamps: true }
);

ReviewSchema.index({ task: 1, reviewer: 1 }, { unique: true });
ReviewSchema.index({ reviewee: 1, createdAt: -1 });

export default mongoose.model<IReview>("Review", ReviewSchema);
