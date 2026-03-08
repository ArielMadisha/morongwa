// Notification model for user alerts
import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  user: mongoose.Types.ObjectId | null;
  type: string;
  message: string;
  channel: "realtime" | "email" | "sms" | "push" | "broadcast";
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    type: { type: String, required: true },
    message: { type: String, required: true },
    channel: {
      type: String,
      enum: ["realtime", "email", "sms", "push", "broadcast"],
      default: "realtime",
    },
    read: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

NotificationSchema.index({ user: 1, read: 1 });

export default mongoose.model<INotification>("Notification", NotificationSchema);
