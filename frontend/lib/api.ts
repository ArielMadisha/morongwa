// API client configuration with axios
import axios from 'axios';
import { PROD_API_URL, PROD_API_BASE, isProdQwertymatesHostname } from '@/lib/productionConfig';

function resolveApiUrl(): string {
  const envUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (isProdQwertymatesHostname(host)) return PROD_API_URL;
    return envUrl || 'http://localhost:4000/api';
  }
  // SSR / Node (Next pre-render): never default to localhost in production builds
  if (envUrl) return envUrl;
  if (process.env.NODE_ENV === 'production') return PROD_API_URL;
  return 'http://localhost:4000/api';
}

export const API_URL = resolveApiUrl();

/** Backend base URL (no /api) - used for image URLs and Socket.IO. */
export const API_BASE = API_URL.replace(/\/api\/?$/, '').replace(/\/$/, '');

/** Socket.IO server URL - same as API_BASE. */
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

/** Effective price for a product (discountPrice when set and valid, else price). */
export function getEffectivePrice(p: { price: number; discountPrice?: number }): number {
  if (p.discountPrice != null && p.discountPrice >= 0 && p.discountPrice < p.price) return p.discountPrice;
  return p.price;
}

/** Normalize product image URL - use /uploads/... so Next.js proxy serves same-origin (avoids CORS/cross-origin blocking). */
export function getImageUrl(url: string | undefined): string {
  if (!url || typeof url !== 'string') return '';
  let normalized = url.trim().replace(/\/api\/uploads\//g, '/uploads/');
  // Legacy absolute media URLs can still point to insecure IP hosts.
  // Normalize those to same-origin /uploads paths when possible.
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      const path = `${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}`;
      const uploadsPathMatch = path.match(/\/uploads\/.+$/);
      if (uploadsPathMatch) return uploadsPathMatch[0];
      const isInsecureIpHost = parsed.protocol === 'http:' && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname);
      if (isInsecureIpHost) {
        return `${PROD_API_BASE}${path}`;
      }
      // Keep external https URLs untouched.
      if (parsed.protocol === 'https:') return normalized;
      // Upgrade any remaining http URL to https to avoid mixed-content blocks.
      return normalized.replace(/^http:\/\//i, 'https://');
    } catch {
      // Fall through to existing normalization logic.
    }
  }
  // Ensure leading slash for relative paths (e.g. "uploads/tv/x" -> "/uploads/tv/x")
  if (normalized.startsWith('uploads/') && !normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  // Strip protocol/host so we always use same-origin proxy (e.g. http://localhost:4000/uploads/... -> /uploads/...)
  const uploadsMatch = normalized.match(/\/uploads\/.+$/);
  if (uploadsMatch) {
    const uploadsPath = uploadsMatch[0];
    if (typeof window !== 'undefined' && isProdQwertymatesHostname(window.location.hostname)) {
      return `${PROD_API_BASE}${uploadsPath}`;
    }
    return uploadsPath;
  }
  if (normalized.startsWith('/uploads/')) {
    if (typeof window !== 'undefined' && isProdQwertymatesHostname(window.location.hostname)) {
      return `${PROD_API_BASE}${normalized}`;
    }
    return normalized;
  }
  // Bare filename (legacy data): tv-* -> /uploads/tv/, else -> /uploads/
  if (!normalized.includes('/') && !normalized.startsWith('http')) {
    const prefix = normalized.startsWith('tv-') ? '/uploads/tv/' : '/uploads/';
    const uploadsPath = prefix + normalized;
    if (typeof window !== 'undefined' && isProdQwertymatesHostname(window.location.hostname)) {
      return `${PROD_API_BASE}${uploadsPath}`;
    }
    return uploadsPath;
  }
  return normalized;
}

/** Full URL for images when relative path fails (e.g. cross-origin). */
export function getImageUrlFull(url: string | undefined): string {
  const path = getImageUrl(url);
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const base = API_BASE || (typeof window !== 'undefined' ? '' : 'http://localhost:4000');
  return base ? `${base.replace(/\/$/, '')}${path}` : path;
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  /** Prevents infinite hangs (e.g. bad proxy / API down) from blocking AuthProvider and pages. */
  timeout: 25_000,
});

const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);
const MAX_429_RETRIES = 2;

