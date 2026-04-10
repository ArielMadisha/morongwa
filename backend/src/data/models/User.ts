// User model with role-based access
import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUser extends Document {
  name: string;
  username?: string;
  email: string;
  phone?: string;
  /** ISO 3166-1 alpha-2 from registered phone (E.164) */
  countryCode?: string;
  /** ISO 4217 — derived from phone country + platform rules (EU/US → USD, IN → INR, …) */
  preferredCurrency?: string;
  passwordHash: string;
  /** Set by import scripts when the row came from a legacy site (used for bulk activation ops). */
  importedFromLegacy?: boolean;
  dateOfBirth?: Date;
  role: ("client" | "runner" | "admin" | "superadmin")[];
  avatar?: string;
  /** Custom background for status strip (profile customization) */
  stripBackgroundPic?: string;
  isVerified: boolean;
  active: boolean;
  suspended: boolean;
  suspendedAt?: Date;
  locked: boolean;
  resetPasswordToken?: string;
  resetPasswordExpires?: number;
  // Vehicles (runners may register up to 3 vehicles)
  vehicles?: Array<{
    make?: string;
    model?: string;
    plate?: string;
    documents: Array<{ filename: string; path: string; uploadedAt: Date }>;
    verified?: boolean;
  }>;
  // Professional Driving Permit (PDP)
  pdp?: { filename: string; path: string; uploadedAt: Date; verified?: boolean } | null;
  // Runner current geolocation
  location?: { type: string; coordinates: number[]; updatedAt?: Date };
  // Runner verification flag (vehicles + PDP verified by admin)
  runnerVerified?: boolean;
  /** Private account: follow requests require acceptance */
  isPrivate?: boolean;
  /** Currently broadcasting live - shows in statuses and LiveTV */
  isLive?: boolean;
  /** Set when user ends a live session; LIVE badge stays visible for 24h after this time */
  lastLiveEndedAt?: Date;
  /** Verified music artist/company/producer - can upload music to QwertyMusic */
  artistVerified?: boolean;
  /** Delivery preferences for order notifications */
  notificationPreferences?: {
    orderMessenger?: boolean;
    orderEmail?: boolean;
    orderSms?: boolean;
    orderWhatsapp?: boolean;
  };
  /** ACBPayWallet merchant agent — cash-in/cash-out; requires KYC, admin approval, float. */
  merchantAgent?: {
    enabled: boolean;
    /** none = not applied; pending = awaiting admin; approved | rejected | suspended */
    applicationStatus?: "none" | "pending" | "approved" | "rejected" | "suspended";
    businessName?: string;
    businessDescription?: string;
    publicNote?: string;
    /** User attested KYC/business truthfulness at application time */
    kycAttestedAt?: Date;
    appliedAt?: Date;
    reviewedAt?: Date;
    reviewedBy?: Types.ObjectId;
    rejectionReason?: string;
  };
  /** WhatsApp "Explore more" (menu 2): product _ids already shown; next batch excludes these. */
  waExploreSeenProductIds?: Types.ObjectId[];
  /** Feed content preferences – hide products, etc. */
  contentPreferences?: {
    /** When false, product posts and product tiles are hidden from feed */
    showProducts?: boolean;
    /** When we last showed the preferences pop-up (for re-asking periodically) */
    preferencesAskedAt?: Date;
    /** When user explicitly set preferences */
    preferencesSetAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    countryCode: { type: String, trim: true, uppercase: true, maxlength: 2 },
    preferredCurrency: { type: String, trim: true, uppercase: true, maxlength: 3 },
    passwordHash: { type: String, required: true },
    dateOfBirth: { type: Date },
    role: { 
      type: [String], 
      enum: ["client", "runner", "admin", "superadmin"], 
      default: ["client"],
      validate: {
        validator: function(v: string[]) {
          return v && v.length > 0;
        },
        message: 'User must have at least one role'
      }
    },
    avatar: { type: String },
    stripBackgroundPic: { type: String },
    vehicles: [
      {
        make: String,
        model: String,
        plate: String,
        documents: [
          {
            filename: String,
            path: String,
            uploadedAt: Date,
          },
        ],
        verified: { type: Boolean, default: false },
      },
    ],
    pdp: {
      filename: String,
      path: String,
      uploadedAt: Date,
      verified: { type: Boolean, default: false },
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] },
      updatedAt: { type: Date },
    },
    runnerVerified: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    isLive: { type: Boolean, default: false },
    lastLiveEndedAt: { type: Date },
    artistVerified: { type: Boolean, default: false },
    notificationPreferences: {
      orderMessenger: { type: Boolean, default: true },
      orderEmail: { type: Boolean, default: true },
      orderSms: { type: Boolean, default: false },
      orderWhatsapp: { type: Boolean, default: false },
    },
    merchantAgent: {
      enabled: { type: Boolean, default: false },
      applicationStatus: {
        type: String,
        enum: ["none", "pending", "approved", "rejected", "suspended"],
        default: "none",
      },
      businessName: { type: String, maxlength: 120 },
      businessDescription: { type: String, maxlength: 2000 },
      publicNote: { type: String, maxlength: 200 },
      kycAttestedAt: { type: Date },
      appliedAt: { type: Date },
      reviewedAt: { type: Date },
      reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
      rejectionReason: { type: String, maxlength: 500 },
    },
    waExploreSeenProductIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    contentPreferences: {
      showProducts: { type: Boolean, default: true },
      preferencesAskedAt: { type: Date },
      preferencesSetAt: { type: Date },
    },
    importedFromLegacy: { type: Boolean, default: false, index: true },
    isVerified: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    suspended: { type: Boolean, default: false },
    suspendedAt: { type: Date },
    locked: { type: Boolean, default: false },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Number },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1 });

UserSchema.set("toJSON", {
  transform: (_doc: any, ret: any) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model<IUser>("User", UserSchema);
