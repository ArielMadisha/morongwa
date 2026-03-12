// Request money: User A requests R100 from User B; User B gets WhatsApp/SMS, can approve
import mongoose, { Schema, Document } from "mongoose";

export interface IMoneyRequest extends Document {
  fromUser: mongoose.Types.ObjectId;   // Requester (who wants to receive)
  toUser: mongoose.Types.ObjectId;     // Payee (who will send the money)
  amount: number;
  message?: string;
  status: "pending" | "paid" | "declined" | "expired";
  notifyChannel?: "sms" | "whatsapp" | "both";
  paidAt?: Date;
  declinedAt?: Date;
  expiresAt: Date;
  reference?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MoneyRequestSchema = new Schema<IMoneyRequest>(
  {
    fromUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    toUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, min: 0.01 },
    message: { type: String },
    status: { type: String, enum: ["pending", "paid", "declined", "expired"], default: "pending" },
    notifyChannel: { type: String, enum: ["sms", "whatsapp", "both"], default: "whatsapp" },
    paidAt: { type: Date },
    declinedAt: { type: Date },
    expiresAt: { type: Date, required: true },
    reference: { type: String },
  },
  { timestamps: true }
);

MoneyRequestSchema.index({ toUser: 1, status: 1 });
MoneyRequestSchema.index({ fromUser: 1, status: 1 });

export default mongoose.model<IMoneyRequest>("MoneyRequest", MoneyRequestSchema);
