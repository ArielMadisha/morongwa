// API client configuration with axios
import axios from 'axios';
import { lsGetItem, lsRemoveItem } from '@/lib/browserStorage';
import { normalizeUploadFile } from '@/lib/mediaUpload';
import { PROD_API_URL, PROD_API_BASE, isProdQwertymatesHostname } from '@/lib/productionConfig';
import { normalizeBulkTierMaxQty } from '@/lib/bulkTierLimits';

/** Use relative `/uploads/...` so Next.js rewrites proxy to the API (same origin as www). Avoids cross-subdomain img/CORP quirks. */
function preferSameOriginUploadsPath(): boolean {
  if (typeof window === 'undefined') return true;
  const h = window.location.hostname;
  return isProdQwertymatesHostname(h) || h === 'localhost' || h === '127.0.0.1';
}

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

/** Browser uploads from www/localhost use same-origin /api (Next rewrite → API). */
export function resolveBrowserUploadApiUrl(): string {
  if (typeof window === 'undefined') return API_URL;
  const host = window.location.hostname;
  if (isProdQwertymatesHostname(host) || host === 'localhost' || host === '127.0.0.1') {
    return '/api';
  }
  return API_URL;
}

/** Backend base URL (no /api) - used for image URLs and Socket.IO. */
export const API_BASE = API_URL.replace(/\/api\/?$/, '').replace(/\/$/, '');

/** Socket.IO server URL - same as API_BASE. */
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

/** True when discountPrice is a real sale price (not 0 / null / >= list). */
export function isValidCatalogDiscountPrice(discountPrice: unknown, listPrice: number): boolean {
  const d = Number(discountPrice);
  const p = Number(listPrice);
  if (!Number.isFinite(d) || !Number.isFinite(p) || p <= 0) return false;
  return d > 0 && d < p;
}

/** Effective unit price for qty 1 (valid discount or list price). */
export function getEffectivePrice(p: { price: number; discountPrice?: number | null }): number {
  if (isValidCatalogDiscountPrice(p.discountPrice, p.price)) return Number(p.discountPrice);
  return p.price;
}

/** Unit price for cart qty, including bulk tiers when applicable. */
export function getProductPriceForQty(
  p: {
    price: number;
    discountPrice?: number | null;
    bulkTiers?: Array<{ minQty: number; maxQty: number; price: number }> | null;
  },
  qty: number
): number {
  const tiers = p.bulkTiers;
  if (Array.isArray(tiers) && tiers.length > 0 && qty > 0) {
    const tier = tiers
      .filter(
        (t) =>
          qty >= t.minQty && qty <= normalizeBulkTierMaxQty(Number(t.maxQty), Number(t.minQty))
      )
      .sort((a, b) => b.minQty - a.minQty)[0];
    if (tier && Number(tier.price) >= 0) return Number(tier.price);
  }
  return getEffectivePrice(p);
}

/** Supplier storefront label from populated supplierId. */
export function productSupplierStoreName(
  supplierId?: { storeName?: string } | string | null
): string | null {
  if (supplierId && typeof supplierId === 'object' && supplierId.storeName) {
    const n = String(supplierId.storeName).trim();
    return n || null;
  }
  return null;
}

/** Encode /uploads/ path segments so filenames with spaces (e.g. WhatsApp images) load in browsers. */
function encodeUploadsPathForBrowser(uploadsPath: string): string {
  const marker = '/uploads/';
  const idx = uploadsPath.indexOf(marker);
  if (idx < 0) return uploadsPath;
  const prefix = uploadsPath.slice(0, idx + marker.length);
  const rest = uploadsPath.slice(idx + marker.length);
  const encoded = rest
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(decodeURIComponent(seg)))
    .join('/');
  return `${prefix}${encoded}`;
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
      if (uploadsPathMatch) {
        const encoded = encodeUploadsPathForBrowser(uploadsPathMatch[0]);
        if (preferSameOriginUploadsPath()) return encoded;
        return `${parsed.origin}${encoded}`;
      }
      const isInsecureIpHost = parsed.protocol === 'http:' && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(parsed.hostname);
      if (isInsecureIpHost) {
        return `${PROD_API_BASE}${path}`;
      }
      // Keep external https URLs untouched (non-uploads).
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
    const uploadsPath = encodeUploadsPathForBrowser(uploadsMatch[0]);
    if (preferSameOriginUploadsPath()) return uploadsPath;
    return `${PROD_API_BASE}${uploadsPath}`;
  }
  if (normalized.startsWith('/uploads/')) {
    const uploadsPath = encodeUploadsPathForBrowser(normalized);
    if (preferSameOriginUploadsPath()) return uploadsPath;
    return `${PROD_API_BASE}${uploadsPath}`;
  }
  // Bare filename (legacy data): tv-* -> /uploads/tv/; music catalog -> /uploads/music/; else /uploads/
  if (!normalized.includes('/') && !normalized.startsWith('http')) {
    let uploadsPath: string;
    if (normalized.startsWith('tv-')) {
      uploadsPath = '/uploads/tv/' + normalized;
    } else     if (
      normalized.startsWith('song-') ||
      normalized.startsWith('artwork-') ||
      normalized.startsWith('music-')
    ) {
      uploadsPath = '/uploads/music/' + normalized;
    } else {
      uploadsPath = '/uploads/' + normalized;
    }
    if (preferSameOriginUploadsPath()) return uploadsPath;
    return `${PROD_API_BASE}${uploadsPath}`;
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

/**
 * TV / music uploads can be large and the API may run moderation or ffprobe after multer finishes.
 * Per-request timeouts on FormData posts override the default 25s client limit.
 */
export const API_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

/** User-facing message when axios aborts a long upload. */
export function formatUploadAxiosError(err: unknown, fallback = 'Upload failed'): string {
  const e = err as { code?: string; message?: string; response?: { data?: { message?: string; error?: string } } };
  const msg = String(e?.message || '');
  if (e?.code === 'ECONNABORTED' || /timeout of \d+ms exceeded/i.test(msg)) {
    return 'Upload timed out. Large videos can take several minutes — try again, use Wi-Fi, or choose a smaller file.';
  }
  return e?.response?.data?.message || e?.response?.data?.error || fallback;
}

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
      const token = lsGetItem('token');
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
      lsRemoveItem('token');
      lsRemoveItem('user');
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
  requestRunnerRole: (data?: {
    runnerCategory?: 'courier' | 'store_parcel';
    runnerServiceCountry?: string;
    runnerServiceCity?: string;
  }) => api.post('/auth/request-runner', data || {}),
};

export const passwordAPI = {
  forgot: (identifier: string, channel: "auto" | "email" | "sms" | "whatsapp" = "auto") =>
    api.post('/password/forgot', { identifier, channel }),
  reset: (token: string, newPassword: string) => api.post('/password/reset', { token, newPassword }),
};

