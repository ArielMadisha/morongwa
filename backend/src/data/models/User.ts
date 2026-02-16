// User model with role-based access
import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
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
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
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
