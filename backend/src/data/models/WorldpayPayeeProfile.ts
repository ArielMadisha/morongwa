// Stored payee bank profiles for Worldpay Account Payouts (phase 1: ZA, BW, ZM)
import mongoose, { Schema, Document, Types } from "mongoose";

export const WORLDPAY_PHASE1 = ["ZA", "BW", "ZM"] as const;
export type WorldpayPhase1Country = (typeof WORLDPAY_PHASE1)[number];

export interface IWorldpayPayeeProfile extends Document {
  label: string;
  countryCode: WorldpayPhase1Country;
  payeeKind: "individual" | "business";
  /** From Worldpay onboarding — required for API */
  transactionTypeCode: string;
  bankDetails: {
    bankName: string;
    branchCode?: string;
    beneficiaryAccountNumber?: string;
    iban?: string;
    swiftBic?: string;
    bankCode?: string;
  };
  beneficiaryIndividual?: {
    firstName: string;
    lastName: string;
  };
  beneficiaryCompany?: {
    companyName: string;
  };
  expandableKeyValuePairs?: Record<string, string>;
  linkedUserId?: Types.ObjectId;
  active: boolean;
  lastPayoutTestAt?: Date;
  lastPayoutTestHttpStatus?: number;
  lastPayoutTestSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BankDetailsSchema = new Schema(
  {
    bankName: { type: String, required: true, trim: true },
    branchCode: { type: String, trim: true },
    beneficiaryAccountNumber: { type: String, trim: true },
    iban: { type: String, trim: true },
    swiftBic: { type: String, trim: true },
    bankCode: { type: String, trim: true },
  },
  { _id: false }
);

const WorldpayPayeeProfileSchema = new Schema<IWorldpayPayeeProfile>(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    countryCode: { type: String, required: true, enum: WORLDPAY_PHASE1 },
    payeeKind: { type: String, required: true, enum: ["individual", "business"] },
    transactionTypeCode: { type: String, required: true, trim: true, maxlength: 64 },
    bankDetails: { type: BankDetailsSchema, required: true },
    beneficiaryIndividual: {
      type: new Schema(
        {
          firstName: { type: String, trim: true },
          lastName: { type: String, trim: true },
        },
        { _id: false }
      ),
    },
    beneficiaryCompany: {
      type: new Schema(
        {
          companyName: { type: String, trim: true },
        },
        { _id: false }
      ),
    },
    expandableKeyValuePairs: { type: Schema.Types.Mixed, default: undefined },
    linkedUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    active: { type: Boolean, default: true },
    lastPayoutTestAt: { type: Date },
    lastPayoutTestHttpStatus: { type: Number },
    lastPayoutTestSummary: { type: String, maxlength: 4000 },
  },
  { timestamps: true }
);

WorldpayPayeeProfileSchema.index({ countryCode: 1, active: 1, createdAt: -1 });

export default mongoose.model<IWorldpayPayeeProfile>("WorldpayPayeeProfile", WorldpayPayeeProfileSchema);
