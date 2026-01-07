// FileShare model for files shared in messenger threads
import mongoose, { Schema, Document } from "mongoose";

export interface IFileShare extends Document {
  task: mongoose.Types.ObjectId;
  uploader: mongoose.Types.ObjectId;
  filename: string;
  originalName: string;
  path: string;
  mimetype: string;
  size: number;
  createdAt: Date;
}

const FileShareSchema = new Schema<IFileShare>(
  {
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    uploader: { type: Schema.Types.ObjectId, ref: "User", required: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IFileShare>("FileShare", FileShareSchema);
