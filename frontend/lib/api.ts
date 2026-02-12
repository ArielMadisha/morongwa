// API client configuration with axios
import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

/** Backend base URL (no /api) - used for image URLs. */
export const API_BASE = API_URL.replace(/\/api\/?$/, '').replace(/\/$/, '');

/** Normalize product image URL - fix /api/uploads, handle relative paths, ensure absolute URL. */
export function getImageUrl(url: string | undefined): string {
  if (!url || typeof url !== 'string') return '';
  let normalized = url.replace(/\/api\/uploads\//g, '/uploads/');
  if (normalized.startsWith('/uploads/') && !normalized.startsWith('http')) {
    normalized = `${API_BASE}${normalized}`;
  }
  return normalized;
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token and fix FormData uploads
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    // Let the browser set Content-Type with boundary for FormData (fixes 400 on image uploads)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// API endpoints
export const authAPI = {
  register: (data: { name: string; email: string; password: string; role: string[] }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  getCurrentUser: () => api.get('/auth/me'),
};

export const tasksAPI = {
  getAll: (params?: any) => api.get('/tasks', { params }),
  getAvailable: () => api.get('/tasks/available'),
  getMyTasks: () => api.get('/tasks/my-tasks'),
  getMyAcceptedTasks: () => api.get('/tasks/my-accepted'),
  getById: (id: string) => api.get(`/tasks/${id}`),
  getEscrow: (id: string) => api.get(`/tasks/${id}/escrow`),
  create: (data: any) => api.post('/tasks', data),
  accept: (id: string) => api.post(`/tasks/${id}/accept`),
  startTask: (id: string) => api.post(`/tasks/${id}/start`),
  checkArrival: (id: string, coords: { lat: number; lon: number }) => 
    api.post(`/tasks/${id}/check-arrival`, coords),
  start: (id: string) => api.post(`/tasks/${id}/start`),
  complete: (id: string) => api.post(`/tasks/${id}/complete`),
  cancel: (id: string) => api.post(`/tasks/${id}/cancel`),
};

export const walletAPI = {
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: (params?: any) => api.get('/wallet/transactions', { params }),
  topUp: (amount: number) => api.post('/wallet/topup', { amount }),
  withdraw: (amount: number) => api.post('/wallet/withdraw', { amount }),
};

export const paymentsAPI = {
  initiate: (amount: number) => api.post('/payments/initiate', { amount }),
  getStatus: (reference: string) => api.get(`/payments/${reference}`),
  getAll: () => api.get('/payments'),
  getHistory: () => api.get('/payments/history'),
};

export const reviewsAPI = {
  create: (data: { task: string; runner?: string; rating: number; comment: string }) =>
    api.post('/reviews', data),
  getByUser: (userId: string, params?: any) =>
    api.get(`/reviews/user/${userId}`, { params }),
  getByTask: (taskId: string) => api.get(`/reviews/task/${taskId}`),
};

export const messengerAPI = {
  getConversations: () => api.get('/messenger/conversations'),
  getMessages: (taskId: string) => api.get(`/messenger/task/${taskId}`),
  sendMessage: (taskId: string, content: string) =>
    api.post(`/messenger/task/${taskId}`, { content }),
  markAsRead: (taskId: string) => api.post(`/messenger/task/${taskId}/read`),
  getUnreadCount: () => api.get('/messenger/unread'),
};

export const notificationsAPI = {
  getAll: (params?: any) => api.get('/notifications', { params }),
  markAsRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread/count'),
};

export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getAllUsers: (params?: any) => api.get('/admin/users', { params }),
  getUsers: (params?: any) => api.get('/admin/users', { params }),
  suspendUser: (id: string, reason?: string) =>
    api.post(`/admin/users/${id}/suspend`, { reason }),
  activateUser: (id: string) => api.post(`/admin/users/${id}/activate`),
  getTasks: (params?: any) => api.get('/admin/tasks', { params }),
  cancelTask: (id: string, reason?: string) =>
    api.post(`/admin/tasks/${id}/cancel`, { reason }),
  getPayouts: () => api.get('/admin/payouts'),
  getPendingPayouts: () => api.get('/admin/payouts/pending'),
  approvePayout: (id: string) => api.post(`/admin/payouts/${id}/approve`),
  rejectPayout: (id: string, reason?: string) =>
    api.post(`/admin/payouts/${id}/reject`, { reason }),

  // Escrow & ledger
  getEscrows: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/escrows', { params }),
  getEscrow: (id: string) => api.get(`/admin/escrows/${id}`),
  releaseEscrow: (id: string) => api.post(`/admin/escrows/${id}/release`),
  refundEscrow: (id: string, reason: string) =>
    api.post(`/admin/escrows/${id}/refund`, { reason }),
  initiateEscrowPayout: (id: string) => api.post(`/admin/escrows/${id}/initiate-payout`),
  pollEscrowPayout: (id: string) => api.post(`/admin/escrows/${id}/poll-payout`),

  // FNB
  getFnbBalance: () => api.get('/admin/fnb/balance'),

  // Audit
  getAuditLogs: (params?: { page?: number; limit?: number; action?: string }) =>
    api.get('/admin/audit', { params }),

  // Suppliers (marketplace)
  getSuppliers: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/suppliers', { params }),
  getSupplier: (id: string) => api.get(`/admin/suppliers/${id}`),
  approveSupplier: (id: string) => api.post(`/admin/suppliers/${id}/approve`),
  rejectSupplier: (id: string, reason?: string) =>
    api.post(`/admin/suppliers/${id}/reject`, { reason }),

  // Marketplace orders (checkout)
  getOrders: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/orders', { params }),

  // Reseller stats
  getResellerStats: () => api.get('/admin/reseller-stats'),

  // Stores
  getStores: (params?: { page?: number; limit?: number; type?: string }) =>
    api.get('/admin/stores', { params }),
  createStore: (data: { userId: string; name: string; type: 'supplier' | 'reseller' }) =>
    api.post('/admin/stores', data),
  getStore: (id: string) => api.get(`/admin/stores/${id}`),
  updateStore: (id: string, data: { name?: string }) => api.put(`/admin/stores/${id}`, data),

  // Products (admin load products for marketplace)
  getProducts: (params?: { page?: number; limit?: number; supplierId?: string; active?: boolean }) =>
    api.get('/admin/products', { params }),
  uploadProductImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('images', f));
    return api.post<{ urls: string[] }>('/admin/products/upload-images', formData);
  },
  createProduct: (data: {
    supplierId: string;
    title: string;
    slug?: string;
    description?: string;
    images: string[];
    price: number;
    currency?: string;
    stock?: number;
    sku?: string;
    sizes?: string[];
    allowResell?: boolean;
    categories?: string[];
    tags?: string[];
  }) => api.post('/admin/products', data),
  getProduct: (id: string) => api.get(`/admin/products/${id}`),
  updateProduct: (id: string, data: Record<string, unknown>) => api.put(`/admin/products/${id}`, data),
  deleteProduct: (id: string) => api.delete(`/admin/products/${id}`),
};

