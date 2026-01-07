// Message model for chat between clients and runners
import mongoose, { Schema, Document } from "mongoose";

export interface IMessage extends Document {
  task: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  content: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true }
);

MessageSchema.index({ task: 1, createdAt: 1 });
MessageSchema.index({ task: 1, read: 1 });
MessageSchema.index({ receiver: 1, read: 1 });

MessageSchema.set("toJSON", {
  transform: (_doc: any, ret: any) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model<IMessage>("Message", MessageSchema);
