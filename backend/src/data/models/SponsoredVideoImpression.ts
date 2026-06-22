import mongoose, { Schema, Document } from "mongoose";

export interface ISponsoredVideoImpression extends Document {
  adId: mongoose.Types.ObjectId;
  advertiserId: mongoose.Types.ObjectId;
  placementKey: string;
  /** Delivery surface (distinct from WhatsApp Flow / Studio — routing channel only). */
  channel: "whatsapp" | "web";
  platform: "whatsapp" | "web" | "android" | "ios";
  eventType: "impression" | "click" | "conversion";
  menuKey?: string;
  audience?: "generic" | "wallet" | "runner" | "merchant" | "shopper";
  userExternalId?: string;
  /** Snapshot of earned ZAR for this single impression (rate/1000 when rate > 0). */
  earnedZarSnapshot: number;
  phoneHash?: string;
  createdAt: Date;
}

const SponsoredVideoImpressionSchema = new Schema<ISponsoredVideoImpression>(
  {
    adId: { type: Schema.Types.ObjectId, ref: "SponsoredVideoAd", required: true, index: true },
    advertiserId: { type: Schema.Types.ObjectId, ref: "Advertiser", required: true, index: true },
    placementKey: { type: String, required: true, index: true },
    channel: { type: String, enum: ["whatsapp", "web"], required: true, default: "whatsapp" },
    platform: { type: String, enum: ["whatsapp", "web", "android", "ios"], required: true, default: "whatsapp", index: true },
    eventType: { type: String, enum: ["impression", "click", "conversion"], required: true, default: "impression", index: true },
    menuKey: { type: String, trim: true },
    audience: { type: String, enum: ["generic", "wallet", "runner", "merchant", "shopper"], default: "generic", index: true },
    userExternalId: { type: String, trim: true, index: true },
    earnedZarSnapshot: { type: Number, default: 0, min: 0 },
    phoneHash: { type: String, trim: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SponsoredVideoImpressionSchema.index({ createdAt: -1 });
SponsoredVideoImpressionSchema.index({ advertiserId: 1, createdAt: -1 });
SponsoredVideoImpressionSchema.index({ adId: 1, eventType: 1, createdAt: -1 });

export default mongoose.model<ISponsoredVideoImpression>("SponsoredVideoImpression", SponsoredVideoImpressionSchema);
