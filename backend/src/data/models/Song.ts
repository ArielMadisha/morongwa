import mongoose, { Schema, Document } from "mongoose";

export type SoundLibraryStatus = "none" | "pending" | "approved" | "rejected";

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
  /** 1200×1200 cover art (JPEG/PNG) - fits display area */
  artworkUrl: string;
  /** Uploading artist */
  userId: mongoose.Types.ObjectId;
  /** For albums: tracks */
  tracks?: { title: string; audioUrl: string; duration?: number }[];
  /** Optional paid download setting (streaming remains default). */
  downloadEnabled?: boolean;
  /** Download price in ZAR when enabled (R10-R25). */
  downloadPrice?: number;
  /** QwertyTV “Sounds” catalog (TikTok-style licensed use on videos). */
  soundLibraryStatus?: SoundLibraryStatus;
  soundLibraryNote?: string;
  soundLibraryRejectedReason?: string;
  soundLibraryRequestedAt?: Date;
  soundLibraryReviewedAt?: Date;
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
    downloadPrice: { type: Number, min: 10, max: 25 },
    soundLibraryStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
      index: true,
    },
    soundLibraryNote: { type: String, maxlength: 500, trim: true },
    soundLibraryRejectedReason: { type: String, maxlength: 500, trim: true },
    soundLibraryRequestedAt: { type: Date },
    soundLibraryReviewedAt: { type: Date },
  },
  { timestamps: true }
);

SongSchema.index({ userId: 1, createdAt: -1 });
SongSchema.index({ genre: 1 });
SongSchema.index({ type: 1 });
SongSchema.index({ soundLibraryStatus: 1, type: 1 });

export default mongoose.model<ISong>("Song", SongSchema);
