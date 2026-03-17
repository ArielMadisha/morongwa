import mongoose, { Schema, Document } from "mongoose";

export interface IMusicPurchase extends Document {
  songId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  amount: number;
  adminCommission: number;
  ownerShare: number;
  reference: string;
  createdAt: Date;
  updatedAt: Date;
}

const MusicPurchaseSchema = new Schema<IMusicPurchase>(
  {
    songId: { type: Schema.Types.ObjectId, ref: "Song", required: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    adminCommission: { type: Number, required: true, min: 0 },
    ownerShare: { type: Number, required: true, min: 0 },
    reference: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

MusicPurchaseSchema.index({ buyerId: 1, createdAt: -1 });
MusicPurchaseSchema.index({ songId: 1, buyerId: 1 }, { unique: true });

export default mongoose.model<IMusicPurchase>("MusicPurchase", MusicPurchaseSchema);
