// Joi validation schemas for request validation
import Joi from "joi";

export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().optional(),
  username: Joi.string().min(2).max(30).pattern(/^[a-zA-Z0-9_]+$/).optional(),
  password: Joi.string().min(8).required(),
  dateOfBirth: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required()
    .messages({
      "string.pattern.base": "Date of birth must be in YYYY-MM-DD format",
    }),
  role: Joi.alternatives().try(
    Joi.string().valid("client", "runner"),
    Joi.array().items(Joi.string().valid("client", "runner"))
  ).optional(),
  phone: Joi.string().optional(),
  otpToken: Joi.string().optional(),
}).or("email", "otpToken");

export const sendOtpSchema = Joi.object({
  phone: Joi.string().min(10).max(20).required(),
  channel: Joi.string().valid("sms", "whatsapp").default("whatsapp"),
});

export const verifyOtpSchema = Joi.object({
  phone: Joi.string().min(10).max(20).required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().optional(),
  username: Joi.string().optional(),
  phone: Joi.string().optional(),
  password: Joi.string().required(),
}).or("email", "username", "phone");

export const taskSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  description: Joi.string().min(3).max(2000).required(),
  budget: Joi.number().min(0).optional(),
  location: Joi.alternatives().try(
    Joi.string().min(2).max(500),
    Joi.object({
      type: Joi.string().valid("Point").default("Point"),
      coordinates: Joi.array().items(Joi.number()).length(2).required(),
      address: Joi.string().optional(),
    })
  ).optional(),
  pickupLocation: Joi.alternatives().try(
    Joi.string().min(2).max(500),
    Joi.object({
      type: Joi.string().valid("Point").default("Point"),
      coordinates: Joi.array().items(Joi.number()).length(2).required(),
      address: Joi.string().optional(),
    })
  ).optional(),
  deliveryLocation: Joi.alternatives().try(
    Joi.string().min(2).max(500),
    Joi.object({
      type: Joi.string().valid("Point").default("Point"),
      coordinates: Joi.array().items(Joi.number()).length(2).required(),
      address: Joi.string().optional(),
    })
  ).optional(),
  category: Joi.string().optional(),
});

export const reviewSchema = Joi.object({
  rating: Joi.number().min(1).max(5).required(),
  comment: Joi.string().max(500).optional(),
});

export const messageSchema = Joi.object({
  content: Joi.string().min(1).max(1000).required(),
});

export const topupSchema = Joi.object({
  amount: Joi.number().min(10).max(50000).required(),
  returnPath: Joi.string().pattern(/^\//).optional(),
});

export const payoutSchema = Joi.object({
  amount: Joi.number().min(10).required(),
});

export const donateSchema = Joi.object({
  recipientId: Joi.string().required(),
  amount: Joi.number().min(1).max(50000).required(),
});

export const supportTicketSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  description: Joi.string().min(10).max(2000).required(),
  category: Joi.string().required(),
  priority: Joi.string().valid("low", "medium", "high", "urgent").default("medium"),
});

export const moderationSchema = Joi.object({
  contentType: Joi.string().valid("task", "review", "message", "profile").required(),
  contentId: Joi.string().required(),
  reason: Joi.string().min(10).max(500).required(),
});

export const settingSchema = Joi.object({
  key: Joi.string().required(),
  value: Joi.any().required(),
  description: Joi.string().optional(),
});

export const passwordResetRequestSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const passwordResetSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});

export const paginationSchema = Joi.object({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(20),
});
