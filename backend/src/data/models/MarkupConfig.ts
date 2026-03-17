import mongoose, { Schema, Document } from "mongoose";

export type MarkupType = "percentage" | "fixed" | "tiered";
export type MarkupSupplierSource = "cj" | "spocket" | "eprolo";

export interface IMarkupTier {
  minPrice: number;
  maxPrice: number;
  markupPct: number;
}

export interface IMarkupConfig extends Document {
  type: MarkupType;
  /** For percentage: e.g. 25 = 25%. For fixed: amount in currency. */
  value?: number;
  /** For tiered: price range → markup % */
  tiers?: IMarkupTier[];
  /** When set, applies only to this supplier source */
  supplierSource?: MarkupSupplierSource;
  /** When set, applies only to this category */
  category?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MarkupTierSchema = new Schema<IMarkupTier>(
  {
    minPrice: { type: Number, required: true },
    maxPrice: { type: Number, required: true },
    markupPct: { type: Number, required: true },
  },
  { _id: false }
);

const MarkupConfigSchema = new Schema<IMarkupConfig>(
  {
    type: { type: String, enum: ["percentage", "fixed", "tiered"], required: true },
    value: { type: Number },
    tiers: { type: [MarkupTierSchema], default: undefined },
    supplierSource: { type: String, enum: ["cj", "spocket", "eprolo"] },
    category: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MarkupConfigSchema.index({ supplierSource: 1 });
MarkupConfigSchema.index({ active: 1 });

export default mongoose.model<IMarkupConfig>("MarkupConfig", MarkupConfigSchema);
