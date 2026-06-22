import mongoose, { Schema, Document } from "mongoose";

export type CourierShipmentStatus =
  | "pending"
  | "booked"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned"
  | "cancelled";

export type CourierDisputeStatus = "none" | "open" | "investigating" | "resolved" | "closed";

export interface ICourierShipment extends Document {
  orderId: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  providerId?: mongoose.Types.ObjectId;
  providerName: string;
  tariffId?: mongoose.Types.ObjectId;
  serviceLabel?: string;
  destinationCountry: string;
  deliveryAddress?: string;
  weightKg?: number;
  priceCharged: number;
  currency: string;
  /** Buyer already paid this delivery fee at checkout — admin must not collect again */
  deliveryPrepaid: boolean;
  status: CourierShipmentStatus;
  trackingNumber?: string;
  trackingUrl?: string;
  carrierNotes?: string;
  statusHistory: Array<{ status: string; note?: string; at: Date; byAdminId?: mongoose.Types.ObjectId }>;
  disputeStatus: CourierDisputeStatus;
  disputeReason?: string;
  disputeOpenedAt?: Date;
  disputeResolution?: string;
  disputeResolvedAt?: Date;
  disputeHandledBy?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const CourierShipmentSchema = new Schema<ICourierShipment>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    providerId: { type: Schema.Types.ObjectId, ref: "CourierProvider" },
    providerName: { type: String, required: true },
    tariffId: { type: Schema.Types.ObjectId, ref: "CourierTariff" },
    serviceLabel: { type: String },
    destinationCountry: { type: String, required: true },
    deliveryAddress: { type: String },
    weightKg: { type: Number },
    priceCharged: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "ZAR" },
    deliveryPrepaid: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["pending", "booked", "in_transit", "out_for_delivery", "delivered", "failed", "returned", "cancelled"],
      default: "pending",
    },
    trackingNumber: { type: String },
    trackingUrl: { type: String },
    carrierNotes: { type: String },
    statusHistory: [
      {
        status: { type: String, required: true },
        note: { type: String },
        at: { type: Date, default: Date.now },
        byAdminId: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],
    disputeStatus: {
      type: String,
      enum: ["none", "open", "investigating", "resolved", "closed"],
      default: "none",
    },
    disputeReason: { type: String },
    disputeOpenedAt: { type: Date },
    disputeResolution: { type: String },
    disputeResolvedAt: { type: Date },
    disputeHandledBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

CourierShipmentSchema.index({ buyerId: 1, createdAt: -1 });
CourierShipmentSchema.index({ status: 1 });
CourierShipmentSchema.index({ disputeStatus: 1 });

export default mongoose.model<ICourierShipment>("CourierShipment", CourierShipmentSchema);
