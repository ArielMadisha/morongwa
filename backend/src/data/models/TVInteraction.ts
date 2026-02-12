import mongoose, { Schema, Document } from "mongoose";

export type TVInteractionType = "like" | "share" | "repost";

export interface ITVInteraction extends Document {
  postId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: TVInteractionType;
  /** For repost: the new post ID created */
  repostId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const TVInteractionSchema = new Schema<ITVInteraction>(
  {
    postId: { type: Schema.Types.ObjectId, ref: "TVPost", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["like", "share", "repost"], required: true },
    repostId: { type: Schema.Types.ObjectId, ref: "TVPost" },
  },
  { timestamps: { createdAt: true } }
);

TVInteractionSchema.index({ postId: 1, userId: 1, type: 1 }, { unique: true });
TVInteractionSchema.index({ userId: 1 });

export default mongoose.model<ITVInteraction>("TVInteraction", TVInteractionSchema);
