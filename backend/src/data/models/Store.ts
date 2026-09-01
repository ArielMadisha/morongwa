import mongoose, { Schema, Document } from "mongoose";

export type StoreType = "supplier" | "reseller";

/** Seller vertical — keeps Restaurant / Grocery / Essentials catalogs separate. */
export type StoreVertical = "restaurant" | "grocery" | "essentials";

export interface IStore extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  type: StoreType;
  /**
   * Catalog vertical for supplier stores.
   * - restaurant = Food & Restaurant / kota
   * - grocery = Groceries pickup
   * - essentials = default QwertyHub goods (and reseller walls)
   */
  vertical?: StoreVertical;
  /** ISO 3166-1 alpha-2 (e.g. ZA, BW) */
  countryCode?: string;
  /** Display country name (e.g. South Africa) */
  country?: string;
  supplierId?: mongoose.Types.ObjectId; // set when type === "supplier" (linked to Supplier)
  createdBy?: mongoose.Types.ObjectId; // admin who created the store (optional)
  /** Store contact & address (owner editable) */
  address?: string;
  /** Local area / township label (e.g. Temba Location, Hammanskraal-Rockville) */
  area?: string;
  /** Public Google Maps / place URL for pickup directions */
  mapsUrl?: string;
  latitude?: number;
  longitude?: number;
  email?: string;
  cellphone?: string;
  whatsapp?: string;
  /** Custom background for store strip/banner */
  stripBackgroundPic?: string;
  /** ISO codes where products appear on WhatsApp QwertyHub (menu 2). Empty → shop country only. */
  whatsappMarketCountries?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const StoreSchema = new Schema<IStore>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    type: { type: String, enum: ["supplier", "reseller"], required: true },
    vertical: {
      type: String,
      enum: ["restaurant", "grocery", "essentials"],
      default: "essentials",
    },
    countryCode: { type: String, trim: true, uppercase: true },
    country: { type: String, trim: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    address: { type: String, trim: true },
    area: { type: String, trim: true },
    mapsUrl: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
    email: { type: String, trim: true },
    cellphone: { type: String, trim: true },
    whatsapp: { type: String, trim: true },
    stripBackgroundPic: { type: String, trim: true },
    whatsappMarketCountries: { type: [String], default: undefined },
  },
  { timestamps: true }
);

/** Non-unique: some owners (e.g. canOwnMultipleStores) may have several stores per type. */
StoreSchema.index({ userId: 1, type: 1 });
StoreSchema.index({ slug: 1 }, { unique: true });
StoreSchema.index({ countryCode: 1 });
StoreSchema.index({ whatsappMarketCountries: 1 });

export default mongoose.model<IStore>("Store", StoreSchema);
