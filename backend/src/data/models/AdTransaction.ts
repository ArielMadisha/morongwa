import mongoose, { Schema, Document } from "mongoose";

export interface IAdTransaction extends Document {
  advertiserId: mongoose.Types.ObjectId;
  adId?: mongoose.Types.ObjectId;
  eventId?: mongoose.Types.ObjectId;
  eventType?: "impression" | "click" | "conversion" | "topup";
  amount: number;
  type: "debit" | "credit";
  description?: string;
  platformShare: number;
  partnerShare: number;
  balanceAfter: number;
  createdAt: Date;
  updatedAt: Date;
}

const AdTransactionSchema = new Schema<IAdTransaction>(
  {
    advertiserId: { type: Schema.Types.ObjectId, ref: "Advertiser", required: true, index: true },
    adId: { type: Schema.Types.ObjectId, ref: "SponsoredVideoAd", index: true },
    eventId: { type: Schema.Types.ObjectId, ref: "SponsoredVideoImpression", index: true },
    eventType: { type: String, enum: ["impression", "click", "conversion", "topup"] },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["debit", "credit"], required: true },
    description: { type: String, trim: true, maxlength: 500 },
    platformShare: { type: Number, default: 0, min: 0 },
    partnerShare: { type: Number, default: 0, min: 0 },
    balanceAfter: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

AdTransactionSchema.index({ advertiserId: 1, createdAt: -1 });
AdTransactionSchema.index({ adId: 1, createdAt: -1 });

export default mongoose.model<IAdTransaction>("AdTransaction", AdTransactionSchema);

