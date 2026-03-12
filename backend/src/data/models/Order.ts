import mongoose, { Schema, Document } from "mongoose";

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  qty: number;
  price: number;
  resellerId?: mongoose.Types.ObjectId;
  commissionPct?: number;
  commissionValue?: number;
}

export interface IOrderMusicItem {
  songId: mongoose.Types.ObjectId;
  qty: number;
  price: number;
}

export interface IOrderAmounts {
  subtotal: number;
  shipping: number;
  commissionTotal: number;
  platformFee?: number; // deprecated, kept for backward compat
  total: number;
  currency: string;
  /** Per-supplier shipping for invoice (when multiple suppliers) */
  shippingBreakdown?: Array<{ storeName: string; shippingCost: number }>;
}

/** Buyer-facing payment breakdown for wallet/invoice */
export interface IOrderPaymentBreakdown {
  items: Array<{ title: string; price: number; qty: number }>;
  shippingBreakdown: Array<{ storeName: string; shippingCost: number }>;
}

export interface IOrderDelivery {
  method?: "runner" | "courier" | "collection";
  address?: string;
  trackingNo?: string;
}

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export interface IOrder extends Document {
  buyerId: mongoose.Types.ObjectId;
  supplierId?: mongoose.Types.ObjectId; // first product's supplier for simplicity
  status: OrderStatus;
  items: IOrderItem[];
  /** Music items included in same checkout (for card payment webhook) */
  musicItems?: IOrderMusicItem[];
  amounts: IOrderAmounts;
  /** Stored breakdown for wallet transaction list and invoice */
  paymentBreakdown?: IOrderPaymentBreakdown;
  delivery: IOrderDelivery;
  paymentMethod: "wallet" | "card";
  paymentReference?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OrderMusicItemSchema = new Schema(
  { songId: { type: Schema.Types.ObjectId, ref: "Song", required: true }, qty: { type: Number, required: true, min: 1 }, price: { type: Number, required: true } },
  { _id: false }
);

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    resellerId: { type: Schema.Types.ObjectId, ref: "User" },
    commissionPct: { type: Number },
    commissionValue: { type: Number },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    status: {
      type: String,
      enum: ["pending_payment", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"],
      default: "pending_payment",
    },
    items: { type: [OrderItemSchema], required: true },
    musicItems: { type: [OrderMusicItemSchema], default: [] },
    amounts: {
      subtotal: { type: Number, required: true },
      shipping: { type: Number, default: 0 },
      commissionTotal: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      total: { type: Number, required: true },
      currency: { type: String, default: "ZAR" },
      shippingBreakdown: [{ storeName: String, shippingCost: Number }],
    },
    paymentBreakdown: {
      items: [{ title: String, price: Number, qty: Number }],
      shippingBreakdown: [{ storeName: String, shippingCost: Number }],
    },
    delivery: {
      method: { type: String, enum: ["runner", "courier", "collection"] },
      address: { type: String },
      trackingNo: { type: String },
    },
    paymentMethod: { type: String, enum: ["wallet", "card"], required: true },
    paymentReference: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

OrderSchema.index({ buyerId: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ paymentReference: 1 });

export default mongoose.model<IOrder>("Order", OrderSchema);
