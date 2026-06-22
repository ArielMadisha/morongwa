import mongoose, { Schema, Document } from "mongoose";

export type TuckshopCashAgentStatus = "pending" | "approved" | "rejected";
export type TuckshopRegistrationKind = "legacy" | "individual" | "company";

export interface ITuckshopCashAgentRegistration extends Document {
  applicantUser: mongoose.Types.ObjectId;
  /** WhatsApp-submitter digits (no +), for outbound notifications */
  waPhoneDigits: string;
  tuckshopName: string;
  ownerDetails: string;
  address: string;
  /** GPS from WhatsApp location pin (Twilio webhook) — used to verify the shop and route cash agents. */
  locationLatitude?: number;
  locationLongitude?: number;
  /** Contact phone provided for the tuckshop */
  tuckshopContactPhone: string;
  preferredPaymentMethod: string;
  /** Public-relative path e.g. /uploads/wa-invoice-....jpg */
  photoPath: string;
  status: TuckshopCashAgentStatus;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  commissionNote?: string;
  /** ZAR commission logged when admin approves (reporting / earnings dashboard). */
  commissionAmountZar?: number;
  rejectionReason?: string;
  registrationKind?: TuckshopRegistrationKind;
  applicantIdPassport?: string;
  proofOfResidencePath?: string;
  companyCertificatePath?: string;
  /** Normalised ID/passport for duplicate detection (alphanumeric, upper). */
  applicantIdNormalised?: string;
  certificateSha256?: string;
  proofSha256?: string;
  photoSha256?: string;
  /** 64-bit difference hash (hex) for near-duplicate shop photos. */
  photoDhash?: string;
  fraudFlags?: string[];
  fraudRiskScore?: number;
  fraudScanAt?: Date;
  fraudScanError?: string;
  /** Country payout hint from WhatsApp prefix (informational). */
  registrationIncentiveDisplay?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TuckshopCashAgentRegistrationSchema = new Schema<ITuckshopCashAgentRegistration>(
  {
    applicantUser: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    waPhoneDigits: { type: String, required: true, trim: true, index: true },
    tuckshopName: { type: String, required: true, trim: true, maxlength: 200 },
    ownerDetails: { type: String, required: true, trim: true, maxlength: 800 },
    address: { type: String, required: true, trim: true, maxlength: 800 },
    locationLatitude: { type: Number, min: -90, max: 90 },
    locationLongitude: { type: Number, min: -180, max: 180 },
    tuckshopContactPhone: { type: String, required: true, trim: true, maxlength: 40 },
    preferredPaymentMethod: { type: String, required: true, trim: true, maxlength: 120 },
    photoPath: { type: String, required: true, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    commissionNote: { type: String, trim: true, maxlength: 500 },
    commissionAmountZar: { type: Number, default: 0, min: 0 },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    registrationKind: {
      type: String,
      enum: ["legacy", "individual", "company"],
      default: "legacy",
      index: true,
    },
    applicantIdPassport: { type: String, trim: true, maxlength: 80 },
    proofOfResidencePath: { type: String, trim: true, maxlength: 500 },
    companyCertificatePath: { type: String, trim: true, maxlength: 500 },
    applicantIdNormalised: { type: String, trim: true, maxlength: 48, sparse: true, index: true },
    certificateSha256: { type: String, trim: true, maxlength: 64, sparse: true, index: true },
    proofSha256: { type: String, trim: true, maxlength: 64, sparse: true, index: true },
    photoSha256: { type: String, trim: true, maxlength: 64, sparse: true, index: true },
    photoDhash: { type: String, trim: true, maxlength: 32, sparse: true, index: true },
    fraudFlags: { type: [String], default: [] },
    fraudRiskScore: { type: Number, default: 0, min: 0, max: 100, index: true },
    fraudScanAt: { type: Date },
    fraudScanError: { type: String, trim: true, maxlength: 500 },
    registrationIncentiveDisplay: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true }
);

TuckshopCashAgentRegistrationSchema.index({ createdAt: -1 });
TuckshopCashAgentRegistrationSchema.index({ fraudRiskScore: -1, createdAt: -1 });

export default mongoose.model<ITuckshopCashAgentRegistration>(
  "TuckshopCashAgentRegistration",
  TuckshopCashAgentRegistrationSchema
);
