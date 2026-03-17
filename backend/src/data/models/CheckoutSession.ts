// E-commerce checkout session for ACBPayWallet payment page
import mongoose, { Schema, Document } from "mongoose";

export interface ICheckoutSession extends Document {
  merchantId: mongoose.Types.ObjectId;
  payerId: mongoose.Types.ObjectId;
  amount: number;
  reference: string;
  returnUrl: string;
  cancelUrl?: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CheckoutSessionSchema = new Schema<ICheckoutSession>(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    payerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0.01 },
    reference: { type: String, required: true },
    returnUrl: { type: String, required: true },
    cancelUrl: { type: String },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "cancelled"],
      default: "pending",
    },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

CheckoutSessionSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<ICheckoutSession>("CheckoutSession", CheckoutSessionSchema);