function parseRetryAfterMs(raw: unknown): number | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const at = Date.parse(value);
  if (!Number.isNaN(at)) {
    return Math.max(0, at - Date.now());
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  async (error) => {
    const status = Number(error?.response?.status || 0);
    const config = (error?.config || {}) as any;
    const method = String(config?.method || 'get').toLowerCase();
    const retryCount = Number(config?._retryCount || 0);
    const canRetry =
      status === 429 &&
      RETRYABLE_METHODS.has(method) &&
      retryCount < MAX_429_RETRIES &&
      !config?._skip429Retry;

    if (canRetry) {
      const retryAfterHeader = error?.response?.headers?.['retry-after'];
      const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
      const baseMs = 700 * Math.pow(2, retryCount);
      const jitterMs = Math.floor(Math.random() * 250);
      const waitMs = Math.min(Math.max(retryAfterMs ?? baseMs, 400) + jitterMs, 10_000);
      config._retryCount = retryCount + 1;
      await sleep(waitMs);
      return api.request(config);
    }

    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Only redirect if not already on login (avoid duplicate nav)
      if (!window.location.pathname.startsWith('/login')) {
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = returnTo ? `/login?returnTo=${returnTo}` : '/login';
      }
    }
    return Promise.reject(error);
  }
);

// API endpoints
export const authAPI = {
  register: (data: {
    name: string;
    email?: string;
    username?: string;
    password: string;
    role?: string[];
    dateOfBirth?: string;
    phone?: string;
    otpToken?: string;
  }) => api.post('/auth/register', data),
  sendOtp: (phone: string, channel?: 'sms' | 'whatsapp') =>
    api.post('/auth/send-otp', { phone, channel: channel || 'whatsapp' }),
  getOtpHealth: () =>
    api.get<{ data: { provider: string; configured: boolean; smsReady: boolean; whatsappReady: boolean; mode: string } }>('/auth/otp-health'),
  verifyOtp: (phone: string, otp: string) => api.post('/auth/verify-otp', { phone, otp }),
  login: (data: { email?: string; username?: string; phone?: string; password: string }) =>
    api.post('/auth/login', data),
  getCurrentUser: () => api.get('/auth/me'),
  requestRunnerRole: () => api.post('/auth/request-runner'),
};

export const passwordAPI = {
  forgot: (identifier: string, channel: "auto" | "email" | "sms" | "whatsapp" = "auto") =>
    api.post('/password/forgot', { identifier, channel }),
  reset: (token: string, newPassword: string) => api.post('/password/reset', { token, newPassword }),
};

