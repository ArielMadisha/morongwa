import mongoose, { Schema, Document } from "mongoose";

export interface IWaConversationState extends Document {
  user: mongoose.Types.ObjectId;
  scope: string;
  step: string;
  payload?: Record<string, any>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WaConversationStateSchema = new Schema<IWaConversationState>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, unique: true },
    scope: { type: String, required: true, default: "wallet", index: true },
    step: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

WaConversationStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IWaConversationState>("WaConversationState", WaConversationStateSchema);
