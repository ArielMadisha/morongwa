import mongoose, { Schema, Document } from "mongoose";

export interface IProduct extends Document {
  supplierId: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  description?: string;
  images: string[];
  price: number;
  /** Discount/sale price. When set and less than price, customers pay this instead. */
  discountPrice?: number;
  currency: string;
  stock: number;
  /** When true, product cannot be purchased (e.g. depleted stock). */
  outOfStock?: boolean;
  sku?: string;
  sizes?: string[];
  allowResell: boolean;
  commissionPct?: number; // deprecated: moved to reseller wall; kept for backward compat
  categories: string[];
  tags: string[];
  ratingAvg?: number;
  ratingCount?: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    title: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String },
    images: { type: [String], default: [] },
    price: { type: Number, required: true },
    discountPrice: { type: Number },
    currency: { type: String, default: "ZAR" },
    stock: { type: Number, default: 0 },
    outOfStock: { type: Boolean, default: false },
    sku: { type: String },
    sizes: { type: [String], default: [] },
    allowResell: { type: Boolean, default: false },
    commissionPct: { type: Number }, // deprecated; reseller sets 3-7% when adding to wall
    categories: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    ratingAvg: { type: Number },
    ratingCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ProductSchema.index({ supplierId: 1 });
ProductSchema.index({ slug: 1 }, { unique: true });
ProductSchema.index({ categories: 1 });
ProductSchema.index({ active: 1 });

export default mongoose.model<IProduct>("Product", ProductSchema);
