import mongoose, { Schema, Document } from "mongoose";

/** Single-row playback state for the admin linear channel. */
export interface ITvChannelState extends Document {
  /** Currently airing programme (null = idle / no queue). */
  currentProgramId?: mongoose.Types.ObjectId | null;
  isPaused: boolean;
  /**
   * Wall-clock anchor: at this instant, the effective playback position in the
   * current programme was `anchorElapsedMs` (milliseconds from start of file).
   */
  anchorWallTime?: Date | null;
  anchorElapsedMs: number;
  updatedAt: Date;
}

const TvChannelStateSchema = new Schema<ITvChannelState>(
  {
    currentProgramId: { type: Schema.Types.ObjectId, ref: "TvChannelProgram", default: null },
    isPaused: { type: Boolean, default: true },
    anchorWallTime: { type: Date, default: null },
    anchorElapsedMs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<ITvChannelState>("TvChannelState", TvChannelStateSchema);

/** Fixed id so we always upsert the same playback state row. */
export const TV_CHANNEL_STATE_ID = new mongoose.Types.ObjectId("000000000000000000000001");
