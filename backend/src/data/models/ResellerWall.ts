import mongoose, { Schema, Document } from "mongoose";

export interface IResellerWallProduct {
  productId: mongoose.Types.ObjectId;
  resellerCommissionPct?: number; // 3-7% set by reseller when adding
  addedAt: Date;
}

export interface IResellerWall extends Document {
  resellerId: mongoose.Types.ObjectId;
  products: IResellerWallProduct[];
  createdAt: Date;
  updatedAt: Date;
}

const ResellerWallProductSchema = new Schema<IResellerWallProduct>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    resellerCommissionPct: { type: Number, min: 3, max: 7, default: 5 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ResellerWallSchema = new Schema<IResellerWall>(
  {
    resellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    products: { type: [ResellerWallProductSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<IResellerWall>("ResellerWall", ResellerWallSchema);
