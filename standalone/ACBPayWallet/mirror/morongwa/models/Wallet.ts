// Wallet model for user balances and transaction history
import mongoose, { Schema, Document } from "mongoose";

export interface IWallet extends Document {
  user: mongoose.Types.ObjectId;
  balance: number;
  transactions: Array<{
    type: "topup" | "payout" | "escrow" | "refund" | "credit" | "debit";
    amount: number;
    reference?: string;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const WalletSchema = new Schema<IWallet>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    transactions: [
      {
        type: {
          type: String,
          enum: ["topup", "payout", "escrow", "refund", "credit", "debit"],
          required: true,
        },
        amount: { type: Number, required: true },
        reference: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<IWallet>("Wallet", WalletSchema);
