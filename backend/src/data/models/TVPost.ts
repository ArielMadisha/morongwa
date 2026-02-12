import mongoose, { Schema, Document } from "mongoose";

export const TV_WATERMARK = "The Digital Home for Doers, Sellers & Creators - Qwertymates.com";

export type TVPostType = "video" | "image" | "carousel" | "product";

export interface ITVPost extends Document {
  creatorId: mongoose.Types.ObjectId;
  type: TVPostType;
  /** Video URL or image URLs (for carousel, multiple) */
  mediaUrls: string[];
  caption?: string;
  /** Optional product to promote */
  productId?: mongoose.Types.ObjectId;
  /** Filter/enhancement applied (e.g. "warm", "cool", "vintage") */
  filter?: string;
  /** Has watermark applied */
  hasWatermark: boolean;
  /** If repost, original post ID */
  originalPostId?: mongoose.Types.ObjectId;
  repostedBy?: mongoose.Types.ObjectId;
  status: "pending" | "approved" | "rejected";
  aiModerated?: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const TVPostSchema = new Schema<ITVPost>(
  {
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["video", "image", "carousel", "product"], required: true },
    mediaUrls: { type: [String], required: true, default: [] },
    caption: { type: String },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    filter: { type: String },
    hasWatermark: { type: Boolean, default: true },
    originalPostId: { type: Schema.Types.ObjectId, ref: "TVPost" },
    repostedBy: { type: Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
    aiModerated: { type: Boolean },
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TVPostSchema.index({ creatorId: 1 });
TVPostSchema.index({ status: 1, createdAt: -1 });
TVPostSchema.index({ productId: 1 });

export default mongoose.model<ITVPost>("TVPost", TVPostSchema);
