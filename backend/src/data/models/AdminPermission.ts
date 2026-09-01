import mongoose, { Schema, Document } from "mongoose";

/** All slugs super-admins can assign to delegated admins (matches admin dashboard areas). */
export const ADMIN_SECTION_SLUGS = [
  "tv_posts",
  "tv_comments",
  "tv_reports",
  "products",
  "product_uploads",
  "suppliers",
  "supplier_uploads",
  "dropshipping",
  "stores",
  "users",
  "orders",
  "couriers",
  "tasks",
  "support",
  "policies",
  "merchant_agents",
  "adverts",
  "product_enquiries",
  "money_metrics",
  "sponsored_video",
  "web_advertising",
  "music_sound_library",
  "artist_accounts",
  "runner_applications",
  "tuckshop_cash_agents",
  "fraud_registration",
  "tv_channel",
  "country_profiles",
  "live_streaming",
  "messages_dm",
  "user_broadcast",
  "landing_backgrounds",
  "reseller_stats",
  "escrows",
] as const;

export type AdminSection = (typeof ADMIN_SECTION_SLUGS)[number];

const ADMIN_SECTION_ENUM = [...ADMIN_SECTION_SLUGS] as unknown as string[];

export { SUPPORT_CATEGORY_MAIN, type SupportMainCategory } from "../../config/supportCategories";

export interface IAdminPermission extends Document {
  userId: mongoose.Types.ObjectId;
  sections: AdminSection[];
  /** Support ticket categories this admin can handle. Empty = all categories (when support section is granted). */
  supportCategories: string[];
  /**
   * When set, Load Products (and related product APIs) are limited to this supplier/store only.
   * Empty / unset = all approved suppliers (default for full product admins).
   */
  scopedSupplierId?: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AdminPermissionSchema = new Schema<IAdminPermission>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    sections: {
      type: [String],
      enum: ADMIN_SECTION_ENUM,
      default: [],
    },
    supportCategories: {
      type: [String],
      default: [],
    },
    scopedSupplierId: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IAdminPermission>("AdminPermission", AdminPermissionSchema);
