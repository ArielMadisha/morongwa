import mongoose, { Schema, Document } from "mongoose";

export type CourierCoverage = "domestic_za" | "cross_border_sadc" | "domestic_bw" | "international";

export interface ICourierProvider extends Document {
  slug: string;
  name: string;
  coverage: CourierCoverage;
  /** ISO country codes served (e.g. ZA, BW) */
  countries: string[];
  integrationType: "api" | "portal" | "tariff_table" | "quote_based";
  pricingNote?: string;
  trackingUrlTemplate?: string;
  active: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const CourierProviderSchema = new Schema<ICourierProvider>(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    coverage: {
      type: String,
      enum: ["domestic_za", "cross_border_sadc", "domestic_bw", "international"],
      required: true,
    },
    countries: { type: [String], default: [] },
    integrationType: {
      type: String,
      enum: ["api", "portal", "tariff_table", "quote_based"],
      default: "tariff_table",
    },
    pricingNote: { type: String },
    trackingUrlTemplate: { type: String },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 100 },
  },
  { timestamps: true }
);

CourierProviderSchema.index({ active: 1, sortOrder: 1 });

export default mongoose.model<ICourierProvider>("CourierProvider", CourierProviderSchema);
