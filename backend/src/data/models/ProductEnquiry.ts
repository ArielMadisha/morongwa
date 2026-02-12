import mongoose, { Schema, Document } from "mongoose";

export interface IProductEnquiry extends Document {
  productId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProductEnquirySchema = new Schema<IProductEnquiry>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ProductEnquirySchema.index({ productId: 1, buyerId: 1 }, { unique: true });
ProductEnquirySchema.index({ buyerId: 1 });
ProductEnquirySchema.index({ sellerId: 1 });

export default mongoose.model<IProductEnquiry>("ProductEnquiry", ProductEnquirySchema);
