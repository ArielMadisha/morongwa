// SecurityLog model for security events tracking
import mongoose, { Schema, Document } from "mongoose";

export interface ISecurityLog extends Document {
  user?: mongoose.Types.ObjectId;
  event: string;
  severity: "info" | "warning" | "critical";
  ipAddress?: string;
  userAgent?: string;
  meta?: any;
  createdAt: Date;
}

const SecurityLogSchema = new Schema<ISecurityLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    event: { type: String, required: true, index: true },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    ipAddress: { type: String },
    userAgent: { type: String },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

SecurityLogSchema.index({ event: 1, createdAt: -1 });
SecurityLogSchema.index({ severity: 1, createdAt: -1 });

export default mongoose.model<ISecurityLog>("SecurityLog", SecurityLogSchema);
