import mongoose, { Schema, Document } from "mongoose";

export interface IPlatformAdRevenue extends Document {
  dateKey: string;
  platform: "whatsapp" | "web" | "android" | "ios";
  totalRevenue: number;
  platformShare: number;
  partnerShare: number;
  impressions: number;
  clicks: number;
  conversions: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformAdRevenueSchema = new Schema<IPlatformAdRevenue>(
  {
    dateKey: { type: String, required: true, index: true },
    platform: { type: String, enum: ["whatsapp", "web", "android", "ios"], required: true, index: true },
    totalRevenue: { type: Number, default: 0, min: 0 },
    platformShare: { type: Number, default: 0, min: 0 },
    partnerShare: { type: Number, default: 0, min: 0 },
    impressions: { type: Number, default: 0, min: 0 },
    clicks: { type: Number, default: 0, min: 0 },
    conversions: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

PlatformAdRevenueSchema.index({ dateKey: 1, platform: 1 }, { unique: true });

export default mongoose.model<IPlatformAdRevenue>("PlatformAdRevenue", PlatformAdRevenueSchema);

