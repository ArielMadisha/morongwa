// API client configuration with axios
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
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
  register: (data: { name: string; email: string; password: string; role: string }) =>
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
  create: (data: any) => api.post('/tasks', data),
  accept: (id: string) => api.post(`/tasks/${id}/accept`),
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
  rejectPayout: (id: string) => api.post(`/admin/payouts/${id}/reject`),
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
};
