import mongoose, { Schema, Document } from "mongoose";

export type MacGyverWebSource = { title: string; url: string; snippet?: string };

export interface IMacGyverLearnedEntry extends Document {
  /** Normalized lookup key (lowercase, collapsed whitespace) */
  queryKey: string;
  /** Last raw query text (for audit / display) */
  originalQuery: string;
  answer: string;
  webSources: MacGyverWebSource[];
  synthesizedAt: Date;
  hitCount: number;
  lastHitAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WebSourceSchema = new Schema(
  {
    title: { type: String, required: true },
    url: { type: String, required: true },
    snippet: { type: String },
  },
  { _id: false }
);

const MacGyverLearnedEntrySchema = new Schema<IMacGyverLearnedEntry>(
  {
    queryKey: { type: String, required: true, unique: true, index: true, maxlength: 512 },
    originalQuery: { type: String, required: true, maxlength: 2000 },
    answer: { type: String, required: true, maxlength: 32000 },
    webSources: { type: [WebSourceSchema], default: [] },
    synthesizedAt: { type: Date, required: true },
    hitCount: { type: Number, default: 0 },
    lastHitAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<IMacGyverLearnedEntry>("MacGyverLearnedEntry", MacGyverLearnedEntrySchema);
