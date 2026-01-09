// LedgerEntry model for immutable financial transaction log
import mongoose, { Schema, Document } from "mongoose";

export interface ILedgerEntry extends Document {
  escrow: mongoose.Types.ObjectId;
  task?: mongoose.Types.ObjectId;
  user?: mongoose.Types.ObjectId;
  type:
    | "DEPOSIT"
    | "BOOKING_FEE"
    | "ESCROW_HOLD"
    | "SURCHARGE"
    | "COMMISSION"
    | "PAYOUT_INITIATED"
    | "PAYOUT_SUCCESS"
    | "PAYOUT_FAILED"
    | "PAYOUT_REVERSED"
    | "REFUND_INITIATED"
    | "REFUND_SUCCESS"
    | "DISPUTE_HOLD"
    | "DISPUTE_RESOLVED";
  amount: number;
  currency: string;
  debitAccount: "morongwa_merchant" | "client_wallet" | "runner_wallet" | "system_fee";
  creditAccount: "morongwa_merchant" | "client_wallet" | "runner_wallet" | "system_fee";
  reference: string;
  relatedPaymentReference?: string;
  relatedFNBInstructionId?: string;
  status: "pending" | "confirmed" | "failed";
  meta?: {
    reason?: string;
    suchargeType?: string;
    paymentRail?: string;
    fnbRetryCount?: number;
    reconciliationId?: string;
    [key: string]: any;
  };
  createdBy?: string; // "system" | "user_id" | "admin_id"
  createdAt: Date;
  updatedAt: Date;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>(
  {
    escrow: {
      type: Schema.Types.ObjectId,
      ref: "Escrow",
      required: true,
      index: true,
    },
    task: { type: Schema.Types.ObjectId, ref: "Task" },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: [
        "DEPOSIT",
        "BOOKING_FEE",
        "ESCROW_HOLD",
        "SURCHARGE",
        "COMMISSION",
        "PAYOUT_INITIATED",
        "PAYOUT_SUCCESS",
        "PAYOUT_FAILED",
        "PAYOUT_REVERSED",
        "REFUND_INITIATED",
        "REFUND_SUCCESS",
        "DISPUTE_HOLD",
        "DISPUTE_RESOLVED",
      ],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    debitAccount: {
      type: String,
      enum: [
        "morongwa_merchant",
        "client_wallet",
        "runner_wallet",
        "system_fee",
      ],
      required: true,
    },
    creditAccount: {
      type: String,
      enum: [
        "morongwa_merchant",
        "client_wallet",
        "runner_wallet",
        "system_fee",
      ],
      required: true,
    },
    reference: { type: String, required: true, unique: true },
    relatedPaymentReference: { type: String, sparse: true },
    relatedFNBInstructionId: { type: String, sparse: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "failed"],
      default: "pending",
    },
    meta: { type: Schema.Types.Mixed },
    createdBy: { type: String, default: "system" },
  },
  { timestamps: true }
);

LedgerEntrySchema.index({ escrow: 1, createdAt: -1 });
LedgerEntrySchema.index({ type: 1, createdAt: -1 });
LedgerEntrySchema.index({ debitAccount: 1, creditAccount: 1 });
LedgerEntrySchema.index({ status: 1 });

export default mongoose.model<ILedgerEntry>(
  "LedgerEntry",
  LedgerEntrySchema
);
