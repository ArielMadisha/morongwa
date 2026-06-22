import mongoose, { Schema, Document } from "mongoose";

export interface IBankImport extends Document {
  fileName: string;
  uploadedBy: mongoose.Types.ObjectId;
  rowCount: number;
  matchedCount: number;
  unmatchedCount: number;
  duplicateCount: number;
  fileHash: string;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BankImportSchema = new Schema<IBankImport>(
  {
    fileName: { type: String, required: true, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rowCount: { type: Number, default: 0, min: 0 },
    matchedCount: { type: Number, default: 0, min: 0 },
    unmatchedCount: { type: Number, default: 0, min: 0 },
    duplicateCount: { type: Number, default: 0, min: 0 },
    fileHash: { type: String, required: true, unique: true, index: true },
    processedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

export default mongoose.model<IBankImport>("BankImport", BankImportSchema);