export const advertsAPI = {
  getAdverts: (slot?: 'random' | 'promo') =>
    api.get('/adverts', { params: slot ? { slot } : {} }),
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
  topUp: (amount: number, returnPath?: string) => api.post('/wallet/topup', { amount, returnPath }),
  withdraw: (amount: number) => api.post('/wallet/payout', { amount }),
  donate: (amount: number, recipientId: string) => api.post('/wallet/donate', { amount, recipientId }),
  getQrPayload: () => api.get<{ payload: string; userId: string; displayName: string }>('/wallet/qr-payload'),
  paymentFromScan: (fromUserId: string, amount: number, merchantName?: string) =>
    api.post('/wallet/payment-from-scan', { fromUserId, amount, merchantName }),
  confirmPayment: (paymentRequestId: string, otp: string) =>
    api.post('/wallet/confirm-payment', { paymentRequestId, otp }),
  requestMoney: (params: { toUserId?: string; toUsername?: string; amount: number; message?: string; notifyChannel?: 'sms' | 'whatsapp' | 'both' }) =>
    api.post('/wallet/request-money', params),
  payRequest: (requestId: string) => api.post('/wallet/pay-request', { requestId }),
  getMoneyRequests: () => api.get('/wallet/money-requests'),
  // Stored cards (PayGate PayVault)
  addCard: () => api.post<{ paymentUrl: string; reference: string }>('/wallet/add-card'),
  getCards: () => api.get<Array<{ _id: string; last4: string; brand: string; expiryMonth: number; expiryYear: number; isDefault: boolean }>>('/wallet/cards'),
  deleteCard: (cardId: string) => api.delete(`/wallet/cards/${cardId}`),
  setDefaultCard: (cardId: string) => api.patch(`/wallet/cards/${cardId}/default`),
  payWithCard: (paymentRequestId: string, cardId: string) =>
    api.post<{ paymentUrl: string; reference: string }>('/wallet/pay-with-card', { paymentRequestId, cardId }),
  payPendingWithWallet: (paymentRequestId: string) =>
    api.post('/wallet/pay-pending-with-wallet', { paymentRequestId }),
  getPendingPayment: (id: string) =>
    api.get<{ _id: string; amount: number; merchantName: string; expiresAt: string }>(`/wallet/pending-payment/${id}`),
  // E-commerce checkout
  getCheckoutDetails: (params: { merchantId: string; amount: number; reference: string; name?: string }) =>
    api.get<{ merchantId: string; amount: number; reference: string; merchantName: string }>('/wallet/checkout/details', { params }),
  checkoutPay: (data: { merchantId: string; amount: number; reference: string; returnUrl: string; cancelUrl?: string; method: 'wallet' | 'card'; cardId?: string }) =>
    api.post<{ success: boolean; redirectUrl?: string; paymentUrl?: string }>('/wallet/checkout/pay', data),
  getCheckoutSession: (sessionId: string) =>
    api.get<{ status: string; returnUrl: string; reference: string; amount: number }>(`/wallet/checkout/session/${sessionId}`),
  // Merchant agents — cash deposit / withdrawal for users without bank access
  getMerchantAgentSettings: () =>
    api.get<{
      enabled: boolean;
      publicNote: string;
      applicationStatus: string;
      businessName: string;
      businessDescription: string;
      rejectionReason: string;
      appliedAt: string | null;
      reviewedAt: string | null;
      kycAttestedAt: string | null;
      isVerified: boolean;
      canApply: boolean;
      isApproved: boolean;
    }>('/wallet/merchant-agent/me'),
  applyMerchantAgent: (data: {
    businessName: string;
    businessDescription: string;
    publicNote?: string;
    kycAttestation: boolean;
  }) => api.post('/wallet/merchant-agent/apply', data),
  updateMerchantAgentSettings: (data: { enabled: boolean; publicNote?: string }) =>
    api.patch('/wallet/merchant-agent/me', data),
  searchMerchantAgents: (q?: string) =>
    api.get<Array<{ _id: string; name: string; username?: string; publicNote: string }>>('/wallet/merchant-agents', { params: { q } }),
  getMerchantAgentTx: (id: string) => api.get(`/wallet/merchant-agent/tx/${id}`),
  initiateAgentDeposit: (body: { customerUserId?: string; customerUsername?: string; amount: number }) =>
    api.post('/wallet/merchant-agent/deposit/initiate', body),
  approveAgentDeposit: (txId: string) => api.post('/wallet/merchant-agent/deposit/approve', { txId }),
  initiateAgentWithdrawal: (body: { agentId: string; amount: number }) =>
    api.post('/wallet/merchant-agent/withdrawal/initiate', body),
  confirmAgentHandover: (txId: string) => api.post('/wallet/merchant-agent/handover', { txId }),
  getMerchantAgentPending: () =>
    api.get<{
      asCustomer: any[];
      asAgent: any[];
    }>('/wallet/merchant-agent/pending'),
  getMerchantAgentHistory: (limit?: number) => api.get('/wallet/merchant-agent/history', { params: { limit } }),
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
  searchUsers: (q?: string, limit?: number) => api.get('/messenger/users/search', { params: { q, limit } }),
  getDirectMessages: (userId: string) => api.get(`/messenger/direct/${userId}`),
  sendDirectMessage: (userId: string, content: string) => api.post(`/messenger/direct/${userId}`, { content }),
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
  /** Money metrics for a date range (from/to ISO). Max 366 days. */
  getMoneyMetrics: (params: { from: string; to: string }) =>
    api.get('/admin/money-metrics', { params }),
  getAllUsers: (params?: any) => api.get('/admin/users', { params }),
  getUsers: (params?: any) => api.get('/admin/users', { params }),
  suspendUser: (id: string, reason?: string) =>
    api.post(`/admin/users/${id}/suspend`, { reason }),
  activateUser: (id: string) => api.post(`/admin/users/${id}/activate`),
  /** Super-admin only. Backend rejects users with orders/tasks/wallet/supplier/admin roles. */
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  verifyRunnerVehicle: (userId: string, vehicleIndex: number) =>
    api.post(`/admin/users/${userId}/vehicles/${vehicleIndex}/verify`),
  verifyRunnerPdp: (userId: string) => api.post(`/admin/users/${userId}/pdp/verify`),

  getMerchantAgentApplications: (params?: { status?: string }) =>
    api.get<{ data: any[] }>('/admin/merchant-agents', { params }),
  approveMerchantAgent: (userId: string) => api.post(`/admin/merchant-agents/${userId}/approve`),
  rejectMerchantAgent: (userId: string, reason?: string) =>
    api.post(`/admin/merchant-agents/${userId}/reject`, { reason }),
  suspendMerchantAgent: (userId: string) => api.post(`/admin/merchant-agents/${userId}/suspend`),
  reinstateMerchantAgent: (userId: string) => api.post(`/admin/merchant-agents/${userId}/reinstate`),

  // Adverts
  getAdverts: (params?: { slot?: string }) => api.get('/admin/adverts', { params }),
  createAdvert: (data: { title: string; imageUrl: string; linkUrl?: string; slot: 'random' | 'promo'; productId?: string; active?: boolean; startDate?: string; endDate?: string; order?: number }) =>
    api.post('/admin/adverts', data),
  updateAdvert: (id: string, data: Partial<{ title: string; imageUrl: string; linkUrl: string; slot: string; productId: string; active: boolean; startDate: string; endDate: string; order: number }>) =>
    api.put(`/admin/adverts/${id}`, data),
  deleteAdvert: (id: string) => api.delete(`/admin/adverts/${id}`),

  // Landing backgrounds (login/register page)
  getLandingBackgrounds: () => api.get('/admin/landing-backgrounds'),
  uploadLandingBackground: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ url: string }>('/admin/landing-backgrounds/upload', formData);
  },
  createLandingBackground: (data: { imageUrl: string; order?: number }) =>
    api.post('/admin/landing-backgrounds', data),
  updateLandingBackground: (id: string, data: Partial<{ imageUrl: string; order: number; active: boolean }>) =>
    api.put(`/admin/landing-backgrounds/${id}`, data),
  deleteLandingBackground: (id: string) => api.delete(`/admin/landing-backgrounds/${id}`),

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
  getPaygateFeeReport: (params?: { days?: number }) =>
    api.get('/admin/paygate-fees/report', { params }),

  // Suppliers (marketplace)
  getSuppliers: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/suppliers', { params }),
  getSupplier: (id: string) => api.get(`/admin/suppliers/${id}`),
  updateSupplier: (id: string, data: { shippingCost?: number; pickupAddress?: string }) =>
    api.put(`/admin/suppliers/${id}`, data),
  approveSupplier: (id: string) => api.post(`/admin/suppliers/${id}/approve`),
  rejectSupplier: (id: string, reason?: string) =>
    api.post(`/admin/suppliers/${id}/reject`, { reason }),

  // Marketplace orders (checkout)
  getOrders: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/orders', { params }),

  /** Estimated profit breakdown (COGS, fees, reseller/music splits) for one checkout order */
  getDropshippingOrderProfit: (orderId: string) =>
    api.get(`/admin/dropshipping/orders/${orderId}/profit`),
  /** Daily/monthly aggregates — query: from, to (ISO), groupBy day|month */
  getDropshippingProfitReport: (params: { from: string; to: string; groupBy?: 'day' | 'month' }) =>
    api.get('/admin/dropshipping/report', { params }),

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
  getProducts: (params?: { page?: number; limit?: number; supplierId?: string; active?: boolean; supplierSource?: string }) =>
    api.get('/admin/products', { params }),

  // Dropshipping – CJ (superadmin only)
  searchCJProducts: (params?: { q?: string; page?: number; size?: number }) =>
    api.get('/admin/dropship/search-cj', { params }),
  importCJProduct: (cjProductId: string, forceUpdate?: boolean, productSku?: string) => {
    const path = `/admin/dropship/import-cj/${encodeURIComponent(cjProductId)}${forceUpdate ? '?forceUpdate=true' : ''}`;
    const sku = productSku?.trim();
    return sku ? api.post(path, { productSku: sku }) : api.post(path);
  },
  searchImportCJ: (data: { query?: string; limit?: number }) =>
    api.post('/admin/dropship/search-import-cj', data),
  syncCjStock: () =>
    api.post<{ data: { total: number; updated: number; failed: number; outOfStock: string[] } }>('/admin/dropship/sync-cj-stock'),

  // Dropshipping – EPROLO (superadmin only)
  searchEproloProducts: (params?: { q?: string; page?: number; size?: number }) =>
    api.get('/admin/dropship/search-eprolo', { params, timeout: 90000 }),
  importEproloProduct: (eproloProductId: string, forceUpdate?: boolean) =>
    api.post(`/admin/dropship/import-eprolo/${eproloProductId}${forceUpdate ? '?forceUpdate=true' : ''}`),
  searchImportEprolo: (data: { query?: string; limit?: number }) =>
    api.post('/admin/dropship/search-import-eprolo', data),
  syncEproloStock: () =>
    api.post<{ data: { total: number; updated: number; failed: number; outOfStock: string[] } }>('/admin/dropship/sync-eprolo-stock'),
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
    discountPrice?: number;
    bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
    currency?: string;
    stock?: number;
    outOfStock?: boolean;
    sku?: string;
    sizes?: string[];
    allowResell?: boolean;
    categories?: string[];
    tags?: string[];
    availableCountries?: string[];
  }) => api.post('/admin/products', data),
  getProduct: (id: string) => api.get(`/admin/products/${id}`),
  updateProduct: (id: string, data: Record<string, unknown>) => api.put(`/admin/products/${id}`, data),
  deleteProduct: (id: string) => api.delete(`/admin/products/${id}`),

  // Morongwa-TV moderation
  getTVPosts: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/tv/posts', { params }),
  approveTVPost: (id: string) => api.post(`/admin/tv/posts/${id}/approve`),
  rejectTVPost: (id: string, reason?: string) => api.post(`/admin/tv/posts/${id}/reject`, { reason }),
  getTVReports: (params?: { page?: number; limit?: number }) =>
    api.get('/admin/tv/reports', { params }),
  resolveTVReport: (id: string) => api.post(`/admin/tv/reports/${id}/resolve`),

  // Super-admin: create admins
  createAdmin: (data: { email: string; name: string; password: string; sections?: string[]; supportCategories?: string[] }) =>
    api.post('/admin/admins', data),
  getAdmins: () => api.get('/admin/admins'),

  // Music (admin: load songs)
  getMusicSongs: () => api.get('/admin/music/songs'),
  deleteMusicSong: (id: string) => api.delete(`/admin/music/songs/${id}`),
  uploadMusicSong: (audio: File, artwork: File, metadata: { userId?: string; title: string; artist: string; songwriters?: string; producer?: string; genre: string; lyrics?: string; downloadEnabled?: boolean; downloadPrice?: number }) => {
    const formData = new FormData();
    formData.append('audio', audio);
    formData.append('artwork', artwork);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    formData.append('genre', metadata.genre);
    if (metadata.userId) formData.append('userId', metadata.userId);
    if (metadata.songwriters) formData.append('songwriters', metadata.songwriters);
    if (metadata.producer) formData.append('producer', metadata.producer);
    if (metadata.lyrics) formData.append('lyrics', metadata.lyrics);
    formData.append('downloadEnabled', metadata.downloadEnabled ? 'true' : 'false');
    if (metadata.downloadEnabled && metadata.downloadPrice != null) formData.append('downloadPrice', String(metadata.downloadPrice));
    return api.post('/admin/music/upload-song', formData);
  },
  uploadMusicAlbum: (
    tracks: File[],
    artwork: File,
    metadata: { userId?: string; title: string; artist: string; songwriters?: string; producer?: string; genre: string; lyrics?: string; downloadEnabled?: boolean; downloadPrice?: number }
  ) => {
    const formData = new FormData();
    tracks.forEach((track) => formData.append('tracks', track));
    formData.append('artwork', artwork);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    formData.append('genre', metadata.genre);
    if (metadata.userId) formData.append('userId', metadata.userId);
    if (metadata.songwriters) formData.append('songwriters', metadata.songwriters);
    if (metadata.producer) formData.append('producer', metadata.producer);
    if (metadata.lyrics) formData.append('lyrics', metadata.lyrics);
    formData.append('downloadEnabled', metadata.downloadEnabled ? 'true' : 'false');
    if (metadata.downloadEnabled && metadata.downloadPrice != null) formData.append('downloadPrice', String(metadata.downloadPrice));
    return api.post('/admin/music/upload-album', formData);
  },

  // Artists (admin: create artist/publisher, manage verifications)
  getArtistVerifications: (params?: { status?: string }) => api.get('/admin/artist-verifications', { params }),
  approveArtistVerification: (id: string) => api.post(`/admin/artist-verifications/${id}/approve`),
  rejectArtistVerification: (id: string, reason?: string) => api.post(`/admin/artist-verifications/${id}/reject`, { reason }),
  createArtist: (data: { userId: string; type?: 'artist' | 'company' | 'producer'; stageName?: string; labelName?: string }) =>
    api.post('/admin/artists', data),
};

