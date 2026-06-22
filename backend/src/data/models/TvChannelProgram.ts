import mongoose, { Schema, Document } from "mongoose";

/** Admin-managed VOD item for the 24/7 QwertyTV linear channel (queue + EPG metadata). */
export interface ITvChannelProgram extends Document {
  title: string;
  description?: string;
  /** Relative or absolute URL to video file (e.g. /uploads/tv-channel/...) */
  videoUrl: string;
  /** Optional poster for grid / player */
  posterUrl?: string;
  durationSeconds: number;
  genre?: string;
  /** Manual queue order (lower = earlier in rotation). */
  sortOrder: number;
  /**
   * queue — plays in sortOrder rotation (default).
   * fixed — airs strictly between scheduledStart and end (scheduledEnd or start+duration); preempts queue.
   */
  scheduleMode: "queue" | "fixed";
  /** Optional programming grid window (display + planning). */
  scheduledStart?: Date;
  scheduledEnd?: Date;
  enabled: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TvChannelProgramSchema = new Schema<ITvChannelProgram>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    videoUrl: { type: String, required: true, trim: true },
    posterUrl: { type: String, trim: true },
    durationSeconds: { type: Number, required: true, min: 1, max: 86400 * 4 },
    genre: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
    scheduleMode: { type: String, enum: ["queue", "fixed"], default: "queue", index: true },
    scheduledStart: { type: Date },
    scheduledEnd: { type: Date },
    enabled: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

TvChannelProgramSchema.index({ enabled: 1, sortOrder: 1, createdAt: 1 });
TvChannelProgramSchema.index({ scheduledStart: 1 });

export default mongoose.model<ITvChannelProgram>("TvChannelProgram", TvChannelProgramSchema);
