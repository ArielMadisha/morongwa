import mongoose, { Schema, Document } from "mongoose";

/**
 * Where the creative may be shown.
 * WhatsApp: after a main-menu choice (REST sends the video, then the submenu text — no in-chat autoplay).
 * Legacy keys `wa_premenu_*` remain accepted for older rows.
 */
export const SPONSORED_VIDEO_PLACEMENTS = [
  "wa_menu_about",
  "wa_menu_wallet",
  "wa_menu_marketplace",
  "wa_menu_errands",
  "wa_menu_mystore",
  "wa_menu_cart",
  "wa_menu_jobs",
  "wa_wallet_merchant",
  "wa_premenu_main",
  "wa_premenu_acbpay",
  "web_home",
  "web_wall",
  "web_marketplace",
  "web_checkout",
  "web_tv",
  "web_jobs",
  "web_wallet",
] as const;
export type SponsoredVideoPlacement = (typeof SPONSORED_VIDEO_PLACEMENTS)[number];

export interface ISponsoredVideoAd extends Document {
  advertiserId: mongoose.Types.ObjectId;
  title: string;
  videoUrl: string;
  caption?: string;
  placements: SponsoredVideoPlacement[];
  weight: number;
  approved: boolean;
  active: boolean;
  startDate?: Date;
  endDate?: Date;
  /** Billable rate in ZAR per 1,000 impressions (0 = track impressions only, no auto revenue). */
  rateZarPerThousandImpressions: number;
  /** Monetisation model for this ad placement. */
  adType: "CPM" | "CPC" | "CPA" | "HYBRID";
  /** Explicit rates used by the ad revenue engine (ZAR). */
  cpmRate: number;
  cpcRate: number;
  cpaRate: number;
  /** High-value audience targeting bucket. */
  targetAudience: "generic" | "wallet" | "runner" | "merchant" | "shopper";
  /** Feature/module classification for routing and analytics. */
  moduleCategory: "wallet" | "marketplace" | "errands" | "jobs" | "merchant" | "general";
  /** Priority for selection (higher = preferred). */
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

const SponsoredVideoAdSchema = new Schema<ISponsoredVideoAd>(
  {
    advertiserId: { type: Schema.Types.ObjectId, ref: "Advertiser", required: true, index: true },
    title: { type: String, required: true, trim: true },
    videoUrl: { type: String, required: true, trim: true },
    caption: { type: String, trim: true, maxlength: 2000 },
    placements: {
      type: [String],
      enum: [...SPONSORED_VIDEO_PLACEMENTS],
      default: ["wa_premenu_main"],
    },
    weight: { type: Number, default: 1, min: 0 },
    approved: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    startDate: { type: Date },
    endDate: { type: Date },
    rateZarPerThousandImpressions: { type: Number, default: 0, min: 0 },
    adType: { type: String, enum: ["CPM", "CPC", "CPA", "HYBRID"], default: "CPM", index: true },
    cpmRate: { type: Number, default: 0, min: 0 },
    cpcRate: { type: Number, default: 0, min: 0 },
    cpaRate: { type: Number, default: 0, min: 0 },
    targetAudience: {
      type: String,
      enum: ["generic", "wallet", "runner", "merchant", "shopper"],
      default: "generic",
      index: true,
    },
    moduleCategory: {
      type: String,
      enum: ["wallet", "marketplace", "errands", "jobs", "merchant", "general"],
      default: "general",
      index: true,
    },
    priority: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

SponsoredVideoAdSchema.index({ active: 1, approved: 1, placements: 1 });
SponsoredVideoAdSchema.index({ advertiserId: 1, active: 1 });

export default mongoose.model<ISponsoredVideoAd>("SponsoredVideoAd", SponsoredVideoAdSchema);
