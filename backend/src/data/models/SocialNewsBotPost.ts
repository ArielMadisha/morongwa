import mongoose, { Schema, Document } from "mongoose";

export interface ISocialNewsBotPost extends Document {
  source: "facebook";
  botKey: string;
  externalPostId: string;
  sourcePageId?: string;
  creatorId: mongoose.Types.ObjectId;
  postedTvPostId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SocialNewsBotPostSchema = new Schema<ISocialNewsBotPost>(
  {
    source: { type: String, enum: ["facebook"], required: true, index: true },
    botKey: { type: String, required: true, trim: true, index: true },
    externalPostId: { type: String, required: true, trim: true },
    sourcePageId: { type: String, trim: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    postedTvPostId: { type: Schema.Types.ObjectId, ref: "TVPost", required: true, index: true },
  },
  { timestamps: true }
);

SocialNewsBotPostSchema.index({ source: 1, externalPostId: 1 }, { unique: true });

export default mongoose.model<ISocialNewsBotPost>("SocialNewsBotPost", SocialNewsBotPostSchema);