export const supportAPI = {
  create: (data: { title: string; description: string; category: string; priority?: string }) =>
    api.post('/support', data),
  getMyTickets: (params?: any) => api.get('/support/my-tickets', { params }),
  getAllTickets: (params?: { page?: number; limit?: number; status?: string; category?: string; priority?: string }) =>
    api.get('/support', { params }),
  getById: (id: string) => api.get(`/support/${id}`),
  addMessage: (id: string, message: string) =>
    api.post(`/support/${id}/messages`, { message }),
  updateStatus: (id: string, status: string) =>
    api.put(`/support/${id}/status`, { status }),
};

export const analyticsAPI = {
  getKPIs: (params?: any) => api.get('/analytics/kpis', { params }),
  getTaskTrends: (days?: number) => api.get('/analytics/trends/tasks', { params: { days } }),
  getRevenueTrends: (days?: number) => api.get('/analytics/trends/revenue', { params: { days } }),
  getRunnerPerformance: (runnerId: string) => api.get(`/analytics/runner/${runnerId}`),
};

export const usersAPI = {
  list: (params?: { page?: number; limit?: number; q?: string }) =>
    api.get('/users', { params }),
  getProfile: (id: string) => api.get(`/users/${id}`),
  getProfileStats: (id: string) =>
    api.get<{ user: any; postCount: number; imageCount: number; videoCount: number; musicCount: number; followerCount: number; followingCount: number }>(`/users/${id}/profile-stats`),
  updateProfile: (id: string, data: { name?: string; username?: string; phone?: string; isPrivate?: boolean; avatar?: string; stripBackgroundPic?: string }) =>
    api.put(`/users/${id}`, data),
  toggleLive: (id: string) => api.patch(`/users/${id}/live`),
  uploadAvatar: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return api.post(`/users/${id}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  setAvatarFromUrl: (id: string, url: string) =>
    api.patch(`/users/${id}/avatar-url`, { url }),
  uploadStripBackground: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/users/${id}/strip-background`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  addRole: (id: string, role: 'client' | 'runner') =>
    api.post(`/users/${id}/roles`, { action: 'add', role }),
  removeRole: (id: string, role: 'client' | 'runner') =>
    api.post(`/users/${id}/roles`, { action: 'remove', role }),
  uploadPdp: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('pdp', file);
    return api.post(`/users/${id}/pdp`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  uploadVehicle: (id: string, data: { make?: string; model?: string; plate?: string }, documents: File[]) => {
    const formData = new FormData();
    if (data.make) formData.append('make', data.make);
    if (data.model) formData.append('model', data.model);
    if (data.plate) formData.append('plate', data.plate);
    documents.forEach((f) => formData.append('documents', f));
    return api.post(`/users/${id}/vehicles`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  updateContentPreferences: (id: string, data: { showProducts?: boolean; preferencesAskedAt?: string }) =>
    api.patch(`/users/${id}/content-preferences`, data),
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
  list: (params?: { limit?: number; page?: number; random?: boolean; q?: string; category?: string }) =>
    api.get('/products', { params: { ...params, random: params?.random ? '1' : undefined } }),
  listCategories: () => api.get<{ data: Array<{ name: string; count: number }> }>('/products/categories'),
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
    discountPrice?: number;
    bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }>;
    currency?: string;
    stock?: number;
    outOfStock?: boolean;
    sku?: string;
    sizes?: string[];
    allowResell?: boolean;
    categories?: string[];
    tags?: string[];
    availableCountries?: string[];
  }) => api.post('/products', data),
};

export const cartAPI = {
  get: () => api.get('/cart'),
  add: (productId: string, qty?: number, resellerId?: string) =>
    api.post('/cart', { productId, qty: qty ?? 1, resellerId }),
  addMusic: (songId: string, qty?: number) =>
    api.post('/cart', { type: 'music', songId, qty: qty ?? 1 }),
  updateItem: (productId: string, qty: number) =>
    api.put(`/cart/item/${productId}`, { qty }),
  removeItem: (productId: string) => api.delete(`/cart/item/${productId}`),
  removeMusicItem: (songId: string) => api.delete(`/cart/music/${songId}`),
};

export const checkoutAPI = {
  quote: (params?: { deliveryAddress?: string; deliveryCountry?: string }) =>
    api.post('/checkout/quote', { deliveryCountry: params?.deliveryCountry ?? 'ZA', deliveryAddress: params?.deliveryAddress }),
  pay: (paymentMethod: 'wallet' | 'card', deliveryAddress: string, deliveryCountry?: string) =>
    api.post('/checkout/pay', { paymentMethod, deliveryAddress, deliveryCountry: deliveryCountry ?? 'ZA' }),
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
  updateStore: (id: string, data: { name?: string; address?: string; email?: string; cellphone?: string; whatsapp?: string; stripBackgroundPic?: string }) =>
    api.put(`/stores/${id}`, data),
  uploadStripBackground: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ url: string; data: any }>(`/stores/${id}/strip-background`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getBySlug: (slug: string) => api.get(`/stores/by-slug/${slug}`),
};

export const followsAPI = {
  follow: (userId: string) => api.post(`/follows/${userId}`),
  friendRequest: (userId: string) => api.post(`/follows/friend/${userId}`),
  unfollow: (userId: string) => api.delete(`/follows/${userId}`),
  getSuggested: (params?: { limit?: number; q?: string }) => api.get<{ data: Array<{ _id: string; name: string; avatar?: string; username?: string; followerCount?: number }> }>('/follows/suggested', { params }),
  getStatus: (userId: string) => api.get(`/follows/${userId}/status`),
  getPendingRequests: () => api.get('/follows/requests/pending'),
  acceptRequest: (followerId: string) => api.post(`/follows/${followerId}/accept`),
  rejectRequest: (followerId: string) => api.post(`/follows/${followerId}/reject`),
};

export const productEnquiryAPI = {
  enquire: (productId: string, message?: string) =>
    api.post(`/product-enquiry/product/${productId}`, { message }),
  getMyEnquiries: () => api.get('/product-enquiry'),
  getMessages: (enquiryId: string) => api.get(`/product-enquiry/${enquiryId}/messages`),
  sendMessage: (enquiryId: string, content: string) =>
    api.post(`/product-enquiry/${enquiryId}/messages`, { content }),
};

export const tvAPI = {
  getPost: (id: string) => api.get(`/tv/${id}`),
  getFeed: (params?: { page?: number; limit?: number; sort?: 'newest' | 'trending' | 'random'; type?: 'video' | 'image' | 'carousel' | 'product' | 'images' | 'audio' | 'text'; creatorId?: string; q?: string; genre?: string; hideProducts?: boolean }) => {
    const { hideProducts, ...rest } = params ?? {};
    return api.get('/tv', { params: { ...rest, ...(hideProducts ? { hideProducts: '1' } : {}) } });
  },
  getStatuses: () => api.get('/tv/statuses'),
  getTrendingHashtags: (limit?: number) => api.get<{ data: { tag: string; count: number }[] }>('/tv/hashtags/trending', { params: { limit } }),
  getHashtagAccounts: (tag: string, limit?: number) =>
    api.get<{ data: Array<{ _id: string; name?: string; avatar?: string; username?: string }>; tag?: string }>(
      `/tv/hashtags/${encodeURIComponent(tag.replace(/^#/, '').trim())}/accounts`,
      { params: limit ? { limit } : undefined }
    ),
  uploadMedia: (file: File) => {
    const formData = new FormData();
    formData.append('media', file);
    return api.post<{ url: string; sensitive?: boolean }>('/tv/upload', formData);
  },
  uploadImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('images', f, f.name));
    return api.post<{ urls: string[]; sensitive?: boolean }>('/tv/upload-images', formData);
  },
  createPost: (data: {
    type: 'video' | 'image' | 'carousel' | 'product' | 'text' | 'audio';
    mediaUrls?: string[];
    caption?: string;
    heading?: string;
    subject?: string;
    hashtags?: string[];
    productId?: string;
    filter?: string;
    genre?: string;
    artworkUrl?: string;
    songId?: string;
    sensitive?: boolean;
  }) => api.post('/tv', data),
  repost: (id: string) => api.post(`/tv/${id}/repost`),
  like: (id: string) => api.post(`/tv/${id}/like`),
  getLiked: (id: string) => api.get<{ data: { liked: boolean } }>(`/tv/${id}/liked`),
  report: (id: string, reason: string) => api.post(`/tv/${id}/report`, { reason }),
  deletePost: (id: string) => api.delete(`/tv/${id}`),
  getComments: (id: string) => api.get(`/tv/${id}/comments`),
  uploadCommentAudio: (file: File) => {
    const formData = new FormData();
    formData.append('audio', file);
    return api.post<{ data: { url: string } }>('/tv/comments/upload-audio', formData);
  },
  addComment: (id: string, payload: string | { text?: string; audioUrl?: string }) => {
    if (typeof payload === 'string') return api.post(`/tv/${id}/comments`, { text: payload });
    return api.post(`/tv/${id}/comments`, payload);
  },
  getWatermark: () => api.get<{ data: { watermark: string } }>('/tv/watermark'),
  getFeaturedProducts: (hideProducts?: boolean) =>
    api.get('/tv/products/featured', { params: hideProducts ? { hideProducts: '1' } : undefined }),
};

