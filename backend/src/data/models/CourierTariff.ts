import mongoose, { Schema, Document } from "mongoose";

export interface ICourierTariff extends Document {
  providerId: mongoose.Types.ObjectId;
  /** Destination ISO country */
  countryCode: string;
  /** Optional zone label (e.g. "Gaborone local", "Francistown") */
  zone?: string;
  serviceLabel: string;
  minWeightKg: number;
  maxWeightKg: number;
  price: number;
  currency: string;
  minDeliveryDays: number;
  maxDeliveryDays: number;
  active: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const CourierTariffSchema = new Schema<ICourierTariff>(
  {
    providerId: { type: Schema.Types.ObjectId, ref: "CourierProvider", required: true },
    countryCode: { type: String, required: true, uppercase: true, trim: true },
    zone: { type: String, trim: true },
    serviceLabel: { type: String, required: true, trim: true },
    minWeightKg: { type: Number, required: true, min: 0 },
    maxWeightKg: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "ZAR", uppercase: true },
    minDeliveryDays: { type: Number, required: true, min: 0 },
    maxDeliveryDays: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 100 },
  },
  { timestamps: true }
);

CourierTariffSchema.index({ countryCode: 1, active: 1, minWeightKg: 1 });
CourierTariffSchema.index({ providerId: 1 });

export default mongoose.model<ICourierTariff>("CourierTariff", CourierTariffSchema);
