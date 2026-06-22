import mongoose, { Schema, Document } from "mongoose";

export interface IFacebookIngestState extends Document {
  /** facebook.com/{pageSlug} */
  pageSlug: string;
  lastImportedPostId?: string;
  lastRunAt?: Date;
  lastSuccessAt?: Date;
  lastErrorAt?: Date;
  lastErrorMessage?: string;
  lastTvPostId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FacebookIngestStateSchema = new Schema<IFacebookIngestState>(
  {
    pageSlug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    lastImportedPostId: { type: String, trim: true },
    lastRunAt: { type: Date },
    lastSuccessAt: { type: Date },
    lastErrorAt: { type: Date },
    lastErrorMessage: { type: String, maxlength: 2000 },
    lastTvPostId: { type: Schema.Types.ObjectId, ref: "TVPost" },
  },
  { timestamps: true }
);

export default mongoose.model<IFacebookIngestState>(
  "FacebookIngestState",
  FacebookIngestStateSchema
);
