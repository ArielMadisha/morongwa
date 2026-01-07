// Setting model for platform configuration
import mongoose, { Schema, Document } from "mongoose";

export interface ISetting extends Document {
  key: string;
  value: any;
  description?: string;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SettingSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model<ISetting>("Setting", SettingSchema);
