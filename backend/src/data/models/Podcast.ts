import mongoose, { Schema, Document } from "mongoose";

/** QwertyPodcasts show (a creator-owned series that episodes belong to). */
export interface IPodcast extends Document {
  ownerId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  /** Category id from PODCAST_CATEGORIES (business, lifestyle, music, ...). */
  category: string;
  tags: string[];
  coverUrl?: string;
  language?: string;
  explicit?: boolean;
  status: "active" | "hidden" | "removed";
  episodeCount: number;
  subscriberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const PodcastSchema = new Schema<IPodcast>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 4000 },
    category: { type: String, required: true, index: true },
    tags: { type: [String], default: [] },
    coverUrl: { type: String },
    language: { type: String, default: "en" },
    explicit: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "hidden", "removed"], default: "active", index: true },
    episodeCount: { type: Number, default: 0 },
    subscriberCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PodcastSchema.index({ status: 1, category: 1, createdAt: -1 });
PodcastSchema.index({ title: "text", description: "text" });

export default mongoose.model<IPodcast>("Podcast", PodcastSchema);
