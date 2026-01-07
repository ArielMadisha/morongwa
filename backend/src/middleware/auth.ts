// Authentication and authorization middleware
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User, { IUser } from "../data/models/User";

export interface AuthRequest extends Request {
  user?: IUser;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET || "default-secret-change-me";
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };

    const user = await User.findById(decoded.userId);

    if (!user || !user.active || user.suspended || user.locked) {
      res.status(401).json({ error: "Invalid or suspended account" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const authorize = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
};
