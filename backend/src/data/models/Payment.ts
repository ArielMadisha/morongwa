// Payment model for gateway transactions
import mongoose, { Schema, Document } from "mongoose";

export interface IPayment extends Document {
  user: mongoose.Types.ObjectId;
  amount: number;
  reference: string;
  status: "pending" | "successful" | "failed" | "refunded" | "disputed";
  gatewayRequest?: any;
  refundReason?: string;
  disputeReason?: string;
  refundedAt?: Date;
  /** For MUSIC-* payments: { musicItems: Array<{ songId, qty, price }> } */
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "successful", "failed", "refunded", "disputed"],
      default: "pending",
    },
    gatewayRequest: { type: Schema.Types.Mixed },
    refundReason: { type: String },
    disputeReason: { type: String },
    refundedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

PaymentSchema.index({ status: 1 });

export default mongoose.model<IPayment>("Payment", PaymentSchema);
