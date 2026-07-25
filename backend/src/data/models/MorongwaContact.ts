import mongoose, { Schema, Document } from "mongoose";

export interface IMorongwaContact extends Document {
  ownerId: mongoose.Types.ObjectId;
  name: string;
  phone?: string;
  email?: string;
  platformUserId?: mongoose.Types.ObjectId;
  source?: "manual" | "csv" | "phone";
  createdAt: Date;
  updatedAt: Date;
}

const MorongwaContactSchema = new Schema<IMorongwaContact>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    platformUserId: { type: Schema.Types.ObjectId, ref: "User" },
    source: { type: String, enum: ["manual", "csv", "phone"], default: "manual" },
  },
  { timestamps: true }
);

MorongwaContactSchema.index({ ownerId: 1, phone: 1 });
MorongwaContactSchema.index({ ownerId: 1, name: 1 });

export default mongoose.model<IMorongwaContact>("MorongwaContact", MorongwaContactSchema);
