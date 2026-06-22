import mongoose, { Schema, Document } from "mongoose";

export type StoreDeletionRequestStatus = "pending" | "approved" | "rejected";

export interface IStoreDeletionRequest extends Document {
  storeId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  status: StoreDeletionRequestStatus;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  rejectReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StoreDeletionRequestSchema = new Schema<IStoreDeletionRequest>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
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

StoreDeletionRequestSchema.index(
  { storeId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export default mongoose.model<IStoreDeletionRequest>("StoreDeletionRequest", StoreDeletionRequestSchema);
