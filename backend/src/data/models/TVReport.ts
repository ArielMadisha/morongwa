import mongoose, { Schema, Document } from "mongoose";

export type TVReportTargetType = "post" | "comment";

export interface ITVReport extends Document {
  reporterId: mongoose.Types.ObjectId;
  targetType: TVReportTargetType;
  targetId: mongoose.Types.ObjectId;
  reason: string;
  status: "pending" | "reviewed" | "dismissed" | "action_taken";
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
}

const TVReportSchema = new Schema<ITVReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, enum: ["post", "comment"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ["pending", "reviewed", "dismissed", "action_taken"], default: "pending" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

TVReportSchema.index({ targetType: 1, targetId: 1 });
TVReportSchema.index({ status: 1 });

export default mongoose.model<ITVReport>("TVReport", TVReportSchema);
