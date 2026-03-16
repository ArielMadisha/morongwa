import mongoose, { Schema, Document } from "mongoose";

export type PreferredSupplier = "cj" | "spocket" | "eprolo";

export interface ICourierRule extends Document {
  /** ISO 3166-1 alpha-2 country code (e.g. "ZA", "DE") */
  country: string;
  /** Region label (e.g. "Southern Africa", "EU") */
  region?: string;
  preferredSupplier: PreferredSupplier;
  courier: string;
  shippingMethod: string;
  deliveryDays: number;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const CourierRuleSchema = new Schema<ICourierRule>(
  {
    country: { type: String, required: true },
    region: { type: String },
    preferredSupplier: { type: String, enum: ["cj", "spocket", "eprolo"], required: true },
    courier: { type: String, required: true },
    shippingMethod: { type: String, required: true },
    deliveryDays: { type: Number, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CourierRuleSchema.index({ country: 1 }, { unique: true });
CourierRuleSchema.index({ region: 1 });
CourierRuleSchema.index({ active: 1 });

export default mongoose.model<ICourierRule>("CourierRule", CourierRuleSchema);
