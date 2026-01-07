// AuditLog model for governance and compliance
import mongoose, { Schema, Document } from "mongoose";

export interface IAuditLog extends Document {
  action: string;
  user: mongoose.Types.ObjectId | null;
  target?: mongoose.Types.ObjectId;
  meta?: any;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    target: { type: Schema.Types.ObjectId },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1 });

export default mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
