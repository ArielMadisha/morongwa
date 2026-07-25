import mongoose, { Schema, Document } from "mongoose";

export interface IMorongwaUserFile extends Document {
  senderId: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  filename: string;
  originalName: string;
  path: string;
  mimetype: string;
  size: number;
  downloadedAt?: Date;
  createdAt: Date;
}

const MorongwaUserFileSchema = new Schema<IMorongwaUserFile>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    downloadedAt: { type: Date },
  },
  { timestamps: true }
);

MorongwaUserFileSchema.index({ senderId: 1, createdAt: -1 });
MorongwaUserFileSchema.index({ recipientId: 1, createdAt: -1 });

export default mongoose.model<IMorongwaUserFile>("MorongwaUserFile", MorongwaUserFileSchema);
