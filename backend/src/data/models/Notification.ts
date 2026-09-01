// Notification model for user alerts
import mongoose, { Schema, Document } from "mongoose";

/** Optional deep-link / shop-order context (Activity → Shop Orders). */
export type NotificationMeta = {
  orderId?: string;
  supplierId?: string;
  orderNumber?: string;
  storeName?: string;
  fulfilment?: string;
  url?: string;
  itemSummary?: string;
  [key: string]: unknown;
};

export interface INotification extends Document {
  user: mongoose.Types.ObjectId | null;
  type: string;
  message: string;
  channel: "realtime" | "email" | "sms" | "whatsapp" | "push" | "broadcast";
  read: boolean;
  readAt?: Date;
  /** Structured payload for shop-order / deep-link notifications. */
  meta?: NotificationMeta;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    type: { type: String, required: true },
    message: { type: String, required: true },
    channel: {
      type: String,
      enum: ["realtime", "email", "sms", "whatsapp", "push", "broadcast"],
      default: "realtime",
    },
    read: { type: Boolean, default: false },
    readAt: { type: Date },
    meta: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

NotificationSchema.index({ user: 1, read: 1 });
NotificationSchema.index({ user: 1, type: 1, "meta.orderId": 1, "meta.supplierId": 1 });

export default mongoose.model<INotification>("Notification", NotificationSchema);
