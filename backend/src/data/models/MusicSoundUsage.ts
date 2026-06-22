import mongoose, { Schema, Document } from "mongoose";

/** One row per QwertyTV video post that uses an approved catalog sound (royalty attribution). */
export interface IMusicSoundUsage extends Document {
  tvPostId: mongoose.Types.ObjectId;
  songId: mongoose.Types.ObjectId;
  /** Song owner at time of attach */
  rightsHolderUserId: mongoose.Types.ObjectId;
  /** Creator of the video */
  videoCreatorId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const MusicSoundUsageSchema = new Schema<IMusicSoundUsage>(
  {
    tvPostId: { type: Schema.Types.ObjectId, ref: "TVPost", required: true, unique: true, index: true },
    songId: { type: Schema.Types.ObjectId, ref: "Song", required: true, index: true },
    rightsHolderUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    videoCreatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MusicSoundUsageSchema.index({ songId: 1, createdAt: -1 });

export default mongoose.model<IMusicSoundUsage>("MusicSoundUsage", MusicSoundUsageSchema);
