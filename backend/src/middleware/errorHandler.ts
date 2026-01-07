// Centralized error handling middleware
import { Request, Response, NextFunction } from "express";
import { logger } from "../services/monitoring";

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || "Internal server error";

  logger.error("Error occurred:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode,
  });

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
};
