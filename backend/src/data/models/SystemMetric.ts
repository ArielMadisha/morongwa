// SystemMetric model for monitoring and observability
import mongoose, { Schema, Document } from "mongoose";

export interface ISystemMetric extends Document {
  timestamp: Date;
  requests: number;
  errorCount: number;
  avgResponseTime: number;
  errorRate: number;
}

const SystemMetricSchema = new Schema<ISystemMetric>({
  timestamp: { type: Date, required: true, default: Date.now },
  requests: { type: Number, required: true },
  errorCount: { type: Number, required: true },
  avgResponseTime: { type: Number, required: true },
  errorRate: { type: Number, required: true },
});

SystemMetricSchema.index({ timestamp: -1 });

export default mongoose.model<ISystemMetric>("SystemMetric", SystemMetricSchema);
