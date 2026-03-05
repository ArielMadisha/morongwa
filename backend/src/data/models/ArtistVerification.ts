import mongoose, { Schema, Document } from "mongoose";

export type ArtistVerificationStatus = "pending" | "approved" | "rejected";

export interface IArtistVerification extends Document {
  userId: mongoose.Types.ObjectId;
  /** company | artist | producer */
  type: "company" | "artist" | "producer";
  stageName?: string;
  labelName?: string;
  status: ArtistVerificationStatus;
  /** Electronic verification (e.g. automated checks) */
  electronicVerified?: boolean;
  /** Manual verification by admin */
  manualVerified?: boolean;
  verifiedAt?: Date;
  verifiedBy?: mongoose.Types.ObjectId;
  rejectionReason?: string;
  documents?: { filename: string; path: string; uploadedAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

const ArtistVerificationSchema = new Schema<IArtistVerification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["company", "artist", "producer"], required: true },
    stageName: { type: String },
    labelName: { type: String },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    electronicVerified: { type: Boolean },
    manualVerified: { type: Boolean },
    verifiedAt: { type: Date },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectionReason: { type: String },
    documents: [
      {
        filename: String,
        path: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

ArtistVerificationSchema.index({ userId: 1 }, { unique: true });
ArtistVerificationSchema.index({ status: 1 });

export default mongoose.model<IArtistVerification>("ArtistVerification", ArtistVerificationSchema);
