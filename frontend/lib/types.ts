// TypeScript types for the application
export interface User {
  _id: string;
  id?: string;
  name: string;
  email: string;
  username?: string;
  phone?: string;
  /** GeoJSON Point from last runner location update [lng, lat] */
  location?: { type?: string; coordinates?: number[]; updatedAt?: string };
  /** ISO 3166-1 alpha-2 from phone */
  countryCode?: string;
  /** ISO 4217 — derived from phone + platform rules */
  preferredCurrency?: string;
  // Roles assigned to the user (always an array)
  role: Array<'client' | 'runner' | 'admin' | 'superadmin'>;
  avatar?: string;
  rating?: number;
  isVerified?: boolean;
  active?: boolean;
  suspended?: boolean;
  createdAt?: string;
  /** Runner: Professional Driving Permit */
  pdp?: { filename: string; path: string; uploadedAt: string; verified?: boolean } | null;
  /** Runner: registered vehicles */
  vehicles?: Array<{
    make?: string;
    model?: string;
    plate?: string;
    documents: Array<{ filename: string; path: string; uploadedAt: string }>;
    verified?: boolean;
  }>;
  /** Runner: admin has verified category-specific documents */
  runnerVerified?: boolean;
  /** courier = inter-city transport; store_parcel = wholesale / parcel pickup */
  runnerCategory?: 'courier' | 'store_parcel';
  /** Store/parcel runner: ID or passport */
  runnerIdDocument?: { filename: string; path: string; uploadedAt: string; verified?: boolean } | null;
  /** Store/parcel runner: proof of residence */
  runnerProofOfResidence?: { filename: string; path: string; uploadedAt: string; verified?: boolean } | null;
  runnerServiceCountry?: string;
  runnerServiceCity?: string;
  /** Feed content preferences */
  contentPreferences?: {
    showProducts?: boolean;
    preferencesAskedAt?: string;
    preferencesSetAt?: string;
  };
}

export interface Task {
  _id: string;
  /** Client dashboard + WhatsApp errands; legacy WhatsApp values included */
  taskType?:
    | 'collect_send'
    | 'shop_send'
    | 'transport'
    | 'general'
    | 'cross_border_collection'
    | 'shop_and_send'
    | 'large_transport'
    | string;
  title: string;
  description: string;
  category: string;
  workflowMeta?: Record<string, any>;
  budget: number;
  // Location can be a simple string or a GeoJSON-like object with an address
  // e.g. { type: 'Point', coordinates: [lng, lat], address: '123 Main St' }
  location: string | { type?: string; coordinates?: number[]; address?: string };
  pickupLocation?: { type?: string; coordinates?: number[]; address?: string };
  deliveryLocation?: { type?: string; coordinates?: number[]; address?: string };
  estimatedDistanceKm?: number;
  suggestedFee?: number;
  parcelDetails?: {
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    weightKg?: number;
    volumetricWeightKg?: number;
    chargeableWeightKg?: number;
  };
  supplierInvoice?: {
    filename: string;
    path: string;
    mimetype: string;
    size: number;
    uploadedAt: string;
  } | null;
  status: 'pending_quote' | 'pending' | 'posted' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  client: User;
  runner?: User;
  review?: any;
  escrowed: boolean;
  attachments?: Array<{
    filename: string;
    path: string;
    mimetype: string;
    size: number;
    uploadedAt: string;
  }>;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  closedAtDestination?: boolean;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Wallet {
  _id: string;
  user: string;
  balance: number;
  pendingBalance: number;
  transactions: Array<{
    type: 'topup' | 'payout' | 'escrow' | 'refund' | 'credit' | 'debit';
    amount: number;
    reference?: string;
    createdAt: string;
  }>;
}

export interface Payment {
  _id: string;
  from?: User;
  to?: User;
  task?: Task;
  amount: number;
  type: string;
  reference?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'disputed';
  createdAt: string;
}

export interface Review {
  _id: string;
  task: string | Task;
  reviewer: string | User;
  reviewee: string | User;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface Message {
  _id: string;
  task: string;
  sender: User | string;
  receiver: User | string;
  content: string;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

export interface Notification {
  _id: string;
  user: string | null;
  type: string;
  message: string;
  channel: 'realtime' | 'email' | 'sms' | 'push' | 'broadcast';
  read: boolean;
  readAt?: string;
  createdAt: string;
}

export interface SupportTicket {
  _id: string;
  user: User | string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated';
  category: string;
  messages: Array<{
    sender: User | string;
    message: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTasks: number;
  completedTasks: number;
  pendingPayments: number;
  totalRevenue: number;
}

export interface ProductColorOption {
  name: string;
  hex: string;
  imageIndex: number;
}

export interface Product {
  _id: string;
  supplierId: { _id: string; storeName?: string } | string;
  title: string;
  slug: string;
  description?: string;
  images: string[];
  price: number;
  /** Discount/sale price. When set, customers pay this instead of price. */
  discountPrice?: number;
  /** Bulk sale tiers: quantity range → price per unit. */
  bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
  currency: string;
  stock: number;
  outOfStock?: boolean;
  sizes?: string[];
  colors?: ProductColorOption[];
  categories: string[];
  tags: string[];
  /** Countries where this product is available (e.g. ["South Africa", "Botswana"]). Empty = no restriction. */
  availableCountries?: string[];
  ratingAvg?: number;
  ratingCount?: number;
}