export const translateAPI = {
  translate: (text: string, target: string = 'en', source: string = 'auto') =>
    api.get<{ translatedText: string; detectedLanguage?: string }>('/translate', {
      params: { text, target, source },
    }),
};

export interface SongRecord {
  _id: string;
  type: 'song' | 'album';
  title: string;
  artist: string;
  songwriters?: string;
  producer?: string;
  genre: string;
  lyrics?: string;
  audioUrl: string;
  artworkUrl: string;
  tracks?: { title: string; audioUrl: string; duration?: number }[];
  downloadEnabled?: boolean;
  downloadPrice?: number;
  userId?: { _id: string; name?: string };
  createdAt: string;
}

export const musicAPI = {
  getGenres: () => api.get<{ data: { id: string; label: string }[] }>('/music/genres'),
  getArtistStatus: () => api.get<{ data: { isVerified: boolean; status: string | null; type: string | null } }>('/music/artist-status'),
  getSongs: (params?: { type?: 'song' | 'album'; page?: number; limit?: number; random?: boolean }) =>
    api.get<{ data: SongRecord[]; page?: number; limit?: number; total?: number; hasMore?: boolean }>('/music/songs', {
      params: { ...params, random: params?.random ? '1' : undefined },
    }),
  uploadAudio: (file: File) => {
    const formData = new FormData();
    formData.append('audio', file);
    return api.post<{ data: { url: string } }>('/music/upload-audio', formData);
  },
  artistApply: (data: { type: string; stageName?: string; labelName?: string }, documents?: File[]) => {
    const formData = new FormData();
    formData.append('type', data.type);
    if (data.stageName) formData.append('stageName', data.stageName);
    if (data.labelName) formData.append('labelName', data.labelName);
    (documents || []).forEach((f) => formData.append('documents', f, f.name));
    return api.post('/music/artist-apply', formData);
  },
  /** Upload song: WAV audio, JPEG/PNG artwork (1200×1200), metadata */
  uploadSong: (
    audio: File,
    artwork: File,
    metadata: {
      title: string;
      artist: string;
      songwriters?: string;
      producer?: string;
      genre: string;
      lyrics?: string;
      downloadEnabled?: boolean;
      downloadPrice?: number;
    }
  ) => {
    const formData = new FormData();
    formData.append('audio', audio);
    formData.append('artwork', artwork);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    formData.append('genre', metadata.genre);
    if (metadata.songwriters) formData.append('songwriters', metadata.songwriters);
    if (metadata.producer) formData.append('producer', metadata.producer);
    if (metadata.lyrics) formData.append('lyrics', metadata.lyrics);
    formData.append('downloadEnabled', metadata.downloadEnabled ? 'true' : 'false');
    if (metadata.downloadEnabled && metadata.downloadPrice != null) formData.append('downloadPrice', String(metadata.downloadPrice));
    return api.post<{ data: SongRecord }>('/music/upload-song', formData);
  },
  uploadAlbum: (
    tracks: File[],
    artwork: File,
    metadata: { title: string; artist: string; songwriters?: string; producer?: string; genre: string; lyrics?: string; downloadEnabled?: boolean; downloadPrice?: number }
  ) => {
    const formData = new FormData();
    tracks.forEach((track) => formData.append('tracks', track));
    formData.append('artwork', artwork);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    formData.append('genre', metadata.genre);
    if (metadata.songwriters) formData.append('songwriters', metadata.songwriters);
    if (metadata.producer) formData.append('producer', metadata.producer);
    if (metadata.lyrics) formData.append('lyrics', metadata.lyrics);
    formData.append('downloadEnabled', metadata.downloadEnabled ? 'true' : 'false');
    if (metadata.downloadEnabled && metadata.downloadPrice != null) formData.append('downloadPrice', String(metadata.downloadPrice));
    return api.post<{ data: SongRecord }>('/music/upload-album', formData);
  },
  purchaseDownload: (songId: string) => api.post(`/music/${songId}/purchase`),
  getDownloadLinks: (songId: string) => api.get(`/music/${songId}/download`),
  getMyPurchases: () => api.get<{ data: Array<{ songId: string; reference: string; amount: number; createdAt: string }> }>('/music/purchases/me'),
};

export const suppliersAPI = {
  uploadDocument: (file: File) => {
    const formData = new FormData();
    formData.append('document', file);
    return api.post<{ success: boolean; path: string; fullUrl: string }>('/suppliers/upload-document', formData);
  },
  updateMe: (data: { shippingCost?: number; pickupAddress?: string }) =>
    api.put('/suppliers/me', data),
  apply: (data: {
    type: 'company' | 'individual';
    storeName?: string;
    pickupAddress?: string;
    companyRegNo?: string;
    directorsIdDoc?: string;
    directorsIdDocs?: string[];
    idDocument?: string;
    contactEmail: string;
    contactPhone: string;
    verificationFeeWaived?: boolean;
  }) => api.post('/suppliers/apply', data),
  getMe: () => api.get('/suppliers/me'),
  getMyProducts: () => api.get('/suppliers/me/products'),
};

export const macgyverAPI = {
  ask: (query: string) =>
    api.post<{ data: { text?: string; error?: string; type?: string; query?: string; message?: string } }>('/macgyver/ask', { query }),
};
