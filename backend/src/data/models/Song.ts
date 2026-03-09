import mongoose, { Schema, Document } from "mongoose";

export interface ISong extends Document {
  /** song | album */
  type: "song" | "album";
  title: string;
  artist: string;
  songwriters?: string;
  producer?: string;
  genre: string;
  /** Explicitly marked lyrics (plain text) */
  lyrics?: string;
  /** WAV audio file URL */
  audioUrl: string;
  /** 3000x3000 cover art (JPEG/PNG) */
  artworkUrl: string;
  /** Uploading artist */
  userId: mongoose.Types.ObjectId;
  /** For albums: tracks */
  tracks?: { title: string; audioUrl: string; duration?: number }[];
  /** Optional paid download setting (streaming remains default). */
  downloadEnabled?: boolean;
  /** Download price in ZAR when enabled (R10-R15). */
  downloadPrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

const SongSchema = new Schema<ISong>(
  {
    type: { type: String, enum: ["song", "album"], default: "song" },
    title: { type: String, required: true },
    artist: { type: String, required: true },
    songwriters: { type: String },
    producer: { type: String },
    genre: { type: String, required: true },
    lyrics: { type: String },
    audioUrl: { type: String, required: true },
    artworkUrl: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tracks: [
      {
        title: String,
        audioUrl: String,
        duration: Number,
      },
    ],
    downloadEnabled: { type: Boolean, default: false },
    downloadPrice: { type: Number, min: 10, max: 15 },
  },
  { timestamps: true }
);

SongSchema.index({ userId: 1, createdAt: -1 });
SongSchema.index({ genre: 1 });
SongSchema.index({ type: 1 });

export default mongoose.model<ISong>("Song", SongSchema);
