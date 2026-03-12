// Pending QR / in-store payment: store scans user QR, user gets SMS OTP, tells code to teller
import mongoose, { Schema, Document } from "mongoose";

export interface IWalletPaymentRequest extends Document {
  fromUser: mongoose.Types.ObjectId;   // Payer (from QR)
  toUser?: mongoose.Types.ObjectId;    // Payee (merchant/store) - optional for POS
  amount: number;
  otpHash: string;
  otpExpiresAt: Date;
  status: "pending" | "completed" | "expired" | "cancelled";
  reference?: string;
  metadata?: Record<string, unknown>;  // e.g. { merchantName, posId } for future POS API
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WalletPaymentRequestSchema = new Schema<IWalletPaymentRequest>(
  {
    fromUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    toUser: { type: Schema.Types.ObjectId, ref: "User" },
    amount: { type: Number, required: true, min: 0.01 },
    otpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    status: { type: String, enum: ["pending", "completed", "expired", "cancelled"], default: "pending" },
    reference: { type: String },
    metadata: { type: Schema.Types.Mixed },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

WalletPaymentRequestSchema.index({ status: 1, otpExpiresAt: 1 });
WalletPaymentRequestSchema.index({ fromUser: 1, status: 1 });

export default mongoose.model<IWalletPaymentRequest>("WalletPaymentRequest", WalletPaymentRequestSchema);
