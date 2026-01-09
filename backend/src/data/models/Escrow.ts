// Escrow model for holding funds during task lifecycle
import mongoose, { Schema, Document } from "mongoose";

export interface IEscrowFees {
  bookingFee: number;
  commission: number;
  distanceSurcharge: number;
  peakSurcharge: number;
  weightSurcharge: number;
  urgencySurcharge: number;
  total: number;
}

export interface IEscrow extends Document {
  task: mongoose.Types.ObjectId;
  client: mongoose.Types.ObjectId;
  runner: mongoose.Types.ObjectId;
  currency: string; // ZAR, BWP, LSL, NAD, ZWL, ZMW
  taskPrice: number;
  fees: IEscrowFees;
  totalHeld: number; // taskPrice + booking fee initially
  runnersNet: number; // taskPrice + surcharges - commission (calculated at release)
  status: "pending" | "held" | "released" | "refunded" | "disputed";
  paymentReference?: string; // from PayGate
  paymentStatus: "pending" | "settled" | "failed";
  paymentMethod?: string; // card, instanteft, etc.
  fnbInstructionId?: string; // from FNB EFT Payment API
  fnbStatus?: "pending" | "submitted" | "processing" | "success" | "failed" | "rejected";
  fnbRetries: number;
  fnbLastRetryAt?: Date;
  releaseReason?: string; // "task_completed" | "review_expired" | "manual_release"
  releasedAt?: Date;
  payoutCompletedAt?: Date;
  refundReason?: string;
  refundedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EscrowSchema = new Schema<IEscrow>(
  {
    task: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    runner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    currency: {
      type: String,
      enum: ["ZAR", "BWP", "LSL", "NAD", "ZWL", "ZMW"],
      default: "ZAR",
      required: true,
    },
    taskPrice: { type: Number, required: true, min: 0 },
    fees: {
      bookingFee: { type: Number, default: 0, min: 0 },
      commission: { type: Number, default: 0, min: 0 },
      distanceSurcharge: { type: Number, default: 0, min: 0 },
      peakSurcharge: { type: Number, default: 0, min: 0 },
      weightSurcharge: { type: Number, default: 0, min: 0 },
      urgencySurcharge: { type: Number, default: 0, min: 0 },
      total: { type: Number, default: 0, min: 0 },
    },
    totalHeld: { type: Number, required: true, min: 0 },
    runnersNet: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["pending", "held", "released", "refunded", "disputed"],
      default: "pending",
    },
    paymentReference: { type: String, unique: true, sparse: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "settled", "failed"],
      default: "pending",
    },
    paymentMethod: { type: String },
    fnbInstructionId: { type: String, sparse: true },
    fnbStatus: {
      type: String,
      enum: ["pending", "submitted", "processing", "success", "failed", "rejected"],
      default: "pending",
    },
    fnbRetries: { type: Number, default: 0, min: 0 },
    fnbLastRetryAt: { type: Date },
    releaseReason: { type: String },
    releasedAt: { type: Date },
    payoutCompletedAt: { type: Date },
    refundReason: { type: String },
    refundedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true }
);

EscrowSchema.index({ status: 1, createdAt: -1 });
EscrowSchema.index({ fnbStatus: 1 });
EscrowSchema.index({ client: 1, createdAt: -1 });
EscrowSchema.index({ runner: 1, createdAt: -1 });

export default mongoose.model<IEscrow>("Escrow", EscrowSchema);
