import mongoose, { Schema, Document } from "mongoose";

export type StoreType = "supplier" | "reseller";

export interface IStore extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  type: StoreType;
  supplierId?: mongoose.Types.ObjectId; // set when type === "supplier" (linked to Supplier)
  createdBy?: mongoose.Types.ObjectId; // admin who created the store (optional)
  createdAt: Date;
  updatedAt: Date;
}

const StoreSchema = new Schema<IStore>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    type: { type: String, enum: ["supplier", "reseller"], required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

StoreSchema.index({ userId: 1, type: 1 }, { unique: true });
StoreSchema.index({ slug: 1 }, { unique: true });

export default mongoose.model<IStore>("Store", StoreSchema);
