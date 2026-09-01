import mongoose, { Schema, Document } from "mongoose";

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  qty: number;
  price: number;
  resellerId?: mongoose.Types.ObjectId;
  selectedColor?: string;
  selectedSize?: string;
  commissionPct?: number;
  commissionValue?: number;
  /** Per-unit food platform service fee included in `price` (not paid to restaurant). */
  foodServiceFeeZar?: number;
}

export interface IOrderMusicItem {
  songId: mongoose.Types.ObjectId;
  qty: number;
  price: number;
}

export interface IOrderAmounts {
  subtotal: number;
  shipping: number;
  commissionTotal: number;
  platformFee?: number; // deprecated, kept for backward compat
  total: number;
  currency: string;
  /** Per-supplier shipping for invoice (when multiple suppliers) */
  shippingBreakdown?: Array<{
    storeName: string;
    shippingCost: number;
    providerName?: string;
    serviceLabel?: string;
    courierTariffId?: string;
    originCountryCode?: string;
  }>;
  /** True when delivery/shipping was charged in the same checkout payment as products */
  deliveryPrepaid?: boolean;
  /** How delivery was collected — checkout is the only supported path for buyers */
  deliveryCollectionPolicy?: "checkout_single_payment";
}

/** Buyer-facing payment breakdown for wallet/invoice */
export interface IOrderPaymentBreakdown {
  items: Array<{ title: string; price: number; qty: number }>;
  shippingBreakdown: Array<{ storeName: string; shippingCost: number }>;
}

export interface IOrderDelivery {
  method?: "runner" | "courier" | "collection";
  address?: string;
  /** ISO country code for courier routing (e.g. "ZA", "US") */
  countryCode?: string;
  trackingNo?: string;
  /** Tracking URL from supplier (CJ/Spocket/EPROLO) */
  trackingUrl?: string;
  /** Carrier name (e.g. "DHL", "Aramex") */
  carrier?: string;
  courierTariffId?: string;
  /** Cross-border leg tariff when cart mixes SA + foreign storefronts */
  crossborderCourierTariffId?: string;
  courierProviderId?: string;
  serviceLabel?: string;
  /** ZAR amount for selected courier tariff at checkout (local leg) */
  courierPriceZar?: number;
  estimatedDeliveryDaysMin?: number;
  estimatedDeliveryDaysMax?: number;
  /** Set when payment completes — courier choice is locked */
  courierFinalizedAt?: Date;
}

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export interface IOrder extends Document {
  buyerId: mongoose.Types.ObjectId;
  supplierId?: mongoose.Types.ObjectId; // first product's supplier for simplicity
  /** Supplier's order ID (CJ/Spocket/EPROLO) when fulfilled externally */
  externalOrderId?: string;
  /** Reference to ExternalSupplier when order is fulfilled by CJ/Spocket/EPROLO */
  externalSupplierId?: mongoose.Types.ObjectId;
  status: OrderStatus;
  items: IOrderItem[];
  /** Music items included in same checkout (for card payment webhook) */
  musicItems?: IOrderMusicItem[];
  amounts: IOrderAmounts;
  /** Stored breakdown for wallet transaction list and invoice */
  paymentBreakdown?: IOrderPaymentBreakdown;
  delivery: IOrderDelivery;
  paymentMethod: "wallet" | "card" | "eft" | "orange_money";
  paymentReference?: string;
  paidAt?: Date;
  /**
   * Food/grocery pickup: merchant WhatsApp + Expo push + in-app alerts (idempotent on settle retries).
   * Keyed by supplierId string. SMS only as last-resort when WhatsApp is undelivered (e.g. Meta template pending).
   */
  foodMerchantAlerts?: Record<
    string,
    {
      waSid?: string;
      phone?: string;
      notifiedAt?: Date;
      smsSid?: string;
      provider?: string;
      error?: string;
      /** Twilio delivery status after poll (delivered / undelivered / sent / …). */
      deliveryStatus?: string;
      pushTicketId?: string;
      pushNotifiedAt?: Date;
      pushError?: string;
      inAppNotificationId?: string;
      inAppNotifiedAt?: Date;
    }
  >;
  /**
   * Per-supplier kitchen/shop prep status for QwertyHub Shop Orders inbox.
   * Keyed by supplierId string.
   */
  shopPrepBySupplier?: Record<
    string,
    {
      status: "new" | "preparing" | "ready" | "collected";
      updatedAt?: Date;
      seenAt?: Date;
    }
  >;
  createdAt: Date;
  updatedAt: Date;
}

const OrderMusicItemSchema = new Schema(
  { songId: { type: Schema.Types.ObjectId, ref: "Song", required: true }, qty: { type: Number, required: true, min: 1 }, price: { type: Number, required: true } },
  { _id: false }
);

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    resellerId: { type: Schema.Types.ObjectId, ref: "User" },
    selectedColor: { type: String, trim: true },
    selectedSize: { type: String, trim: true },
    commissionPct: { type: Number },
    commissionValue: { type: Number },
    foodServiceFeeZar: { type: Number },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    externalOrderId: { type: String },
    externalSupplierId: { type: Schema.Types.ObjectId, ref: "ExternalSupplier" },
    status: {
      type: String,
      enum: ["pending_payment", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"],
      default: "pending_payment",
    },
    items: { type: [OrderItemSchema], required: true },
    musicItems: { type: [OrderMusicItemSchema], default: [] },
    amounts: {
      subtotal: { type: Number, required: true },
      shipping: { type: Number, default: 0 },
      commissionTotal: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      total: { type: Number, required: true },
      currency: { type: String, default: "ZAR" },
      shippingBreakdown: [{
        storeName: String,
        shippingCost: Number,
        providerName: String,
        serviceLabel: String,
        courierTariffId: String,
        originCountryCode: String,
      }],
      deliveryPrepaid: { type: Boolean },
      deliveryCollectionPolicy: { type: String },
    },
    paymentBreakdown: {
      items: [{ title: String, price: Number, qty: Number }],
      shippingBreakdown: [{
        storeName: String,
        shippingCost: Number,
        providerName: String,
        serviceLabel: String,
        courierTariffId: String,
        originCountryCode: String,
      }],
    },
    delivery: {
      method: { type: String, enum: ["runner", "courier", "collection"] },
      address: { type: String },
      countryCode: { type: String },
      trackingNo: { type: String },
      trackingUrl: { type: String },
      carrier: { type: String },
      courierTariffId: { type: String },
      crossborderCourierTariffId: { type: String },
      courierProviderId: { type: String },
      serviceLabel: { type: String },
      courierPriceZar: { type: Number },
      estimatedDeliveryDaysMin: { type: Number },
      estimatedDeliveryDaysMax: { type: Number },
      courierFinalizedAt: { type: Date },
    },
    paymentMethod: { type: String, enum: ["wallet", "card", "eft", "orange_money"], required: true },
    paymentReference: { type: String },
    paidAt: { type: Date },
    foodMerchantAlerts: { type: Schema.Types.Mixed, default: undefined },
    shopPrepBySupplier: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

OrderSchema.index({ buyerId: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ paymentReference: 1 });

export default mongoose.model<IOrder>("Order", OrderSchema);
