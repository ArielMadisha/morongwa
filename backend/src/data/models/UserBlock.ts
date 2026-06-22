import mongoose, { Schema, Document } from "mongoose";

export interface IUserBlock extends Document {
  blockerId: mongoose.Types.ObjectId;
  blockedId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const UserBlockSchema = new Schema<IUserBlock>(
  {
    blockerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    blockedId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

UserBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
UserBlockSchema.index({ blockerId: 1 });

export default mongoose.model<IUserBlock>("UserBlock", UserBlockSchema);
