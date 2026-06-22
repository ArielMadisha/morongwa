import mongoose, { Schema, Document } from "mongoose";

export type AdvertiserWebOnboardingStatus = "pending" | "approved" | "rejected";

export interface IAdvertiser extends Document {
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  /**
   * Web self-serve: pending until admin approves. Omitted/null/legacy counts as approved for backwards compatibility.
   */
  webOnboardingStatus?: AdvertiserWebOnboardingStatus;
  /** e.g. starter, growth, premium, video_pack, addon_wallet_banner */
  webPackageTier?: string;
  /** Admin-visible package / onboarding notes (rejection reason, SLA, etc.). */
  webOnboardingNotes?: string;
  active: boolean;
  passwordHash?: string;
  verified: boolean;
  companyName?: string;
  objective?: "CPM" | "CPC" | "CPA";
  targetAudience?: string[];
  targetLocation?: string[];
  behaviourTags?: string[];
  budget?: number;
  walletBalance: number;
  totalSpent: number;
  status: "active" | "paused" | "blocked";
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AdvertiserSchema = new Schema<IAdvertiser>(
  {
    name: { type: String, required: true, trim: true },
    contactEmail: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 4000 },
    webOnboardingStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      index: true,
    },
    webPackageTier: { type: String, trim: true, maxlength: 120 },
    webOnboardingNotes: { type: String, trim: true, maxlength: 4000 },
    active: { type: Boolean, default: true },
    passwordHash: { type: String, trim: true, select: false },
    verified: { type: Boolean, default: false, index: true },
    companyName: { type: String, trim: true },
    objective: { type: String, enum: ["CPM", "CPC", "CPA"] },
    targetAudience: { type: [String], default: [] },
    targetLocation: { type: [String], default: [] },
    behaviourTags: { type: [String], default: [] },
    budget: { type: Number, min: 0 },
    walletBalance: { type: Number, default: 0, min: 0 },
    totalSpent: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["active", "paused", "blocked"], default: "active", index: true },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { timestamps: true }
);

AdvertiserSchema.index({ active: 1, name: 1 });

export default mongoose.model<IAdvertiser>("Advertiser", AdvertiserSchema);
