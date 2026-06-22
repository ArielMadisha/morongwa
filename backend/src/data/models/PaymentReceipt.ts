import mongoose, { Schema, Document } from "mongoose";

export type ReceiptMethod = "paygate" | "bank" | "agent" | "wallet";
export type ReceiptStatus = "completed" | "pending" | "failed";

export interface IPaymentReceipt extends Document {
  user?: mongoose.Types.ObjectId;
  amount: number;
  method: ReceiptMethod;
  reference: string;
  purpose?: string;
  status: ReceiptStatus;
  deliveredWhatsapp: boolean;
  deliveredEmail: boolean;
  deliveredWeb: boolean;
  meta?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentReceiptSchema = new Schema<IPaymentReceipt>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ["paygate", "bank", "agent", "wallet"], required: true, index: true },
    reference: { type: String, required: true, unique: true, index: true },
    purpose: { type: String, trim: true, maxlength: 200 },
    status: { type: String, enum: ["completed", "pending", "failed"], default: "completed", index: true },
    deliveredWhatsapp: { type: Boolean, default: false },
    deliveredEmail: { type: Boolean, default: false },
    deliveredWeb: { type: Boolean, default: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model<IPaymentReceipt>("PaymentReceipt", PaymentReceiptSchema);

