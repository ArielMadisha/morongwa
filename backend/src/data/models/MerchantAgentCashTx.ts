import mongoose, { Schema, Document } from "mongoose";

export type MerchantAgentCashTxKind = "cash_deposit" | "cash_withdrawal";
export type MerchantAgentCashTxStatus =
  | "pending_customer"
  | "pending_handover"
  | "completed"
  | "cancelled"
  | "expired";

export interface IMerchantAgentCashTx extends Document {
  kind: MerchantAgentCashTxKind;
  status: MerchantAgentCashTxStatus;
  agent: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  amount: number;
  reference: string;
  expiresAt: Date;
  completedAt?: Date;
  /** Agent marked physical cash handed to customer (withdrawal flow). */
  handoverConfirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MerchantAgentCashTxSchema = new Schema<IMerchantAgentCashTx>(
  {
    kind: { type: String, enum: ["cash_deposit", "cash_withdrawal"], required: true },
    status: {
      type: String,
      enum: ["pending_customer", "pending_handover", "completed", "cancelled", "expired"],
      required: true,
    },
    agent: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    reference: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date },
    handoverConfirmedAt: { type: Date },
  },
  { timestamps: true }
);

MerchantAgentCashTxSchema.index({ agent: 1, status: 1, createdAt: -1 });
MerchantAgentCashTxSchema.index({ customer: 1, status: 1, createdAt: -1 });

export default mongoose.model<IMerchantAgentCashTx>("MerchantAgentCashTx", MerchantAgentCashTxSchema);
