import mongoose, { Schema, Document } from "mongoose";

/** Sections that admins can moderate */
export type AdminSection =
  | "tv_posts"
  | "tv_comments"
  | "tv_reports"
  | "products"
  | "suppliers"
  | "users"
  | "orders"
  | "tasks"
  | "support"
  | "policies";

/** Support ticket main categories - when admin has "support" section, these limit which tickets they see. Empty = all. */
export const SUPPORT_CATEGORY_MAIN = ["music", "videos", "wallet", "products", "general"] as const;

export interface IAdminPermission extends Document {
  userId: mongoose.Types.ObjectId;
  sections: AdminSection[];
  /** Support ticket categories this admin can handle. Empty = all categories (when support section is granted). */
  supportCategories: string[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AdminPermissionSchema = new Schema<IAdminPermission>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    sections: {
      type: [String],
      enum: ["tv_posts", "tv_comments", "tv_reports", "products", "suppliers", "users", "orders", "tasks", "support", "policies"],
      default: [],
    },
    supportCategories: {
      type: [String],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IAdminPermission>("AdminPermission", AdminPermissionSchema);
