import mongoose, { Schema, Document } from "mongoose";

export interface ILandingBackground extends Document {
  imageUrl: string;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LandingBackgroundSchema = new Schema<ILandingBackground>(
  {
    imageUrl: { type: String, required: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

LandingBackgroundSchema.index({ order: 1 });

export default mongoose.model<ILandingBackground>("LandingBackground", LandingBackgroundSchema);
