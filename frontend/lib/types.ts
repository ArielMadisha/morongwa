// TypeScript types for the application
export interface User {
  _id: string;
  id?: string;
  name: string;
  email: string;
  // Roles assigned to the user (always an array)
  role: Array<'client' | 'runner' | 'admin' | 'superadmin'>;
  avatar?: string;
  rating: number;
  isVerified: boolean;
  active: boolean;
  suspended: boolean;
  createdAt: string;
}

export interface Task {
  _id: string;
  title: string;
  description: string;
  category: string;
  budget: number;
  // Location can be a simple string or a GeoJSON-like object with an address
  // e.g. { type: 'Point', coordinates: [lng, lat], address: '123 Main St' }
  location: string | { type?: string; coordinates?: number[]; address?: string };
  pickupLocation?: { type?: string; coordinates?: number[]; address?: string };
  deliveryLocation?: { type?: string; coordinates?: number[]; address?: string };
  estimatedDistanceKm?: number;
  suggestedFee?: number;
  status: 'pending' | 'posted' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
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
