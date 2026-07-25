import mongoose, { Schema, Document } from "mongoose";

export type AdvertSlot = "random" | "promo";

export type AdvertCarouselCard = {
  imageUrl: string;
  title?: string;
  description?: string;
  linkUrl?: string;
};

export interface IAdvert extends Document {
  title: string;
  /** Image URL for the advert */
  imageUrl: string;
  /** Link to navigate when clicked */
  linkUrl?: string;
  /** Facebook-style: page / brand name shown in ad header */
  advertiserName?: string;
  /** Facebook-style: circular avatar in ad header */
  advertiserAvatar?: string;
  /** Body copy above the media (e.g. "Asia is calling…") */
  caption?: string;
  /** Subtitle on the card footer below media */
  description?: string;
  /** CTA button label (default: Learn more) */
  ctaLabel?: string;
  /** Optional video URL (plays in feed like Facebook video ads) */
  videoUrl?: string;
  /** Optional multi-card carousel (Flight Centre style) */
  carouselCards?: AdvertCarouselCard[];
  /** Slot: random = top square block (rotates), promo = bottom remainder (e.g. new product) */
  slot: AdvertSlot;
  /** Optional product to promote (links to marketplace product) */
  productId?: mongoose.Types.ObjectId;
  active: boolean;
  startDate?: Date;
  endDate?: Date;
  /** Order/priority for display (lower = higher priority) */
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const AdvertSchema = new Schema<IAdvert>(
  {
    title: { type: String, required: true },
    /** Image URL for the advert (optional when carouselCards or videoUrl provide creative) */
    imageUrl: { type: String, default: "" },
    linkUrl: { type: String },
    advertiserName: { type: String, trim: true, maxlength: 120 },
    advertiserAvatar: { type: String, trim: true },
    caption: { type: String, trim: true, maxlength: 2000 },
    description: { type: String, trim: true, maxlength: 500 },
    ctaLabel: { type: String, trim: true, maxlength: 40 },
    videoUrl: { type: String, trim: true },
    carouselCards: {
      type: [
        {
          imageUrl: { type: String, required: true },
          title: { type: String, trim: true, maxlength: 120 },
          description: { type: String, trim: true, maxlength: 300 },
          linkUrl: { type: String, trim: true },
        },
      ],
      default: undefined,
    },
    slot: { type: String, enum: ["random", "promo"], required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    active: { type: Boolean, default: true },
    startDate: { type: Date },
    endDate: { type: Date },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AdvertSchema.index({ slot: 1, active: 1 });

export default mongoose.model<IAdvert>("Advert", AdvertSchema);
