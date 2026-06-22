import mongoose, { Document, Schema } from "mongoose";

export interface IMerchantVasTx extends Document {
  user: mongoose.Types.ObjectId;
  kind: "airtime" | "data" | "electricity";
  status: "completed" | "failed";
  amount: number;
  currency: string;
  recipientPhone?: string;
  meterNumber?: string;
  provider: string;
  providerReference?: string;
  reference: string;
  commissionTotal: number;
  merchantCommission: number;
  platformCommission: number;
  errorMessage?: string;
  source: "web" | "mobile" | "whatsapp" | "api";
  createdAt: Date;
  updatedAt: Date;
}

const MerchantVasTxSchema = new Schema<IMerchantVasTx>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["airtime", "data", "electricity"], required: true, index: true },
    status: { type: String, enum: ["completed", "failed"], required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: "ZAR" },
    recipientPhone: { type: String },
    meterNumber: { type: String },
    provider: { type: String, default: "simulated" },
    providerReference: { type: String },
    reference: { type: String, required: true, unique: true, index: true },
    commissionTotal: { type: Number, default: 0 },
    merchantCommission: { type: Number, default: 0 },
    platformCommission: { type: Number, default: 0 },
    errorMessage: { type: String },
    source: { type: String, enum: ["web", "mobile", "whatsapp", "api"], default: "api" },
  },
  { timestamps: true }
);

export default mongoose.model<IMerchantVasTx>("MerchantVasTx", MerchantVasTxSchema);
