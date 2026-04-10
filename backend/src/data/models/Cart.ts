import mongoose, { Schema, Document } from "mongoose";

export interface ICartItem {
  productId: mongoose.Types.ObjectId;
  qty: number;
  resellerId?: mongoose.Types.ObjectId;
}

export interface ICartMusicItem {
  songId: mongoose.Types.ObjectId;
  qty: number;
}

export interface ICart extends Document {
  user: mongoose.Types.ObjectId;
  items: ICartItem[];
  musicItems: ICartMusicItem[];
  /** Delivery line saved from WhatsApp (CART CHECKOUT or address template). */
  deliveryAddress?: string;
  updatedAt: Date;
}

const CartItemSchema = new Schema<ICartItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true, min: 1 },
    resellerId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const CartMusicItemSchema = new Schema<ICartMusicItem>(
  {
    songId: { type: Schema.Types.ObjectId, ref: "Song", required: true },
    qty: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false }
);

const CartSchema = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: { type: [CartItemSchema], default: [] },
    musicItems: { type: [CartMusicItemSchema], default: [] },
    deliveryAddress: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model<ICart>("Cart", CartSchema);
