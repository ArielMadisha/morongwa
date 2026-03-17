import mongoose, { Schema, Document } from "mongoose";

export interface IDirectMessage extends Document {
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  content: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DirectMessageSchema = new Schema<IDirectMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true }
);

DirectMessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
DirectMessageSchema.index({ receiver: 1, read: 1 });

export default mongoose.model<IDirectMessage>("DirectMessage", DirectMessageSchema);
