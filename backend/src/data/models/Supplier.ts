import mongoose, { Schema, Document } from "mongoose";

export type SupplierStatus = "pending" | "approved" | "rejected";
export type SupplierType = "company" | "individual";

export interface ISupplier extends Document {
  userId: mongoose.Types.ObjectId;
  status: SupplierStatus;
  type: SupplierType;
  storeName?: string;
  pickupAddress?: string;
  /** Shipping cost in ZAR for orders from this supplier. Default 100 if not set. */
  shippingCost?: number;
  // Company: company reg no, directors ID doc
  companyRegNo?: string;
  directorsIdDoc?: string; // path or reference to uploaded document
  // Individual: seller ID doc
  idDocument?: string; // path or reference to uploaded document
  // Contact (both)
  contactEmail?: string;
  contactPhone?: string;
  // Verification fee (for future use)
  verificationFee?: number;
  verificationFeeWaived?: boolean; // individual: no fee for now; option for future
  appliedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    type: { type: String, enum: ["company", "individual"], required: true },
    storeName: { type: String },
    pickupAddress: { type: String },
    shippingCost: { type: Number },
    companyRegNo: { type: String },
    directorsIdDoc: { type: String },
    idDocument: { type: String },
    contactEmail: { type: String },
    contactPhone: { type: String },
    verificationFee: { type: Number },
    verificationFeeWaived: { type: Boolean, default: false },
    appliedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectionReason: { type: String },
  },
  { timestamps: true }
);

SupplierSchema.index({ userId: 1 });
SupplierSchema.index({ status: 1 });
SupplierSchema.index({ type: 1 });

export default mongoose.model<ISupplier>("Supplier", SupplierSchema);
