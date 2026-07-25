import mongoose, { Schema, Document } from "mongoose";

export type VoiceCallStatus =
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "failed"
  | "no-answer"
  | "canceled";

export interface IVoiceCall extends Document {
  user: mongoose.Types.ObjectId;
  /** Twilio Call SID for the parent leg */
  callSid?: string;
  /** E.164 digits only */
  callerPhone: string;
  destinationPhone: string;
  mode: "client" | "callback";
  status: VoiceCallStatus;
  durationSec: number;
  ratePerMinuteZar: number;
  connectFeeZar: number;
  billedAmountZar: number;
  currency: string;
  country: string;
  lineType: "mobile" | "landline";
  walletDebited: boolean;
  reference: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VoiceCallSchema = new Schema<IVoiceCall>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    callSid: { type: String, index: true, sparse: true },
    callerPhone: { type: String, default: "" },
    destinationPhone: { type: String, required: true },
    mode: { type: String, enum: ["client", "callback"], default: "client" },
    status: {
      type: String,
      enum: ["queued", "ringing", "in-progress", "completed", "busy", "failed", "no-answer", "canceled"],
      default: "queued",
    },
    durationSec: { type: Number, default: 0 },
    ratePerMinuteZar: { type: Number, default: 0 },
    connectFeeZar: { type: Number, default: 0 },
    billedAmountZar: { type: Number, default: 0 },
    currency: { type: String, default: "ZAR" },
    country: { type: String, default: "ZA" },
    lineType: { type: String, enum: ["mobile", "landline"], default: "mobile" },
    walletDebited: { type: Boolean, default: false },
    reference: { type: String, required: true, unique: true },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

VoiceCallSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model<IVoiceCall>("VoiceCall", VoiceCallSchema);
