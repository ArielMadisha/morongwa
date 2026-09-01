import mongoose, { Schema, Document } from "mongoose";

/** Premium episode unlocked with the ACBPay Wallet (web + Android only; iOS would need IAP). */
export interface IPodcastPurchase extends Document {
  episodeId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amount: number;
  reference: string;
  platform: "web" | "android" | "ios" | "unknown";
  createdAt: Date;
  updatedAt: Date;
}

const PodcastPurchaseSchema = new Schema<IPodcastPurchase>(
  {
    episodeId: { type: Schema.Types.ObjectId, ref: "PodcastEpisode", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, required: true },
    platform: { type: String, enum: ["web", "android", "ios", "unknown"], default: "unknown" },
  },
  { timestamps: true }
);

PodcastPurchaseSchema.index({ episodeId: 1, userId: 1 }, { unique: true });
PodcastPurchaseSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IPodcastPurchase>("PodcastPurchase", PodcastPurchaseSchema);
