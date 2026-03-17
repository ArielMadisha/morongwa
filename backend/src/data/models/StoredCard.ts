// Stored card (PayGate PayVault token) for ACBPayWallet
import mongoose, { Schema, Document } from "mongoose";

export interface IStoredCard extends Document {
  user: mongoose.Types.ObjectId;
  /** PayGate PayVault token - never expose to frontend */
  vaultId: string;
  /** Optional PayVault metadata for token management */
  payvaultData1?: string;
  payvaultData2?: string;
  /** Last 4 digits for display */
  last4: string;
  /** Visa, Mastercard, etc. */
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StoredCardSchema = new Schema<IStoredCard>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vaultId: { type: String, required: true },
    payvaultData1: { type: String },
    payvaultData2: { type: String },
    last4: { type: String, required: true, maxlength: 4 },
    brand: { type: String, required: true },
    expiryMonth: { type: Number, required: true, min: 1, max: 12 },
    expiryYear: { type: Number, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

StoredCardSchema.index({ user: 1 });
StoredCardSchema.index({ user: 1, vaultId: 1 }, { unique: true });

export default mongoose.model<IStoredCard>("StoredCard", StoredCardSchema);
