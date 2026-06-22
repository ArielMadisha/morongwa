import mongoose, { Schema, Document } from "mongoose";

export type LivestreamMetricEventType =
  | "play_start"
  | "heartbeat"
  | "buffer_stall"
  | "error"
  | "fatal_error"
  | "ended";

/** Client-reported HLS playback signals for admin monitoring (no PII). */
export interface ILivestreamPlaybackEvent extends Document {
  broadcasterUserId: mongoose.Types.ObjectId;
  streamKey: string;
  eventType: LivestreamMetricEventType;
  /** Short client message (e.g. hls.js detail) */
  message?: string;
  /** Anonymous viewer session for rough concurrency (UUID from browser). */
  sessionId?: string;
  createdAt: Date;
}

const LivestreamPlaybackEventSchema = new Schema<ILivestreamPlaybackEvent>(
  {
    broadcasterUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    streamKey: { type: String, required: true, trim: true, index: true },
    eventType: {
      type: String,
      enum: ["play_start", "heartbeat", "buffer_stall", "error", "fatal_error", "ended"],
      required: true,
      index: true,
    },
    message: { type: String, maxlength: 500, trim: true },
    sessionId: { type: String, trim: true, maxlength: 80, index: true },
  },
  { timestamps: true }
);

LivestreamPlaybackEventSchema.index({ createdAt: -1 });
LivestreamPlaybackEventSchema.index({ broadcasterUserId: 1, createdAt: -1 });
LivestreamPlaybackEventSchema.index({ streamKey: 1, eventType: 1, createdAt: -1 });
/** Auto-prune old telemetry (Mongo TTL; requires replica set / TTL thread on standalone). */
LivestreamPlaybackEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export default mongoose.model<ILivestreamPlaybackEvent>("LivestreamPlaybackEvent", LivestreamPlaybackEventSchema);
