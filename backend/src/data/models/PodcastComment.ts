import mongoose, { Schema, Document } from "mongoose";

export interface IPodcastComment extends Document {
  episodeId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  text: string;
  parentId?: mongoose.Types.ObjectId;
  status: "visible" | "hidden";
  createdAt: Date;
  updatedAt: Date;
}

const PodcastCommentSchema = new Schema<IPodcastComment>(
  {
    episodeId: { type: Schema.Types.ObjectId, ref: "PodcastEpisode", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    parentId: { type: Schema.Types.ObjectId, ref: "PodcastComment" },
    status: { type: String, enum: ["visible", "hidden"], default: "visible" },
  },
  { timestamps: true }
);

PodcastCommentSchema.index({ episodeId: 1, createdAt: -1 });

export default mongoose.model<IPodcastComment>("PodcastComment", PodcastCommentSchema);
