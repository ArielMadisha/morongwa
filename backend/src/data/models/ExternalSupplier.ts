import mongoose, { Schema, Document } from "mongoose";

export type ExternalSupplierSource = "cj" | "spocket" | "eprolo";
export type ExternalSupplierStatus = "active" | "paused" | "disabled";

export interface IExternalSupplier extends Document {
  source: ExternalSupplierSource;
  name: string;
  /** API key – store encrypted in production */
  apiKey: string;
  apiSecret?: string;
  webhookSecret?: string;
  status: ExternalSupplierStatus;
  /** Default platform markup % applied to imported products (e.g. 25 = 25%) */
  defaultMarkupPct?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ExternalSupplierSchema = new Schema<IExternalSupplier>(
  {
    source: { type: String, enum: ["cj", "spocket", "eprolo"], required: true },
    name: { type: String, required: true },
    apiKey: { type: String, required: true },
    apiSecret: { type: String },
    webhookSecret: { type: String },
    status: { type: String, enum: ["active", "paused", "disabled"], default: "active" },
    defaultMarkupPct: { type: Number },
  },
  { timestamps: true }
);

ExternalSupplierSchema.index({ source: 1 }, { unique: true });
ExternalSupplierSchema.index({ status: 1 });

export default mongoose.model<IExternalSupplier>("ExternalSupplier", ExternalSupplierSchema);
