import mongoose, { Schema, Document } from "mongoose";

export interface IProductEnquiryMessage extends Document {
  enquiryId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProductEnquiryMessageSchema = new Schema<IProductEnquiryMessage>(
  {
    enquiryId: { type: Schema.Types.ObjectId, ref: "ProductEnquiry", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    read: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

ProductEnquiryMessageSchema.index({ enquiryId: 1, createdAt: 1 });
ProductEnquiryMessageSchema.index({ enquiryId: 1, read: 1 });

export default mongoose.model<IProductEnquiryMessage>("ProductEnquiryMessage", ProductEnquiryMessageSchema);
