// SupportTicket model for customer support
import mongoose, { Schema, Document } from "mongoose";

export interface ISupportTicket extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "closed" | "escalated";
  category: string;
  assignedTo?: mongoose.Types.ObjectId;
  assignedAt?: Date;
  escalatedAt?: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  messages: Array<{
    sender: mongoose.Types.ObjectId;
    message: string;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed", "escalated"],
      default: "open",
    },
    category: { type: String, required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    assignedAt: { type: Date },
    escalatedAt: { type: Date },
    resolvedAt: { type: Date },
    closedAt: { type: Date },
    messages: [
      {
        sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
        message: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

SupportTicketSchema.index({ status: 1, priority: -1 });
SupportTicketSchema.index({ assignedTo: 1 });

export default mongoose.model<ISupportTicket>("SupportTicket", SupportTicketSchema);