export const advertsAPI = {
  getAdverts: (slot?: 'random' | 'promo') =>
    api.get('/adverts', { params: slot ? { slot } : {} }),
  getSponsored: (params: {
    placement: string;
    audience?: 'generic' | 'wallet' | 'runner' | 'merchant' | 'shopper';
    platform?: 'web' | 'whatsapp' | 'android' | 'ios';
    limit?: number;
  }) => api.get<{ data: Array<{
    id: string;
    title: string;
    caption?: string;
    videoUrl?: string;
    imageUrl?: string;
    advertiserName?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    adType?: string;
    targetAudience?: string;
    moduleCategory?: string;
    placement?: string;
    platform?: string;
  }> }>('/adverts/sponsored', { params }),
  trackImpression: (data: {
    adId: string;
    placementKey: string;
    platform?: 'web' | 'whatsapp' | 'android' | 'ios';
    audience?: 'generic' | 'wallet' | 'runner' | 'merchant' | 'shopper';
    userId?: string;
  }) => api.post('/adverts/impression', data),
  trackClick: (data: {
    adId: string;
    placementKey: string;
    platform?: 'web' | 'whatsapp' | 'android' | 'ios';
    audience?: 'generic' | 'wallet' | 'runner' | 'merchant' | 'shopper';
    userId?: string;
  }) => api.post('/adverts/click', data),
  trackConversion: (data: {
    adId: string;
    placementKey: string;
    platform?: 'web' | 'whatsapp' | 'android' | 'ios';
    audience?: 'generic' | 'wallet' | 'runner' | 'merchant' | 'shopper';
    userId?: string;
  }) => api.post('/adverts/conversion', data),
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
  /** Web errands handover: runner uploads parcel photo at pickup */
  uploadPickupProof: (id: string, photo: File) => {
    const fd = new FormData();
    fd.append('photo', photo);
    return api.post(`/tasks/${id}/pickup-proof`, fd);
  },
  /** Runner rings bell at delivery — notifies admins with map link */
  arrivalBell: (id: string, body: { lat: number; lng: number; accuracyM?: number }) =>
    api.post(`/tasks/${id}/arrival-bell`, body),
  /** Client confirms they collected the parcel (before runner completes) */
  confirmCollection: (id: string) => api.post(`/tasks/${id}/confirm-collection`),
  confirmDelivery: (id: string) => api.post(`/tasks/${id}/confirm-delivery`),
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
  requestMoneyFromScan: (payeeUserId: string, amount: number, message?: string) =>
    api.post('/wallet/request-money-from-scan', { payeeUserId, amount, message }),
  payRequest: (requestId: string) => api.post('/wallet/pay-request', { requestId }),
  getMoneyRequests: () => api.get('/wallet/money-requests'),
  getPaymentRequestStatus: (paymentRequestId: string) =>
    api.get<{ paymentRequestId: string; status: string; amount: number; merchantName: string; completedAt?: string }>(
      `/wallet/payment-request/${paymentRequestId}/status`
    ),
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
  getPendingPaymentsForPayer: () =>
    api.get<Array<{ _id: string; amount: number; merchantName: string; expiresAt: string }>>('/wallet/pending-payments'),
  // E-commerce checkout
  getCheckoutDetails: (params: {
    sessionId?: string;
    merchantId?: string;
    amount?: number;
    reference?: string;
    name?: string;
    return_url?: string;
    cancel_url?: string;
  }) =>
    api.get<{
      sessionId: string;
      merchantId: string;
      amount: number;
      reference: string;
      merchantName: string;
      returnUrl?: string;
    }>('/wallet/checkout/details', { params }),
  checkoutPay: (data: { sessionId: string; method: 'wallet' | 'card'; cardId?: string }) =>
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
  searchMerchantAgents: (params?: { q?: string; location?: string }) =>
    api.get<
      Array<{
        _id: string;
        name: string;
        username?: string;
        publicNote?: string;
        businessName?: string;
        businessDescription?: string;
        countryCode?: string;
      }>
    >('/wallet/merchant-agents', { params: params ?? {} }),
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
  /** Tuckshop cash-agent commission dashboard + emailed CSV/PDF report */
  getAgentEarningsSummary: () =>
    api.get<{
      summary: { tuckshopsRegistered: number; pendingApprovals: number; totalCommissionsEarnedZar: number };
      registrations: any[];
    }>('/wallet/agent-earnings/summary'),
  emailAgentEarningsReport: () => api.post<{ ok: boolean; message: string }>('/wallet/agent-earnings/email-report'),
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

export const webrtcAPI = {
  getTurnCredentials: () =>
    api.get<{
      data: { urls: string[]; username: string; credential: string; ttlSec?: number };
    }>('/webrtc/turn-credentials'),
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
  /** Delegated admin sections (super-admin = all; legacy admin without row = all). */
  getPermissionsMe: () =>
    api.get<{ isSuperAdmin: boolean; sections: string[]; supportCategories: string[] }>('/admin/permissions/me'),
  getStats: () => api.get('/admin/stats'),
  /** Money metrics for a date range (from/to ISO). Max 366 days. */
  getMoneyMetrics: (params: { from: string; to: string }) =>
    api.get('/admin/money-metrics', { params }),
  /** Detailed rows for one money metric card. */
  getMoneyMetricDetail: (params: { metric: string; page?: number; limit?: number }) =>
    api.get('/admin/money-metrics/detail', { params }),
  getAllUsers: (params?: any) => api.get('/admin/users', { params }),
  getUsers: (params?: any) => api.get('/admin/users', { params }),
  suspendUser: (id: string, reason?: string) =>
    api.post(`/admin/users/${id}/suspend`, { reason }),
  activateUser: (id: string) => api.post(`/admin/users/${id}/activate`),
  updateUser: (
    id: string,
    data: {
      name?: string;
      username?: string;
      email?: string;
      phone?: string;
      countryCode?: string;
      runnerServiceCountry?: string;
      runnerServiceCity?: string;
    }
  ) => api.put(`/admin/users/${id}`, data),
  /** Super-admin only. Backend rejects users with orders/tasks/wallet/supplier/admin roles. */
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  verifyRunnerVehicle: (userId: string, vehicleIndex: number) =>
    api.post(`/admin/users/${userId}/vehicles/${vehicleIndex}/verify`),
  verifyRunnerPdp: (userId: string) => api.post(`/admin/users/${userId}/pdp/verify`),
  verifyRunnerIdDocument: (userId: string) => api.post(`/admin/users/${userId}/runner-id-document/verify`),
  verifyRunnerProofOfResidence: (userId: string) =>
    api.post(`/admin/users/${userId}/runner-proof-of-residence/verify`),

  getMerchantAgentApplications: (params?: { status?: string }) =>
    api.get<{ data: any[] }>('/admin/merchant-agents', { params }),
  verifyMerchantAgentKyc: (userId: string) =>
    api.post<{ message: string; isVerified: boolean }>(`/admin/merchant-agents/${userId}/verify-kyc`),
  approveMerchantAgent: (userId: string) => api.post(`/admin/merchant-agents/${userId}/approve`),
  rejectMerchantAgent: (userId: string, reason?: string) =>
    api.post(`/admin/merchant-agents/${userId}/reject`, { reason }),
  suspendMerchantAgent: (userId: string) => api.post(`/admin/merchant-agents/${userId}/suspend`),
  reinstateMerchantAgent: (userId: string) => api.post(`/admin/merchant-agents/${userId}/reinstate`),

  getTuckshopCashAgentRegistrations: (params?: { status?: string }) =>
    api.get<{ data: any[] }>('/admin/tuckshop-cash-agents', { params }),
  approveTuckshopCashAgent: (id: string, body?: { commissionNote?: string; commissionAmountZar?: number }) =>
    api.post(`/admin/tuckshop-cash-agents/${id}/approve`, body ?? {}),
  rejectTuckshopCashAgent: (id: string, body?: { reason?: string }) =>
    api.post(`/admin/tuckshop-cash-agents/${id}/reject`, body ?? {}),
  getFraudRegistrationExceptions: (params?: { limit?: number }) =>
    api.get<{
      incentiveReference: Array<{ iso: string; currencyCode: string; amount: number; symbol: string; display: string }>;
      tuckshopFlags: any[];
      onboardingFlags: any[];
      generatedAt: string;
    }>('/admin/fraud-registration-exceptions', { params }),
  rescanTuckshopRegistrationFraud: (id: string) => api.post(`/admin/tuckshop-cash-agents/${id}/rescan-fraud`),
  rescanOnboardingAgentFraud: (auditLogId: string) =>
    api.post(`/admin/fraud-onboarding-applications/${auditLogId}/rescan-fraud`),

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
  publishTaskQuote: (id: string, body: { clientTotalZar: number; notes?: string }) =>
    api.post(`/admin/tasks/${id}/publish-quote`, body),
  cancelTask: (id: string, reason?: string) =>
    api.post(`/admin/tasks/${id}/cancel`, { reason }),
  broadcastTaskRunners: (id: string, body?: { message?: string }) =>
    api.post(`/admin/tasks/${id}/broadcast-runners`, body ?? {}),
  contactTaskRunner: (id: string, body: { runnerUserId: string; message?: string }) =>
    api.post(`/admin/tasks/${id}/contact-runner`, body),
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
  getPaymentFees: () =>
    api.get<{
      data: {
        paygateFlatFeeZar: number;
        walletPayoutFeeZar: number;
        envDefaults?: { paygateFlatFeeZar: number; walletPayoutFeeZar: number };
        updatedAt?: string | null;
        updatedBy?: { name?: string; email?: string } | null;
      };
    }>('/admin/payment-fees'),
  updatePaymentFees: (data: { paygateFlatFeeZar: number; walletPayoutFeeZar: number }) =>
    api.put('/admin/payment-fees', data),

  // Suppliers (marketplace)
  getSuppliers: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    /** Exclude supplier profiles whose store was permanently deleted */
    hasActiveStore?: boolean;
  }) =>
    api.get('/admin/suppliers', {
      params: params
        ? {
            ...params,
            ...(params.hasActiveStore ? { hasActiveStore: 'true' } : {}),
          }
        : undefined,
    }),
  createSupplier: (data: {
    userId: string;
    type?: 'company' | 'individual';
    storeName?: string;
    contactEmail?: string;
    contactPhone?: string;
  }) => api.post('/admin/suppliers', data),
  getSupplier: (id: string) => api.get(`/admin/suppliers/${id}`),
  updateSupplier: (id: string, data: { shippingCost?: number; pickupAddress?: string }) =>
    api.put(`/admin/suppliers/${id}`, data),
  approveSupplier: (id: string) => api.post(`/admin/suppliers/${id}/approve`),
  rejectSupplier: (id: string, reason?: string) =>
    api.post(`/admin/suppliers/${id}/reject`, { reason }),
  requestSupplierDeletion: (id: string) => api.post(`/admin/suppliers/${id}/request-deletion`),
  getSupplierDeletionRequests: (params?: { status?: string }) =>
    api.get('/admin/supplier-deletion-requests', { params }),
  approveSupplierDeletionRequest: (id: string) => api.post(`/admin/supplier-deletion-requests/${id}/approve`),
  rejectSupplierDeletionRequest: (id: string, reason?: string) =>
    api.post(`/admin/supplier-deletion-requests/${id}/reject`, { reason }),

  // Marketplace orders (checkout)
  getOrders: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/orders', { params }),

  // Courier tariffs, parcels & disputes
  getCourierProviders: () => api.get('/admin/courier/providers'),
  patchCourierProvider: (id: string, data: Record<string, unknown>) => api.patch(`/admin/courier/providers/${id}`, data),
  getCourierTariffs: (params?: { countryCode?: string; providerId?: string }) =>
    api.get('/admin/courier/tariffs', { params }),
  createCourierTariff: (data: Record<string, unknown>) => api.post('/admin/courier/tariffs', data),
  patchCourierTariff: (id: string, data: Record<string, unknown>) => api.patch(`/admin/courier/tariffs/${id}`, data),
  deleteCourierTariff: (id: string) => api.delete(`/admin/courier/tariffs/${id}`),
  getCourierShipments: (params?: { page?: number; limit?: number; status?: string; disputeStatus?: string; q?: string }) =>
    api.get('/admin/courier/shipments', { params }),
  patchCourierShipment: (id: string, data: Record<string, unknown>) => api.patch(`/admin/courier/shipments/${id}`, data),
  courierShipmentDispute: (id: string, data: { action: string; reason?: string; resolution?: string }) =>
    api.post(`/admin/courier/shipments/${id}/dispute`, data),
  createCourierShipmentFromOrder: (orderId: string) => api.post(`/admin/courier/shipments/from-order/${orderId}`),

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
  /** Store-owner picker (works for delegated admins with `stores` only; avoids GET /admin/users). */
  getStoresUserOptions: (params?: { limit?: number; q?: string }) =>
    api.get<{ users: Array<{ _id: string; name?: string; email?: string; username?: string }> }>(
      '/admin/stores/user-options',
      { params }
    ),
  getStoreCountries: () =>
    api.get<{ countries: Array<{ code: string; name: string }> }>('/admin/stores/countries'),
  createStore: (data: {
    userId: string;
    name: string;
    type: 'supplier' | 'reseller';
    country: string;
    countryCode?: string;
  }) => api.post('/admin/stores', data),
  getStore: (id: string) => api.get(`/admin/stores/${id}`),
  updateStore: (
    id: string,
    data: {
      name?: string;
      type?: 'supplier' | 'reseller';
      country?: string;
      countryCode?: string;
      address?: string;
      email?: string;
      cellphone?: string;
      whatsapp?: string;
      stripBackgroundPic?: string;
      whatsappMarketCountries?: string[];
    }
  ) => api.put(`/admin/stores/${id}`, data),
  uploadStoreProfilePicture: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ url: string; data: unknown }>(`/admin/stores/${id}/strip-background`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteStore: (id: string) => api.delete(`/admin/stores/${id}`),
  requestStoreDeletion: (id: string) => api.post(`/admin/stores/${id}/request-deletion`),
  getStoreDeletionRequests: (params?: { status?: string }) =>
    api.get('/admin/store-deletion-requests', { params }),
  approveStoreDeletionRequest: (id: string) => api.post(`/admin/store-deletion-requests/${id}/approve`),
  rejectStoreDeletionRequest: (id: string, reason?: string) =>
    api.post(`/admin/store-deletion-requests/${id}/reject`, { reason }),

  getInvalidNumericSchools: () => api.get('/admin/schools/invalid-numeric'),
  purgeInvalidNumericSchools: (dryRun?: boolean) =>
    api.post('/admin/schools/purge-invalid-numeric', { dryRun: !!dryRun }),

  // Products (admin load products for marketplace)
  getProducts: (params?: { page?: number; limit?: number; supplierId?: string; active?: boolean; supplierSource?: string }) =>
    api.get('/admin/products', { params }),

  // Dropshipping – CJ (superadmin only)
  searchCJProducts: (params?: { q?: string; page?: number; size?: number }) =>
    api.get('/admin/dropship/search-cj', { params }),
  /**
   * CJ import: POST with product id in the path (supported by all deployed APIs).
   * Optional JSON body for SKU hint. Avoids bare `/import-cj` 404s behind some gateways.
   */
  importCJProduct: (cjProductId: string | number, forceUpdate?: boolean, productSku?: string) => {
    const id = String(cjProductId ?? "").trim();
    if (!id) return Promise.reject(Object.assign(new Error("CJ product id required"), { name: "ValidationError" }));
    const path = `/admin/dropship/import-cj/${encodeURIComponent(id)}${forceUpdate ? "?forceUpdate=true" : ""}`;
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

  // Dropshipping – SHEIN (superadmin only; pass-through catalog pricing)
  searchSheinProducts: (params?: { q?: string; page?: number; size?: number }) =>
    api.get('/admin/dropship/search-shein', { params, timeout: 90000 }),
  importSheinProduct: (sheinProductId: string, forceUpdate?: boolean) =>
    api.post(`/admin/dropship/import-shein/${sheinProductId}${forceUpdate ? '?forceUpdate=true' : ''}`),
  searchImportShein: (data: { query?: string; limit?: number }) =>
    api.post('/admin/dropship/search-import-shein', data),
  syncSheinStock: () =>
    api.post<{ data: { total: number; updated: number; failed: number; outOfStock: string[] } }>('/admin/dropship/sync-shein-stock'),
  getSheinDropshipStatus: () =>
    api.get<{ configured: boolean; message?: string }>('/admin/dropship/shein-status'),

  uploadProductImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('images', f));
    return api.post<{ urls: string[] }>('/admin/products/upload-images', formData, {
      timeout: API_UPLOAD_TIMEOUT_MS,
    });
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
    colors?: Array<{ name: string; hex?: string; imageIndex?: number }>;
  }) => api.post('/admin/products', data),
  getProduct: (id: string) => api.get(`/admin/products/${id}`),
  updateProduct: (id: string, data: Record<string, unknown>) => api.put(`/admin/products/${id}`, data),
  deleteProduct: (id: string) => api.delete(`/admin/products/${id}`),
  getProductCategories: () => api.get<{ data: string[] }>('/admin/products/categories'),
  /** Supplier picker on Load Products — scoped to product_uploads (not full /admin/suppliers). */
  getProductSupplierOptions: (params?: { limit?: number; hasActiveStore?: boolean }) =>
    api.get<{ suppliers: Array<{ _id: string; storeName?: string; country?: string; countryCode?: string; userId?: { name?: string } }> }>(
      '/admin/products/supplier-options',
      {
        params: params
          ? {
              ...params,
              ...(params.hasActiveStore ? { hasActiveStore: 'true' } : {}),
            }
          : undefined,
      }
    ),
  categorizeMissingProducts: (data?: { fallbackCategory?: string; limit?: number }) =>
    api.post('/admin/products/categorize-missing', data || {}),

  // Morongwa-TV moderation
  getTVPosts: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/admin/tv/posts', { params }),
  approveTVPost: (id: string) => api.post(`/admin/tv/posts/${id}/approve`),
  rejectTVPost: (id: string, reason?: string) => api.post(`/admin/tv/posts/${id}/reject`, { reason }),
  getTVReports: (params?: { page?: number; limit?: number }) =>
    api.get('/admin/tv/reports', { params }),
  resolveTVReport: (id: string) => api.post(`/admin/tv/reports/${id}/resolve`),

  // Super-admin: create admins or grant admin to an existing user (promoteExisting + username or email)
  previewAdminGrantUser: (params: { username?: string; email?: string }) =>
    api.get<{ data: { _id: string; name?: string; email?: string; username?: string; roles?: string[] } }>(
      '/admin/admins/preview-user',
      { params }
    ),
  createAdmin: (
    data:
      | { email: string; name: string; password: string; sections?: string[]; supportCategories?: string[] }
      | {
          promoteExisting: true;
          username?: string;
          email?: string;
          sections?: string[];
          supportCategories?: string[];
        }
  ) => api.post('/admin/admins', data),
  getAdmins: () => api.get('/admin/admins'),
  updateAdminPermissions: (userId: string, data: { sections?: string[]; supportCategories?: string[] }) =>
    api.patch(`/admin/admins/${userId}`, data),
  revokeAdmin: (userId: string) => api.delete(`/admin/admins/${userId}`),

  getLegacyAccounts: () =>
    api.get<{
      data: Array<{
        _id: string;
        name?: string;
        username?: string;
        email?: string;
        displayLabel?: string;
        role?: string[];
        active?: boolean;
        suspended?: boolean;
      }>;
    }>('/admin/legacy-accounts'),
  resetLegacyAccountPassword: (userId: string) =>
    api.post<{ ok: boolean; data: { username?: string; email?: string; tempPassword?: string } }>(
      `/admin/legacy-accounts/${userId}/reset-password`
    ),
  normalizeLegacyAccountDisplayNames: () =>
    api.post<{ ok: boolean; updated: number }>('/admin/legacy-accounts/normalize-display-names'),

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
  /** Create approved ArtistVerification rows for every distinct Song.userId (existing uploads). */
  syncArtistsFromMusicCatalog: () =>
    api.post<{ message: string; distinctOwners: number; processed: number }>('/admin/artists/sync-from-music-catalog'),

  // Sponsored ads admin (CPM/CPC/CPA)
  getSponsoredOverview: () =>
    api.get('/admin/sponsored-video/overview'),
  getSponsoredAdvertisers: (params?: { activeOnly?: boolean; webOnboarding?: 'pending' | 'approved' | 'rejected' }) =>
    api.get('/admin/sponsored-video/advertisers', { params }),
  createSponsoredAdvertiser: (data: { name: string; contactEmail?: string; contactPhone?: string; notes?: string; active?: boolean }) =>
    api.post('/admin/sponsored-video/advertisers', data),
  updateSponsoredAdvertiser: (
    id: string,
    data: {
      name?: string;
      contactEmail?: string;
      contactPhone?: string;
      notes?: string;
      active?: boolean;
      webOnboardingStatus?: 'pending' | 'approved' | 'rejected';
      webPackageTier?: string;
      webOnboardingNotes?: string;
    }
  ) => api.put(`/admin/sponsored-video/advertisers/${id}`, data),
  deleteSponsoredAdvertiser: (id: string) =>
    api.delete(`/admin/sponsored-video/advertisers/${id}`),
  getSponsoredVideoAds: (params?: { advertiserId?: string }) =>
    api.get('/admin/sponsored-video/ads', { params }),
  createSponsoredVideoAd: (data: Record<string, unknown>) =>
    api.post('/admin/sponsored-video/ads', data),
  updateSponsoredVideoAd: (id: string, data: Record<string, unknown>) =>
    api.put(`/admin/sponsored-video/ads/${id}`, data),
  deleteSponsoredVideoAd: (id: string) =>
    api.delete(`/admin/sponsored-video/ads/${id}`),
  getSponsoredVideoRevenueSummary: (params?: { from?: string; to?: string }) =>
    api.get('/admin/sponsored-video/revenue-summary', { params }),
  getSponsoredVideoRevenueLedger: (params?: { from?: string; to?: string }) =>
    api.get('/admin/sponsored-video/revenue-ledger', { params }),
  getAdsReports: (params?: { from?: string; to?: string; groupBy?: 'day' | 'month' }) =>
    api.get('/admin/reports', { params }),

  /** Recent user-to-user direct messages (oversight; not task messenger). */
  getRecentDirectMessages: (params?: { page?: number; limit?: number; q?: string }) =>
    api.get<{ data: unknown[]; pagination: { total: number; page: number; limit: number; pages: number } }>(
      '/admin/messages/recent',
      { params }
    ),
  /** Audience options for admin → user broadcast (all users + by area). */
  getBroadcastAreas: () =>
    api.get<{
      data: {
        allUserCount: number;
        areas: Array<{ type: string; value: string; label: string; userCount: number }>;
      };
    }>('/admin/broadcast/areas'),
  previewBroadcast: (body: {
    scope: 'all' | 'area';
    areaType?: string;
    areaValue?: string;
  }) =>
    api.post<{ data: { recipientCount: number; audience: Record<string, unknown> } }>(
      '/admin/broadcast/preview',
      body
    ),
  sendBroadcast: (body: {
    scope: 'all' | 'area';
    areaType?: string;
    areaValue?: string;
    subject?: string;
    message: string;
    confirm?: boolean;
  }) =>
    api.post<{
      message: string;
      data: { broadcastId: string; recipientCount: number; deliveredCount: number; areaLabel: string };
    }>('/admin/broadcast/send', body),
  getBroadcastHistory: (params?: { page?: number; limit?: number }) =>
    api.get<{ data: unknown[]; pagination: { total: number; page: number; limit: number; pages: number } }>(
      '/admin/broadcast/history',
      { params }
    ),
  /** Users currently marked live (`isLive`). */
  getLiveBroadcasters: () =>
    api.get<{ data: unknown[]; total: number }>('/admin/live/broadcasters'),
  /** Playback/publish readiness + env key hints (no secrets). */
  getLivePlatformSettings: () =>
    api.get<{
      data: {
        playbackConfigured: boolean;
        publishConfigured: boolean;
        hlsPublicHostHint: string | null;
        rtmpPublishHint: string | null;
        envKeys: string[];
        notes: { wallGoLive: string; rtmpSession: string };
      };
    }>('/admin/live/settings'),
  /** Clear isLive + stream key fields (moderation / stuck sessions). */
  forceEndLiveBroadcast: (userId: string) =>
    api.post<{ ok: boolean; message?: string }>(`/admin/live/broadcasters/${userId}/force-end`),

  /** Live HLS viewer metrics + edge probes (Admin → Live streaming). */
  getLiveMetricsSummary: (params?: { hours?: number; broadcasterUserId?: string }) =>
    api.get<{
      data: {
        hours: number;
        since: string;
        byType: Array<{ _id: string; count: number }>;
        recentErrors: Array<{
          streamKey: string;
          eventType: string;
          message?: string;
          sessionId?: string;
          createdAt: string;
          broadcasterUserId: string;
        }>;
        viewersApproxByStream: Array<{ _id: string; viewersApprox: number }>;
      };
    }>('/admin/live/metrics/summary', { params }),
  postLiveHlsProbe: () =>
    api.post<{
      data: {
        hlsBaseConfigured: boolean;
        checkedAt: string;
        streams: Array<{
          userId: string;
          name?: string;
          username?: string;
          streamKey: string;
          hlsUrl: string;
          probe: { ok: boolean; status: number; ms: number; method: string };
        }>;
      };
    }>('/admin/live/metrics/hls-probe'),

  /** QwertyMusic “Sounds” monetization catalog (TikTok-style video attaches). */
  getMusicSoundLibraryCatalog: (params?: { status?: string; q?: string; page?: number; limit?: number }) =>
    api.get<{ data: SongRecord[]; total?: number; page?: number; limit?: number; hasMore?: boolean }>(
      '/admin/music/sound-library/catalog',
      { params }
    ),
  patchMusicSoundLibrarySong: (
    songId: string,
    body: {
      soundLibraryStatus?: 'none' | 'pending' | 'approved' | 'rejected';
      soundLibraryNote?: string;
      soundLibraryRejectedReason?: string;
    }
  ) => api.patch<{ data: SongRecord }>(`/admin/music/sound-library/songs/${songId}`, body),
  getMusicSoundLibraryStats: () =>
    api.get<{
      data: {
        counts: { pending: number; approved: number; rejected: number; none: number };
        topByClips: Array<{ songId?: string; clips: number; views: number; song: SongRecord | null }>;
      };
    }>('/admin/music/sound-library/stats'),

  /** Admin linear QwertyTV channel (24/7 VOD queue + EPG + transport controls). */
  getTvChannelPrograms: () => api.get('/admin/tv-channel/programs'),
  getTvChannelNowAdmin: () => api.get('/admin/tv-channel/now'),
  uploadTvChannelVideo: (
    video: File,
    metadata: {
      title?: string;
      description?: string;
      genre?: string;
      durationSeconds?: number;
      sortOrder?: number;
      scheduleMode?: 'queue' | 'fixed';
      scheduledStart?: string;
      scheduledEnd?: string;
    }
  ) => {
    const fd = new FormData();
    fd.append('video', video);
    if (metadata.title) fd.append('title', metadata.title);
    if (metadata.description) fd.append('description', metadata.description);
    if (metadata.genre) fd.append('genre', metadata.genre);
    if (metadata.durationSeconds != null) fd.append('durationSeconds', String(metadata.durationSeconds));
    if (metadata.sortOrder != null) fd.append('sortOrder', String(metadata.sortOrder));
    if (metadata.scheduleMode) fd.append('scheduleMode', metadata.scheduleMode);
    if (metadata.scheduledStart) fd.append('scheduledStart', metadata.scheduledStart);
    if (metadata.scheduledEnd) fd.append('scheduledEnd', metadata.scheduledEnd);
    return api.post('/admin/tv-channel/upload', fd, { timeout: API_UPLOAD_TIMEOUT_MS });
  },
  patchTvChannelProgram: (id: string, data: Record<string, unknown>) =>
    api.patch(`/admin/tv-channel/programs/${id}`, data),
  deleteTvChannelProgram: (id: string) => api.delete(`/admin/tv-channel/programs/${id}`),
  reorderTvChannelPrograms: (orderedIds: string[]) =>
    api.post('/admin/tv-channel/reorder', { orderedIds }),
  tvChannelPlay: () => api.post('/admin/tv-channel/controls/play'),
  tvChannelPause: () => api.post('/admin/tv-channel/controls/pause'),
  tvChannelSkip: () => api.post('/admin/tv-channel/controls/skip'),
  tvChannelSeek: (positionMs: number) => api.post('/admin/tv-channel/controls/seek', { positionMs }),
  tvChannelStartProgram: (programId: string) =>
    api.post('/admin/tv-channel/controls/start-program', { programId }),

  /** Per-country WhatsApp lines + default currency (support / disputes reference; does not change Twilio flows). */
  getCountryProfiles: () =>
    api.get<{
      data: Array<{
        _id: string;
        countryCode: string;
        countryName: string;
        whatsappNumber?: string;
        whatsappLabel?: string;
        whatsappNumber2?: string;
        whatsappLabel2?: string;
        macgyverWaTwilioPool1?: string;
        macgyverWaTwilioPool2?: string;
        currencyCode: string;
        supportNotes?: string;
        sortOrder: number;
        active: boolean;
      }>;
    }>('/admin/country-profiles'),
  createCountryProfile: (data: {
    countryCode: string;
    countryName: string;
    whatsappNumber?: string;
    whatsappLabel?: string;
    whatsappNumber2?: string;
    whatsappLabel2?: string;
    macgyverWaTwilioPool1?: string;
    macgyverWaTwilioPool2?: string;
    currencyCode?: string;
    supportNotes?: string;
    sortOrder?: number;
    active?: boolean;
  }) => api.post('/admin/country-profiles', data),
  patchCountryProfile: (countryCode: string, data: Record<string, unknown>) =>
    api.patch(`/admin/country-profiles/${encodeURIComponent(countryCode)}`, data),
  deleteCountryProfile: (countryCode: string) =>
    api.delete(`/admin/country-profiles/${encodeURIComponent(countryCode)}`),

  /** Marketplace product enquiries (buyer ↔ seller threads). */
  getProductEnquiriesAdmin: (params?: { page?: number; limit?: number; q?: string }) =>
    api.get<{ data: unknown[]; pagination: { total: number; page: number; limit: number; pages: number } }>(
      '/admin/product-enquiries',
      { params }
    ),
};

