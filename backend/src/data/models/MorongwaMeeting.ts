import mongoose, { Schema, Document } from "mongoose";

export interface IMorongwaMeeting extends Document {
  hostId: mongoose.Types.ObjectId;
  meetingId: string;
  title: string;
  passcode?: string;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  roomId: string;
  kind: "instant" | "scheduled";
  createdAt: Date;
  updatedAt: Date;
}

const MorongwaMeetingSchema = new Schema<IMorongwaMeeting>(
  {
    hostId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    meetingId: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: "Morongwa meeting", trim: true },
    passcode: { type: String, trim: true },
    scheduledStart: { type: Date },
    scheduledEnd: { type: Date },
    roomId: { type: String, required: true, index: true },
    kind: { type: String, enum: ["instant", "scheduled"], default: "instant" },
  },
  { timestamps: true }
);

MorongwaMeetingSchema.index({ hostId: 1, scheduledStart: 1 });

export default mongoose.model<IMorongwaMeeting>("MorongwaMeeting", MorongwaMeetingSchema);
