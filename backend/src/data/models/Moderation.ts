// Moderation model for content flagging
import mongoose, { Schema, Document } from "mongoose";

export interface IModeration extends Document {
  contentType: "task" | "review" | "message" | "profile";
  contentId: mongoose.Types.ObjectId;
  reportedBy: mongoose.Types.ObjectId;
  reason: string;
  status: "pending" | "reviewed" | "actioned" | "dismissed";
  reviewedBy?: mongoose.Types.ObjectId;
  actionTaken?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ModerationSchema = new Schema<IModeration>(
  {
    contentType: {
      type: String,
      enum: ["task", "review", "message", "profile"],
      required: true,
    },
    contentId: { type: Schema.Types.ObjectId, required: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "reviewed", "actioned", "dismissed"],
      default: "pending",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    actionTaken: { type: String },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

ModerationSchema.index({ status: 1, createdAt: -1 });
ModerationSchema.index({ contentType: 1, contentId: 1 });

export default mongoose.model<IModeration>("Moderation", ModerationSchema);