/** Public linear channel “now playing” (QwertyTV strip + `/morongwa-tv/channel`). */
export const tvChannelAPI = {
  getNow: () =>
    api.get<{
      data: {
        current: Record<string, unknown> | null;
        isPaused: boolean;
        positionMs: number;
        durationMs: number;
        next: Record<string, unknown> | null;
        queue: Record<string, unknown>[];
        serverTime: string;
      };
    }>('/tv-channel/now'),
};

export const advertiserAdsAPI = {
  signUp: (data: { businessName: string; email: string; phone: string; password: string }) =>
    api.post('/adverts/advertiser/signup', data),
  verifyOtp: (data: { phone: string; otp: string }) =>
    api.post('/adverts/advertiser/verify-otp', data),
  login: (data: { email: string; password: string }) =>
    api.post('/adverts/advertiser/login', data),
  createCampaign: (token: string, data: Record<string, unknown>) =>
    api.post('/adverts/create', data, { headers: { Authorization: `Bearer ${token}` } }),
  getPerformance: (token: string) =>
    api.get('/adverts/performance', { headers: { Authorization: `Bearer ${token}` } }),
  payCampaign: (token: string, data: { amount: number; method: 'card' | 'wallet' | 'bank_transfer' }) =>
    api.post('/adverts/payment', data, { headers: { Authorization: `Bearer ${token}` } }),
  /** Spec path: POST /api/ads/wallet/topup */
  walletTopup: (token: string, data: { amount: number; method?: string }) =>
    api.post('/ads/wallet/topup', data, { headers: { Authorization: `Bearer ${token}` } }),
  walletSummary: (token: string) =>
    api.get('/ads/wallet/summary', { headers: { Authorization: `Bearer ${token}` } }),
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
    api.get<{
      user: any;
      postCount: number;
      imageCount: number;
      videoCount: number;
      musicCount: number;
      musicUploadCount: number;
      followerCount: number;
      followingCount: number;
      schoolPage?: {
        canEditProfile: boolean;
        canManageManagers: boolean;
        managerCount: number;
        isOwner: boolean;
      } | null;
      publicProfileKind?: 'individual' | 'school' | 'business';
    }>(`/users/${id}/profile-stats`),
  updateProfile: (
    id: string,
    data: {
      name?: string;
      username?: string;
      phone?: string;
      isPrivate?: boolean;
      avatar?: string;
      stripBackgroundPic?: string;
      profileGalleryUrls?: string[];
      schoolPublicEmail?: string;
      showPhonePublicly?: boolean;
      publicProfileLocation?: {
        enabled: boolean;
        label?: string;
        lat?: number;
        lng?: number;
      } | null;
    }
  ) => api.put(`/users/${id}`, data),
  removeGalleryPhoto: (id: string, url: string) =>
    api.post<{ message: string; user: any; profileGalleryUrls: string[] }>(
      `/users/${id}/remove-gallery-photo`,
      { url }
    ),
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
  uploadRunnerIdDocument: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('document', file);
    return api.post(`/users/${id}/runner-id-document`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadRunnerProofOfResidence: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('document', file);
    return api.post(`/users/${id}/runner-proof-of-residence`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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
  /** Upload 1–10 product images. Returns { urls: string[] }. */
  uploadImages: (files: File[], supplierId?: string) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('images', f));
    if (supplierId) formData.append('supplierId', supplierId);
    return api.post<{ urls: string[] }>('/products/upload-images', formData, {
      timeout: API_UPLOAD_TIMEOUT_MS,
      params: supplierId ? { supplierId } : undefined,
    });
  },
  create: (data: {
    supplierId?: string;
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
  add: (productId: string, qty?: number, resellerId?: string, selectedColor?: string, selectedSize?: string) =>
    api.post('/cart', { productId, qty: qty ?? 1, resellerId, selectedColor, selectedSize }),
  addMusic: (songId: string, qty?: number) =>
    api.post('/cart', { type: 'music', songId, qty: qty ?? 1 }),
  updateItem: (productId: string, qty: number, selectedColor?: string, selectedSize?: string) =>
    api.put(`/cart/item/${productId}`, { qty, selectedColor, selectedSize }),
  removeItem: (productId: string, selectedColor?: string, selectedSize?: string) =>
    api.delete(`/cart/item/${productId}`, {
      params: {
        ...(selectedColor ? { selectedColor } : {}),
        ...(selectedSize ? { selectedSize } : {}),
      },
    }),
  removeMusicItem: (songId: string) => api.delete(`/cart/music/${songId}`),
};

const CHECKOUT_QUOTE_TIMEOUT_MS = 90_000;
const COURIER_OPTIONS_TIMEOUT_MS = 45_000;

export const checkoutAPI = {
  getPaxiCatalog: (params?: { country?: string }) =>
    api.get('/checkout/paxi-catalog', { params, timeout: 15_000 }),
  getCourierGuyCatalog: (params?: { country?: string }) =>
    api.get('/checkout/courier-guy-catalog', { params, timeout: 15_000 }),
  getSadcCatalog: (params: {
    country: string;
    scope: 'local' | 'crossborder';
    quoteInNativeCurrency?: boolean;
  }) =>
    api.get('/checkout/sadc-catalog', {
      params: {
        country: params.country,
        scope: params.scope,
        ...(params.quoteInNativeCurrency ? { quoteInNativeCurrency: 'true' } : {}),
      },
      timeout: 15_000,
    }),
  getCourierOptions: (params?: { country?: string; itemCount?: number }) =>
    api.get('/checkout/courier-options', { params, timeout: COURIER_OPTIONS_TIMEOUT_MS }),
  quote: (params?: {
    deliveryAddress?: string;
    deliveryCity?: string;
    deliveryCountry?: string;
    courierTariffId?: string;
    crossborderCourierTariffId?: string;
    deliveryScope?: 'local' | 'crossborder';
  }) =>
    api.post(
      '/checkout/quote',
      {
        deliveryCountry: params?.deliveryCountry ?? 'ZA',
        deliveryAddress: params?.deliveryAddress,
        deliveryCity: params?.deliveryCity,
        courierTariffId: params?.courierTariffId,
        crossborderCourierTariffId: params?.crossborderCourierTariffId,
        deliveryScope: params?.deliveryScope,
      },
      { timeout: CHECKOUT_QUOTE_TIMEOUT_MS }
    ),
  pay: (
    paymentMethod: 'wallet' | 'card' | 'eft' | 'orange_money',
    deliveryAddress: string,
    deliveryCountry?: string,
    courierTariffId?: string,
    deliveryScope?: 'local' | 'crossborder',
    crossborderCourierTariffId?: string,
    deliveryCity?: string
  ) =>
    api.post('/checkout/pay', {
      paymentMethod,
      deliveryAddress,
      deliveryCity,
      deliveryCountry: deliveryCountry ?? 'ZA',
      courierTariffId,
      crossborderCourierTariffId,
      deliveryScope,
    }),
  getOrder: (orderId: string) => api.get(`/checkout/order/${orderId}`),
  cancelPayment: (orderId: string) =>
    api.post(`/checkout/order/${orderId}/cancel-payment`),
  getMyOrders: (params?: { page?: number; limit?: number }) =>
    api.get('/checkout/orders/me', { params }),
  openParcelDispute: (orderId: string, reason: string) =>
    api.post(`/checkout/order/${orderId}/dispute`, { reason }),
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
  getProductsBySlug: (slug: string) => api.get(`/stores/by-slug/${slug}/products`),
  search: (params: { q: string; limit?: number }) => api.get('/stores/search', { params }),
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
  getPost: (id: string, params?: { creatorId?: string }) => api.get(`/tv/${id}`, { params }),
  getFeed: (params?: { page?: number; limit?: number; sort?: 'newest' | 'trending' | 'random'; type?: 'video' | 'image' | 'carousel' | 'product' | 'images' | 'audio' | 'text'; creatorId?: string; q?: string; genre?: string; hideProducts?: boolean }) => {
    const { hideProducts, ...rest } = params ?? {};
    return api.get('/tv', { params: { ...rest, ...(hideProducts ? { hideProducts: '1' } : {}) } });
  },
  getStatuses: () => api.get('/tv/statuses'),
  getTrendingHashtags: (limit?: number, days?: number, mode: 'latest' | 'popular' = 'latest') =>
    api.get<{ data: { tag: string; count: number }[]; windowDays?: number }>('/tv/hashtags/trending', {
      params: { limit, days, mode, _t: Date.now() },
    }),
  getHashtagAccounts: (tag: string, limit?: number) =>
    api.get<{ data: Array<{ _id: string; name?: string; avatar?: string; username?: string }>; tag?: string }>(
      `/tv/hashtags/${encodeURIComponent(tag.replace(/^#/, '').trim())}/accounts`,
      { params: limit ? { limit } : undefined }
    ),
  getRelatedHashtags: (tag: string, limit?: number, days?: number) =>
    api.get<{ data: { tag: string; count: number }[]; tag?: string; windowDays?: number }>(
      `/tv/hashtags/${encodeURIComponent(tag.replace(/^#/, '').trim())}/related`,
      { params: { limit, days, _t: Date.now() } }
    ),
  uploadMedia: (
    file: File,
    opts?: { onUploadProgress?: (pct: number) => void }
  ) => {
    const normalized = normalizeUploadFile(file);
    const formData = new FormData();
    formData.append('media', normalized, normalized.name || file.name || 'media');
    return api.post<{ url: string; sensitive?: boolean }>('/tv/upload', formData, {
      baseURL: resolveBrowserUploadApiUrl(),
      timeout: API_UPLOAD_TIMEOUT_MS,
      onUploadProgress: (ev) => {
        if (!opts?.onUploadProgress || !ev.total) return;
        opts.onUploadProgress(Math.round((ev.loaded * 100) / ev.total));
      },
    });
  },
  uploadImages: (
    files: File[],
    opts?: { onUploadProgress?: (pct: number) => void }
  ) => {
    const formData = new FormData();
    files.forEach((f) => {
      const normalized = normalizeUploadFile(f);
      formData.append('images', normalized, normalized.name || f.name);
    });
    return api.post<{ urls: string[]; sensitive?: boolean }>('/tv/upload-images', formData, {
      baseURL: resolveBrowserUploadApiUrl(),
      timeout: API_UPLOAD_TIMEOUT_MS,
      onUploadProgress: (ev) => {
        if (!opts?.onUploadProgress || !ev.total) return;
        opts.onUploadProgress(Math.round((ev.loaded * 100) / ev.total));
      },
    });
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
  updatePost: (
    id: string,
    data: {
      caption?: string;
      heading?: string;
      subject?: string;
      hashtags?: string[];
      filter?: string;
      genre?: string;
    }
  ) => api.patch(`/tv/${id}`, data),
  deletePost: (id: string) => api.delete(`/tv/${id}`),
  getComments: (id: string) => api.get(`/tv/${id}/comments`),
  uploadCommentAudio: (file: File) => {
    const formData = new FormData();
    formData.append('audio', file);
    return api.post<{ data: { url: string } }>('/tv/comments/upload-audio', formData, { timeout: API_UPLOAD_TIMEOUT_MS });
  },
  addComment: (id: string, payload: string | { text?: string; audioUrl?: string }) => {
    if (typeof payload === 'string') return api.post(`/tv/${id}/comments`, { text: payload });
    return api.post(`/tv/${id}/comments`, payload);
  },
  getWatermark: () => api.get<{ data: { watermark: string } }>('/tv/watermark'),
  getFeaturedProducts: (hideProducts?: boolean) =>
    api.get('/tv/products/featured', { params: hideProducts ? { hideProducts: '1' } : undefined }),
};

export type LivePlaybackData = {
  isLive: boolean;
  hlsUrl: string | null;
  liveStartedAt: string | null;
  /** Present when live — used for viewer telemetry only. */
  streamKey?: string | null;
  user: { name?: string; avatar?: string };
};

/** URLs returned when starting a session (OBS + HLS). */
export type LivestreamSessionUrls = {
  hlsUrl: string;
  rtmpUrl: string;
  obsServerUrl: string;
  streamKey: string;
};

export type LiveSessionData = {
  isLive: boolean;
  liveStreamName: string | null;
  liveStartedAt: string | null;
  urls: LivestreamSessionUrls | null;
};

export const liveAPI = {
  getConfig: () =>
    api.get<{ data: { playbackConfigured: boolean; publishConfigured: boolean } }>('/live/config'),
  /** Current user’s live session + OBS targets (auth). */
  getSession: () => api.get<{ data: LiveSessionData }>('/live/session'),
  /** Allocate stream key, set isLive, return OBS/HLS URLs (auth; requires server RTMP config). */
  start: () =>
    api.post<{ message?: string; data: { isLive: boolean; liveStreamName: string; liveStartedAt?: string; urls: LivestreamSessionUrls } }>(
      '/live/start'
    ),
  /** End broadcast and clear stream fields (auth). */
  stop: () => api.post<{ message?: string; data: { isLive: boolean } }>('/live/stop'),
  getPlayback: (userId: string) => api.get<{ data: LivePlaybackData }>(`/live/playback/${userId}`),
  /** Viewer playback telemetry (buffering, errors, heartbeats). Server validates stream is live. */
  reportMetric: (data: {
    broadcasterUserId: string;
    streamKey: string;
    eventType: 'play_start' | 'heartbeat' | 'buffer_stall' | 'error' | 'fatal_error' | 'ended';
    message?: string;
    sessionId?: string;
  }) => api.post<{ ok: boolean }>('/live/metrics/report', data),
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
  soundLibraryStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  soundLibraryRejectedReason?: string;
  soundLibraryRequestedAt?: string;
  soundLibraryReviewedAt?: string;
}

export const musicAPI = {
  getGenres: () => api.get<{ data: { id: string; label: string }[] }>('/music/genres'),
  getArtistStatus: () => api.get<{ data: { isVerified: boolean; status: string | null; type: string | null } }>('/music/artist-status'),
  /** Approved Sounds catalog for QwertyTV video picker */
  listSounds: (params?: { q?: string; page?: number; limit?: number }) =>
    api.get<{ data: SongRecord[]; page?: number; limit?: number; total?: number; hasMore?: boolean }>('/music/sounds', {
      params,
    }),
  /** Logged-in artist: own uploads + sound-library status */
  getMyMusicCatalog: () => api.get<{ data: SongRecord[] }>('/music/me/catalog'),
  requestSoundLibrary: (songId: string) =>
    api.post<{ ok: boolean; data: { soundLibraryStatus: string } }>(`/music/sound-library/request/${songId}`),
  getSongs: (params?: { type?: 'song' | 'album'; page?: number; limit?: number; random?: boolean }) =>
    api.get<{ data: SongRecord[]; page?: number; limit?: number; total?: number; hasMore?: boolean }>('/music/songs', {
      params: { ...params, random: params?.random ? '1' : undefined },
    }),
  uploadAudio: (file: File) => {
    const formData = new FormData();
    formData.append('audio', file);
    return api.post<{ data: { url: string } }>('/music/upload-audio', formData, { timeout: API_UPLOAD_TIMEOUT_MS });
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
    return api.post<{ data: SongRecord }>('/music/upload-song', formData, { timeout: API_UPLOAD_TIMEOUT_MS });
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
    return api.post<{ data: SongRecord }>('/music/upload-album', formData, { timeout: API_UPLOAD_TIMEOUT_MS });
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
  getMe: () => api.get<{ data: unknown; profiles?: Array<{ _id: string; storeName?: string; country?: string; countryCode?: string }> }>('/suppliers/me'),
  getProfiles: () =>
    api.get<{
      data: Array<{ _id: string; storeName?: string; country?: string; countryCode?: string }>;
    }>('/suppliers/me/profiles'),
  getMyProducts: (supplierId?: string) =>
    api.get('/suppliers/me/products', { params: supplierId ? { supplierId } : undefined }),
};

export const macgyverAPI = {
  ask: (query: string) =>
    api.post<{ data: { text?: string; error?: string; type?: string; query?: string; message?: string } }>('/macgyver/ask', { query }),
};
