// Pricing Configuration Model
import mongoose, { Schema, Document } from 'mongoose';

export interface IPricingConfig extends Document {
  country: string;
  currency: string;
  fxPerZAR: number;
  commissionPct: number;
  peakMultiplier: number;
  baseRadiusKm: number;
  bookingFeeLocal: number;
  perKmRateLocal: number;
  heavySurchargeLocal: number;
  urgencyFeeLocal: number;
  updatedAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
}

const PricingConfigSchema = new Schema<IPricingConfig>(
  {
    country: { type: String, required: true },
    currency: { type: String, required: true, unique: true, uppercase: true },
    fxPerZAR: { type: Number, required: true, min: 0 },
    commissionPct: { type: Number, required: true, min: 0, max: 1 },
    peakMultiplier: { type: Number, required: true, min: 0 },
    baseRadiusKm: { type: Number, required: true, min: 0 },
    bookingFeeLocal: { type: Number, required: true, min: 0 },
    perKmRateLocal: { type: Number, required: true, min: 0 },
    heavySurchargeLocal: { type: Number, required: true, min: 0 },
    urgencyFeeLocal: { type: Number, required: true, min: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

export const PricingConfig = mongoose.model<IPricingConfig>('PricingConfig', PricingConfigSchema);
