import mongoose, { Schema, Document } from "mongoose";

export type SupplierDeletionRequestStatus = "pending" | "approved" | "rejected";

export interface ISupplierDeletionRequest extends Document {
  supplierId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  status: SupplierDeletionRequestStatus;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  rejectReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierDeletionRequestSchema = new Schema<ISupplierDeletionRequest>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectReason: { type: String },
  },
  { timestamps: true }
);

SupplierDeletionRequestSchema.index(
  { supplierId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export default mongoose.model<ISupplierDeletionRequest>("SupplierDeletionRequest", SupplierDeletionRequestSchema);
