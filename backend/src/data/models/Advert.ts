import mongoose, { Schema, Document } from "mongoose";

export type AdvertSlot = "random" | "promo";

export interface IAdvert extends Document {
  title: string;
  /** Image URL for the advert */
  imageUrl: string;
  /** Link to navigate when clicked */
  linkUrl?: string;
  /** Slot: random = top square block (rotates), promo = bottom remainder (e.g. new product) */
  slot: AdvertSlot;
  /** Optional product to promote (links to marketplace product) */
  productId?: mongoose.Types.ObjectId;
  active: boolean;
  startDate?: Date;
  endDate?: Date;
  /** Order/priority for display (lower = higher priority) */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const AdvertSchema = new Schema<IAdvert>(
  {
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String },
    slot: { type: String, enum: ["random", "promo"], required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    active: { type: Boolean, default: true },
    startDate: { type: Date },
    endDate: { type: Date },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AdvertSchema.index({ slot: 1, active: 1 });

export default mongoose.model<IAdvert>("Advert", AdvertSchema);
