// Task model with lifecycle states and escrow handling
import mongoose, { Schema, Document } from "mongoose";

export interface ITask extends Document {
  title: string;
  description: string;
  budget: number;
  location: {
    type: string;
    coordinates: number[];
  };
  status: "posted" | "accepted" | "completed" | "cancelled";
  client: mongoose.Types.ObjectId;
  runner?: mongoose.Types.ObjectId;
  escrowed: boolean;
  attachments: Array<{
    filename: string;
    path: string;
    mimetype: string;
    size: number;
    uploadedAt: Date;
  }>;
  acceptedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    budget: { type: Number, required: true, min: 0 },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },
    status: {
      type: String,
      enum: ["posted", "accepted", "completed", "cancelled"],
      default: "posted",
    },
    client: { type: Schema.Types.ObjectId, ref: "User", required: true },
    runner: { type: Schema.Types.ObjectId, ref: "User" },
    escrowed: { type: Boolean, default: false },
    attachments: [
      {
        filename: String,
        path: String,
        mimetype: String,
        size: Number,
        uploadedAt: Date,
      },
    ],
    acceptedAt: { type: Date },
    completedAt: { type: Date },
    // Whether the client has confirmed delivery/closure at the destination
    closedAtDestination: { type: Boolean, default: false },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

TaskSchema.index({ location: "2dsphere" });
TaskSchema.index({ status: 1, createdAt: -1 });
TaskSchema.index({ client: 1 });
TaskSchema.index({ runner: 1 });

export default mongoose.model<ITask>("Task", TaskSchema);
