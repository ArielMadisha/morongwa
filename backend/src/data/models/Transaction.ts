// Transaction model for financial audit trail
import mongoose, { Schema, Document } from "mongoose";

export interface ITransaction extends Document {
  wallet: mongoose.Types.ObjectId;
  user?: mongoose.Types.ObjectId;
  type: "deposit" | "topup" | "payout" | "escrow" | "refund" | "payment" | "credit" | "debit";
  amount: number;
  reference: string;
  status?: string;
  meta?: any;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    wallet: { type: Schema.Types.ObjectId, ref: "Wallet" },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: ["deposit", "topup", "payout", "escrow", "refund", "payment", "credit", "debit"],
      required: true,
    },
    amount: { type: Number, required: true },
    reference: { type: String, required: true },
    status: { type: String },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

TransactionSchema.index({ user: 1, createdAt: -1 });
TransactionSchema.index({ wallet: 1, createdAt: -1 });
TransactionSchema.index({ type: 1 });

export default mongoose.model<ITransaction>("Transaction", TransactionSchema);
