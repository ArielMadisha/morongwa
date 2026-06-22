import mongoose, { Schema, Document } from "mongoose";

/**
 * Admin-managed reference: public WhatsApp line + staff notes per country (+ default currency label).
 *
 * Intended for ops triage: which national business line owns a case, escalation notes, and planning.
 *
 * Sending/receiving WhatsApp bots still require Twilio WhatsApp-approved numbers + backend env routing
 * (`TWILIO_WHATSAPP_FROM*`, Botswana/Lesotho vars, optional `TWILIO_WA_REGIONAL_SENDERS_JSON`).
 * Keeping phone numbers mirrored here avoids hunting config when supporting users by country.
 *
 * MacGyver-only WhatsApp replies: optional second line (`whatsappNumber2`) plus per-line Twilio credential pools
 * (`macgyverWaTwilioPool1` / `macgyverWaTwilioPool2`) map each approved sender to env-backed accounts.
 */
export type MacGyverWaTwilioPool = "" | "wa_api" | "twilio_parent" | "twilio_subaccount" | "twilio_subaccount_b";

export interface ICountryOpsProfile extends Document {
  /** ISO 3166-1 alpha-2 (e.g. ZA, BW) */
  countryCode: string;
  countryName: string;
  /** E.164 style e.g. +27123456789 (optional until configured) */
  whatsappNumber?: string;
  /** Shown next to copy buttons, e.g. "RSA business line" */
  whatsappLabel?: string;
  /** Second national WhatsApp line (MacGyver / ops routing); E.164 */
  whatsappNumber2?: string;
  whatsappLabel2?: string;
  /**
   * Which Twilio credential bucket sends MacGyver WhatsApp replies from `whatsappNumber`.
   * Empty → treat as `wa_api`.
   */
  macgyverWaTwilioPool1?: MacGyverWaTwilioPool;
  /**
   * Credential bucket for `whatsappNumber2`. Empty when line 2 unset; when line 2 is set, empty → `twilio_subaccount`.
   */
  macgyverWaTwilioPool2?: MacGyverWaTwilioPool;
  /** ISO 4217 (e.g. ZAR, BWP) — reference for future country-specific catalog; not wired into checkout yet */
  currencyCode: string;
  /** Internal notes for disputes / escalation */
  supportNotes?: string;
  sortOrder: number;
  active: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CountryOpsProfileSchema = new Schema<ICountryOpsProfile>(
  {
    countryCode: { type: String, required: true, uppercase: true, trim: true, maxlength: 2, minlength: 2 },
    countryName: { type: String, required: true, trim: true },
    whatsappNumber: { type: String, trim: true, default: "" },
    whatsappLabel: { type: String, trim: true },
    whatsappNumber2: { type: String, trim: true, default: "" },
    whatsappLabel2: { type: String, trim: true },
    macgyverWaTwilioPool1: {
      type: String,
      trim: true,
      enum: ["", "wa_api", "twilio_parent", "twilio_subaccount", "twilio_subaccount_b"],
      default: "",
    },
    macgyverWaTwilioPool2: {
      type: String,
      trim: true,
      enum: ["", "wa_api", "twilio_parent", "twilio_subaccount", "twilio_subaccount_b"],
      default: "",
    },
    currencyCode: { type: String, required: true, uppercase: true, trim: true, maxlength: 3, minlength: 3 },
    supportNotes: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

CountryOpsProfileSchema.index({ countryCode: 1 }, { unique: true });
CountryOpsProfileSchema.index({ active: 1, sortOrder: 1 });

export default mongoose.model<ICountryOpsProfile>("CountryOpsProfile", CountryOpsProfileSchema);
