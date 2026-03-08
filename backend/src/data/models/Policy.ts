// Policy and PolicyAcceptance models
import mongoose, { Schema, Document } from "mongoose";

export type PolicyVisibility = "public" | "internal";
export type PolicyStatus = "draft" | "published";

export interface IPolicyVersion {
  version: number;
  status: PolicyStatus;
  title: string;
  summary?: string;
  content: string;
  notes?: string;
  publishedAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPolicy extends Document {
  slug: string;
  title: string;
  category: string;
  visibility: PolicyVisibility;
  countryScope: string[];
  tags: string[];
  currentVersion: number;
  latestPublishedVersion?: number;
  versions: IPolicyVersion[];
  createdAt: Date;
  updatedAt: Date;
}

const PolicyVersionSchema = new Schema<IPolicyVersion>(
  {
    version: { type: Number, required: true },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    title: { type: String, required: true },
    summary: { type: String },
    content: { type: String, required: true },
    notes: { type: String },
    publishedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const PolicySchema = new Schema<IPolicy>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    visibility: { type: String, enum: ["public", "internal"], default: "public", index: true },
    countryScope: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    currentVersion: { type: Number, default: 0 },
    latestPublishedVersion: { type: Number },
    versions: { type: [PolicyVersionSchema], default: [] },
  },
  { timestamps: true }
);

PolicySchema.index({ slug: 1, currentVersion: -1 });
PolicySchema.index({ "versions.version": -1 });

export const Policy = mongoose.model<IPolicy>("Policy", PolicySchema);

export interface IPolicyAcceptance extends Document {
  policy: mongoose.Types.ObjectId;
  slug: string;
  version: number;
  user?: mongoose.Types.ObjectId | null;
  acceptedAt: Date;
  ip?: string;
  userAgent?: string;
  meta?: any;
}

const PolicyAcceptanceSchema = new Schema<IPolicyAcceptance>(
  {
    policy: { type: Schema.Types.ObjectId, ref: "Policy", required: true, index: true },
    slug: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    acceptedAt: { type: Date, default: Date.now },
    ip: { type: String },
    userAgent: { type: String },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

PolicyAcceptanceSchema.index({ user: 1, slug: 1, version: -1 });
PolicyAcceptanceSchema.index({ slug: 1, acceptedAt: -1 });

export const PolicyAcceptance = mongoose.model<IPolicyAcceptance>(
  "PolicyAcceptance",
  PolicyAcceptanceSchema
);
