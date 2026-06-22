import mongoose, { Schema, Document } from "mongoose";

export type AdminBroadcastScope = "all" | "area";
export type AdminBroadcastAreaType = "country" | "runner_country" | "runner_city";

export interface IAdminBroadcast extends Document {
  sentBy: mongoose.Types.ObjectId;
  scope: AdminBroadcastScope;
  areaType?: AdminBroadcastAreaType;
  areaValue?: string;
  areaLabel?: string;
  subject?: string;
  message: string;
  recipientCount: number;
  deliveredCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const AdminBroadcastSchema = new Schema<IAdminBroadcast>(
  {
    sentBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    scope: { type: String, enum: ["all", "area"], required: true },
    areaType: { type: String, enum: ["country", "runner_country", "runner_city"] },
    areaValue: { type: String, trim: true },
    areaLabel: { type: String, trim: true },
    subject: { type: String, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    recipientCount: { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AdminBroadcastSchema.index({ createdAt: -1 });

export default mongoose.model<IAdminBroadcast>("AdminBroadcast", AdminBroadcastSchema);
