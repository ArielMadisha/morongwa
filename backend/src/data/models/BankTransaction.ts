import mongoose, { Schema, Document } from "mongoose";

export type BankTxStatus = "matched" | "unmatched" | "duplicate";

export interface IBankTransaction extends Document {
  importId: mongoose.Types.ObjectId;
  txDate?: Date;
  amount: number;
  reference: string;
  normalizedReference: string;
  matchedUserId?: mongoose.Types.ObjectId;
  walletId?: mongoose.Types.ObjectId;
  status: BankTxStatus;
  dedupeKey: string;
  receiptReference?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BankTransactionSchema = new Schema<IBankTransaction>(
  {
    importId: { type: Schema.Types.ObjectId, ref: "BankImport", required: true, index: true },
    txDate: { type: Date, index: true },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, required: true, trim: true },
    normalizedReference: { type: String, required: true, trim: true, index: true },
    matchedUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", index: true },
    status: { type: String, enum: ["matched", "unmatched", "duplicate"], required: true, index: true },
    dedupeKey: { type: String, required: true, unique: true, index: true },
    receiptReference: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

BankTransactionSchema.index({ importId: 1, createdAt: -1 });

export default mongoose.model<IBankTransaction>("BankTransaction", BankTransactionSchema);

