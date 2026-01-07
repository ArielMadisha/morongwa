// Constants for consistent enums and values across the application
export const USER_ROLES = {
  CLIENT: "client",
  RUNNER: "runner",
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
} as const;

export const TASK_STATUSES = {
  POSTED: "posted",
  ACCEPTED: "accepted",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export const PAYMENT_STATUSES = {
  PENDING: "pending",
  SUCCESSFUL: "successful",
  FAILED: "failed",
  REFUNDED: "refunded",
  DISPUTED: "disputed",
} as const;

export const TRANSACTION_TYPES = {
  DEPOSIT: "deposit",
  TOPUP: "topup",
  PAYOUT: "payout",
  ESCROW: "escrow",
  REFUND: "refund",
  PAYMENT: "payment",
  CREDIT: "credit",
  DEBIT: "debit",
} as const;

export const NOTIFICATION_CHANNELS = {
  REALTIME: "realtime",
  EMAIL: "email",
  SMS: "sms",
  PUSH: "push",
  BROADCAST: "broadcast",
} as const;

export const SUPPORT_PRIORITIES = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export const SUPPORT_STATUSES = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  CLOSED: "closed",
  ESCALATED: "escalated",
} as const;

export const MODERATION_STATUSES = {
  PENDING: "pending",
  REVIEWED: "reviewed",
  ACTIONED: "actioned",
  DISMISSED: "dismissed",
} as const;

export const SECURITY_SEVERITIES = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;
