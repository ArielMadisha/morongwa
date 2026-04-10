import mongoose, { Schema, Document } from "mongoose";

export const TV_WATERMARK = "The Digital Home for Doers, Sellers & Creators - Qwertymates.com";

export type TVPostType = "video" | "image" | "carousel" | "product" | "text" | "audio";

export interface ITVPost extends Document {
  creatorId: mongoose.Types.ObjectId;
  type: TVPostType;
  /** Video URL or image URLs (for carousel, multiple) */
  mediaUrls: string[];
  caption?: string;
  /** Text post: larger heading */
  heading?: string;
  /** Text post: smaller subject/body */
  subject?: string;
  /** Text post: hashtags (e.g. ["SadioMane", "Senegal"]) */
  hashtags?: string[];
  /** Optional product to promote */
  productId?: mongoose.Types.ObjectId;
  /** True when post was created from a reseller adding a QwertyHub product to their wall (feed ordering + UI) */
  fromResellerWall?: boolean;
  /** For audio posts: cover/artwork image URL */
  artworkUrl?: string;
  /** For audio posts: linked Song from QwertyMusic (enables purchase/download) */
  songId?: mongoose.Types.ObjectId;
  /** Filter/enhancement applied (e.g. "warm", "cool", "vintage") */
  filter?: string;
  /** Genre (e.g. "qwertz", "comedy", "action", "drama", "scifi", "thriller", "reality", "family") */
  genre?: string;
  /** Has watermark applied */
  hasWatermark: boolean;
  /** If repost, original post ID */
  originalPostId?: mongoose.Types.ObjectId;
  repostedBy?: mongoose.Types.ObjectId;
  status: "pending" | "approved" | "rejected";
  aiModerated?: boolean;
  /** When true, media is blurred until user clicks to reveal */
  sensitive?: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const TVPostSchema = new Schema<ITVPost>(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["video", "image", "carousel", "product", "text", "audio"], required: true },
    mediaUrls: { type: [String], default: [] },
    caption: { type: String },
    heading: { type: String },
    subject: { type: String },
    hashtags: { type: [String], default: [] },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    fromResellerWall: { type: Boolean, default: false },
    artworkUrl: { type: String },
    songId: { type: Schema.Types.ObjectId, ref: "Song" },
    filter: { type: String },
    genre: { type: String },
    hasWatermark: { type: Boolean, default: true },
    originalPostId: { type: Schema.Types.ObjectId, ref: "TVPost" },
    repostedBy: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
    aiModerated: { type: Boolean },
    sensitive: { type: Boolean },
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TVPostSchema.index({ creatorId: 1 });
TVPostSchema.index({ status: 1, createdAt: -1 });
TVPostSchema.index({ productId: 1 });

export default mongoose.model<ITVPost>("TVPost", TVPostSchema);