export const supportAPI = {
  create: (data: { title: string; description: string; category: string; priority?: string }) =>
    api.post('/support', data),
  getMyTickets: (params?: any) => api.get('/support/my-tickets', { params }),
  getById: (id: string) => api.get(`/support/${id}`),
  addMessage: (id: string, message: string) =>
    api.post(`/support/${id}/messages`, { message }),
};

export const analyticsAPI = {
  getKPIs: (params?: any) => api.get('/analytics/kpis', { params }),
  getTaskTrends: (days?: number) => api.get('/analytics/trends/tasks', { params: { days } }),
  getRevenueTrends: (days?: number) => api.get('/analytics/trends/revenue', { params: { days } }),
  getRunnerPerformance: (runnerId: string) => api.get(`/analytics/runner/${runnerId}`),
};

export const usersAPI = {
  getProfile: (id: string) => api.get(`/users/${id}`),
  updateProfile: (id: string, data: { name: string }) =>
    api.put(`/users/${id}`, data),
  uploadAvatar: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.post(`/users/${id}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  addRole: (id: string, role: 'client' | 'runner') =>
    api.post(`/users/${id}/roles`, { action: 'add', role }),
  removeRole: (id: string, role: 'client' | 'runner') =>
    api.post(`/users/${id}/roles`, { action: 'remove', role }),
};

export const policiesAPI = {
  listPublished: () => api.get('/policies'),
  getPublished: (slug: string) => api.get(`/policies/${slug}`),
  listVersions: (slug: string) => api.get(`/policies/${slug}/versions`),
  createVersion: (slug: string, data: { title?: string; summary?: string; content: string; publish?: boolean }) =>
    api.post(`/policies/${slug}/version`, data),
  publishVersion: (slug: string, version: number) => api.post(`/policies/${slug}/publish`, { version }),
  acceptPolicies: (slugs: string[], meta?: any) => api.post('/policies/accept', { slugs, meta }),
};

export const productsAPI = {
  list: (params?: { limit?: number; random?: boolean }) =>
    api.get('/products', { params: { ...params, random: params?.random ? '1' : undefined } }),
  getByIdOrSlug: (idOrSlug: string) => api.get(`/products/${idOrSlug}`),
  /** Upload 1–5 product images. Returns { urls: string[] }. */
  uploadImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('images', f));
    return api.post<{ urls: string[] }>('/products/upload-images', formData);
  },
  create: (data: {
    title: string;
    description?: string;
    images: string[];
    price: number;
    currency?: string;
    stock?: number;
    sku?: string;
    sizes?: string[];
    allowResell?: boolean;
    categories?: string[];
    tags?: string[];
  }) => api.post('/products', data),
};

export const cartAPI = {
  get: () => api.get('/cart'),
  add: (productId: string, qty?: number, resellerId?: string) =>
    api.post('/cart', { productId, qty: qty ?? 1, resellerId }),
  updateItem: (productId: string, qty: number) =>
    api.put(`/cart/item/${productId}`, { qty }),
  removeItem: (productId: string) => api.delete(`/cart/item/${productId}`),
};

export const checkoutAPI = {
  quote: () => api.post('/checkout/quote'),
  pay: (paymentMethod: 'wallet' | 'card', deliveryAddress?: string) =>
    api.post('/checkout/pay', { paymentMethod, deliveryAddress }),
  getOrder: (orderId: string) => api.get(`/checkout/order/${orderId}`),
};

export const resellerAPI = {
  getWall: (userId: string) => api.get(`/reseller/wall/${userId}`),
  getMyWall: () => api.get('/reseller/wall/me'),
  addToWall: (productId: string, resellerCommissionPct?: number) =>
    api.post(`/reseller/wall/add/${productId}`, { resellerCommissionPct }),
  removeFromWall: (productId: string) => api.delete(`/reseller/wall/remove/${productId}`),
};

export const storesAPI = {
  getMyStores: () => api.get('/stores/me'),
  renameStore: (id: string, name: string) => api.put(`/stores/${id}`, { name }),
  getBySlug: (slug: string) => api.get(`/stores/by-slug/${slug}`),
};

export const suppliersAPI = {
  uploadDocument: (file: File) => {
    const formData = new FormData();
    formData.append('document', file);
    return api.post<{ success: boolean; path: string; fullUrl: string }>('/suppliers/upload-document', formData);
  },
  apply: (data: {
    type: 'company' | 'individual';
    storeName?: string;
    pickupAddress?: string;
    companyRegNo?: string;
    directorsIdDoc?: string;
    idDocument?: string;
    contactEmail: string;
    contactPhone: string;
    verificationFeeWaived?: boolean;
  }) => api.post('/suppliers/apply', data),
  getMe: () => api.get('/suppliers/me'),
};
