// User model with role-based access
import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: "client" | "runner" | "admin" | "superadmin";
  avatar?: string;
  isVerified: boolean;
  active: boolean;
  suspended: boolean;
  suspendedAt?: Date;
  locked: boolean;
  resetPasswordToken?: string;
  resetPasswordExpires?: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["client", "runner", "admin", "superadmin"], default: "client" },
    avatar: { type: String },
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
