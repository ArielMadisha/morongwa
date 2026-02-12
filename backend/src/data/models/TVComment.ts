import mongoose, { Schema, Document } from "mongoose";

export interface ITVComment extends Document {
  postId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  text: string;
  parentId?: mongoose.Types.ObjectId;
  status: "visible" | "hidden" | "removed";
  aiModerated?: boolean;
  likeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const TVCommentSchema = new Schema<ITVComment>(
  {
    postId: { type: Schema.Types.ObjectId, ref: "TVPost", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, maxlength: 1000 },
    parentId: { type: Schema.Types.ObjectId, ref: "TVComment" },
    status: { type: String, enum: ["visible", "hidden", "removed"], default: "visible" },
    aiModerated: { type: Boolean },
    likeCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TVCommentSchema.index({ postId: 1, createdAt: 1 });
TVCommentSchema.index({ userId: 1 });

export default mongoose.model<ITVComment>("TVComment", TVCommentSchema);
