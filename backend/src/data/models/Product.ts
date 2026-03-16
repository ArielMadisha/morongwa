import mongoose, { Schema, Document } from "mongoose";

export type ProductSupplierSource = "internal" | "cj" | "spocket" | "eprolo";

export interface IProduct extends Document {
  supplierId?: mongoose.Types.ObjectId; // required for internal; null for external
  /** Source of product: internal (Qwertymates suppliers) or external dropshipper */
  supplierSource: ProductSupplierSource;
  /** Reference to ExternalSupplier when supplierSource is cj/spocket/eprolo */
  externalSupplierId?: mongoose.Types.ObjectId;
  /** Supplier's product ID (e.g. CJ product ID) */
  externalProductId?: string;
  /** Raw variant/shipping info from supplier API */
  externalData?: Record<string, unknown>;
  /** Raw cost from CJ/Spocket/EPROLO (external only) */
  supplierCost?: number;
  /** Platform markup % applied (e.g. 25). price = supplierCost * (1 + qwertymatesMarkupPct/100) */
  qwertymatesMarkupPct?: number;
  /** Recommended reseller selling price (2-tier: R = P ÷ (1 - reseller margin)) */
  recommendedResellerPrice?: number;
  /** Minimum resale price (MAP) – resellers cannot sell below this */
  minResalePrice?: number;
  /** Default reseller margin % for this product (e.g. 45) */
  resellerMarginPct?: number;
  title: string;
  slug: string;
  description?: string;
  images: string[];
  price: number;
  /** Discount/sale price. When set and less than price, customers pay this instead. */
  discountPrice?: number;
  /** Bulk sale tiers: quantity range → price per unit. E.g. [{ minQty: 1, maxQty: 100, price: 50 }, { minQty: 101, maxQty: 1000, price: 45 }] */
  bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
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
  /** Countries where this product is available (e.g. ["South Africa", "Botswana"]). Empty = no restriction. */
  availableCountries?: string[];
  ratingAvg?: number;
  ratingCount?: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    supplierSource: { type: String, enum: ["internal", "cj", "spocket", "eprolo"], default: "internal" },
    externalSupplierId: { type: Schema.Types.ObjectId, ref: "ExternalSupplier" },
    externalProductId: { type: String },
    externalData: { type: Schema.Types.Mixed },
    supplierCost: { type: Number },
    qwertymatesMarkupPct: { type: Number },
    recommendedResellerPrice: { type: Number },
    minResalePrice: { type: Number },
    resellerMarginPct: { type: Number },
    title: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String },
    images: { type: [String], default: [] },
    price: { type: Number, required: true },
    discountPrice: { type: Number },
    bulkTiers: {
      type: [
        {
          minQty: { type: Number, required: true },
          maxQty: { type: Number, required: true },
          price: { type: Number, required: true },
        },
      ],
      default: undefined,
    },
    currency: { type: String, default: "ZAR" },
    stock: { type: Number, default: 0 },
    outOfStock: { type: Boolean, default: false },
    sku: { type: String },
    sizes: { type: [String], default: [] },
    allowResell: { type: Boolean, default: false },
    commissionPct: { type: Number }, // deprecated; reseller sets 3-7% when adding to wall
    categories: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    availableCountries: { type: [String], default: [] },
    ratingAvg: { type: Number },
    ratingCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ProductSchema.index({ supplierId: 1 });
ProductSchema.index({ supplierSource: 1 });
ProductSchema.index({ externalSupplierId: 1 });
ProductSchema.index({ externalProductId: 1 });
ProductSchema.index({ slug: 1 }, { unique: true });
ProductSchema.index({ categories: 1 });
ProductSchema.index({ active: 1 });

ProductSchema.pre("save", function (next) {
  const src = this.supplierSource ?? "internal";
  if (src === "internal" && !this.supplierId) {
    next(new Error("supplierId is required when supplierSource is internal"));
    return;
  }
  if (["cj", "spocket", "eprolo"].includes(src) && !this.externalSupplierId) {
    next(new Error("externalSupplierId is required when supplierSource is external"));
    return;
  }
  next();
});

export default mongoose.model<IProduct>("Product", ProductSchema);
