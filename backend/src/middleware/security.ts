// Comprehensive security middleware
import { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import { logger } from "../services/monitoring";

/** Allow web app (qwertymates.com / www) to use API + uploads from api.* (same-site, different origin). */
export const securityMiddleware = [
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
  mongoSanitize(),
];

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("Request completed", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
  });

  next();
};

export const validateInput = (req: Request, res: Response, next: NextFunction): void => {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    // Match inline handler attributes like "onclick=", not normal words containing "on...".
    /\bon\w+\s*=/i,
    /\$\{/,
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === "string") {
      return suspiciousPatterns.some((pattern) => pattern.test(value));
    }
    if (typeof value === "object" && value !== null) {
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  if (checkValue(req.body) || checkValue(req.query)) {
    // Do not log full body/query — may contain passwords, OTPs, or PII.
    logger.warn("Suspicious input detected", {
      path: req.path,
      ip: req.ip,
      bodyKeys:
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? Object.keys(req.body as object).slice(0, 40)
          : undefined,
      queryKeys:
        req.query && typeof req.query === "object"
          ? Object.keys(req.query as object).slice(0, 40)
          : undefined,
    });
    res.status(400).json({ error: "Invalid input detected" });
    return;
  }

  next();
};
