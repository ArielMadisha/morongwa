import mongoose, { Schema, Document } from "mongoose";

export interface IWaPremenuMedia extends Document {
  label: string;
  originalName: string;
  /** Public path, e.g. /uploads/wa-adverts/wam-....mp4 */
  storedPath: string;
  mimeType: string;
  size: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WaPremenuMediaSchema = new Schema<IWaPremenuMedia>(
  {
    label: { type: String, default: "" },
    originalName: { type: String, required: true },
    storedPath: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

WaPremenuMediaSchema.index({ createdAt: -1 });

export default mongoose.model<IWaPremenuMedia>("WaPremenuMedia", WaPremenuMediaSchema);
