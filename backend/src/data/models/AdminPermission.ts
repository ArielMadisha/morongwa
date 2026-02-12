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

export interface IAdminPermission extends Document {
  userId: mongoose.Types.ObjectId;
  sections: AdminSection[];
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
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

AdminPermissionSchema.index({ userId: 1 });

export default mongoose.model<IAdminPermission>("AdminPermission", AdminPermissionSchema);
