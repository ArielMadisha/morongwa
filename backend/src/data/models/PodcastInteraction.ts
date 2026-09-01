import mongoose, { Schema, Document } from "mongoose";

/** Likes / plays used for engagement counts and AskMacGyver recommendations. */
export interface IPodcastInteraction extends Document {
  episodeId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: "like" | "play";
  /** Furthest listened position, used for resume + recommendation signals. */
  positionSeconds?: number;
  createdAt: Date;
  updatedAt: Date;
}

const PodcastInteractionSchema = new Schema<IPodcastInteraction>(
  {
    episodeId: { type: Schema.Types.ObjectId, ref: "PodcastEpisode", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["like", "play"], required: true },
    positionSeconds: { type: Number, min: 0 },
  },
  { timestamps: true }
);

PodcastInteractionSchema.index({ episodeId: 1, userId: 1, type: 1 }, { unique: true });
PodcastInteractionSchema.index({ userId: 1, type: 1, updatedAt: -1 });

export default mongoose.model<IPodcastInteraction>("PodcastInteraction", PodcastInteractionSchema);
