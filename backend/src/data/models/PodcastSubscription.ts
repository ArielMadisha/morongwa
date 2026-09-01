import mongoose, { Schema, Document } from "mongoose";

/** Listener follows a show and is notified when new episodes publish. */
export interface IPodcastSubscription extends Document {
  podcastId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  notify: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PodcastSubscriptionSchema = new Schema<IPodcastSubscription>(
  {
    podcastId: { type: Schema.Types.ObjectId, ref: "Podcast", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    notify: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PodcastSubscriptionSchema.index({ podcastId: 1, userId: 1 }, { unique: true });
PodcastSubscriptionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IPodcastSubscription>("PodcastSubscription", PodcastSubscriptionSchema);
