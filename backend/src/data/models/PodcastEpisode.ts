import mongoose, { Schema, Document } from "mongoose";

/** Adaptive-streaming rendition produced by the processing layer. */
export interface IPodcastRendition {
  bitrateKbps: number;
  url: string;
  codec?: string;
}

export type PodcastProcessingState = "pending" | "processing" | "ready" | "failed" | "skipped";

export interface IPodcastEpisode extends Document {
  podcastId: mongoose.Types.ObjectId;
  creatorId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  tags: string[];
  /** Inherited from show at create time so browse-by-category can query episodes directly. */
  category: string;
  /** Original uploaded audio (MP3 / AAC / M4A / WAV). Always playable. */
  audioUrl: string;
  /** Adaptive HLS manifest when transcoding has run (deferred: see DOCS/QwertyPodcasts). */
  hlsUrl?: string;
  renditions: IPodcastRendition[];
  coverUrl?: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  mimeType?: string;
  episodeNumber?: number;
  seasonNumber?: number;

  /** Processing layer */
  transcodeState: PodcastProcessingState;
  transcodeError?: string;
  transcriptState: PodcastProcessingState;
  /** AskMacGyver speech-to-text output (deferred beyond hook). */
  transcriptText?: string;
  moderationState: "pending" | "approved" | "flagged" | "rejected";
  moderationReason?: string;

  /** Distribution */
  allowDownload: boolean;
  /** Cross-post to the QwertyTV/social feed. */
  tvPostId?: mongoose.Types.ObjectId;

  /** Monetization */
  isPremium: boolean;
  /** Price in ZAR when premium; unlocked via ACBPay Wallet (not offered on iOS). */
  price?: number;
  /** Dynamic ad insertion markers (seconds offsets); pre-roll is 0. */
  adBreaksSeconds: number[];
  sponsorshipTier?: "gold" | "silver" | "bronze";
  sponsorName?: string;

  status: "draft" | "published" | "removed";
  publishedAt?: Date;
  playCount: number;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const PodcastEpisodeSchema = new Schema<IPodcastEpisode>(
  {
    podcastId: { type: Schema.Types.ObjectId, ref: "Podcast", required: true, index: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 8000 },
    tags: { type: [String], default: [] },
    category: { type: String, required: true, index: true },
    audioUrl: { type: String, required: true },
    hlsUrl: { type: String },
    renditions: {
      type: [
        {
          bitrateKbps: { type: Number, required: true },
          url: { type: String, required: true },
          codec: { type: String },
        },
      ],
      default: [],
    },
    coverUrl: { type: String },
    durationSeconds: { type: Number },
    fileSizeBytes: { type: Number },
    mimeType: { type: String },
    episodeNumber: { type: Number },
    seasonNumber: { type: Number },

    transcodeState: {
      type: String,
      enum: ["pending", "processing", "ready", "failed", "skipped"],
      default: "pending",
    },
    transcodeError: { type: String },
    transcriptState: {
      type: String,
      enum: ["pending", "processing", "ready", "failed", "skipped"],
      default: "pending",
    },
    transcriptText: { type: String },
    moderationState: {
      type: String,
      enum: ["pending", "approved", "flagged", "rejected"],
      default: "approved",
      index: true,
    },
    moderationReason: { type: String },

    allowDownload: { type: Boolean, default: true },
    tvPostId: { type: Schema.Types.ObjectId, ref: "TVPost" },

    isPremium: { type: Boolean, default: false },
    price: { type: Number, min: 0 },
    adBreaksSeconds: { type: [Number], default: [] },
    sponsorshipTier: { type: String, enum: ["gold", "silver", "bronze"] },
    sponsorName: { type: String, trim: true, maxlength: 120 },

    status: { type: String, enum: ["draft", "published", "removed"], default: "published", index: true },
    publishedAt: { type: Date },
    playCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PodcastEpisodeSchema.index({ status: 1, category: 1, publishedAt: -1 });
PodcastEpisodeSchema.index({ podcastId: 1, publishedAt: -1 });
PodcastEpisodeSchema.index({ title: "text", description: "text" });

export default mongoose.model<IPodcastEpisode>("PodcastEpisode", PodcastEpisodeSchema);
