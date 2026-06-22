import mongoose, { Schema, Document } from "mongoose";

export interface IAgentTransaction extends Document {
  agentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  amount: number;
  fee: number;
  reference: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgentTransactionSchema = new Schema<IAgentTransaction>(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    fee: { type: Number, default: 5, min: 0 },
    reference: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

AgentTransactionSchema.index({ agentId: 1, createdAt: -1 });
AgentTransactionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IAgentTransaction>("AgentTransaction", AgentTransactionSchema);

