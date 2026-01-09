// Analytics routes
import express, { Response } from "express";
import { authenticate, AuthRequest, authorize } from "../middleware/auth";
import { calculatePlatformKPIs, getTaskTrends, getRunnerPerformance, getRevenueTrends } from "../services/analytics";
import { AppError } from "../middleware/errorHandler";

const router = express.Router();

// Get platform KPIs (admin only)
router.get(
  "/kpis",
  authenticate,
  authorize("admin", "superadmin"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { startDate, endDate } = req.query;

      const kpis = await calculatePlatformKPIs(
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.json({ kpis });
    } catch (err) {
      next(err);
    }
  }
);

// Get task trends (admin only)
router.get(
  "/trends/tasks",
  authenticate,
  authorize("admin", "superadmin"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { days } = req.query;
      const trends = await getTaskTrends(days ? parseInt(days as string) : 30);

      res.json({ trends });
    } catch (err) {
      next(err);
    }
  }
);

// Get revenue trends (admin only)
router.get(
  "/trends/revenue",
  authenticate,
  authorize("admin", "superadmin"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { days } = req.query;
      const trends = await getRevenueTrends(days ? parseInt(days as string) : 30);

      res.json({ trends });
    } catch (err) {
      next(err);
    }
  }
);

// Get runner performance (runner can view their own, admin can view all)
router.get("/runner/:runnerId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const runnerId = req.params.runnerId;

    const hasRole = (roles: any, r: string) => Array.isArray(roles) ? roles.includes(r) : roles === r;

    if (
      req.user!._id.toString() !== runnerId &&
      !hasRole(req.user!.role, "admin") &&
      !hasRole(req.user!.role, "superadmin")
    ) {
      throw new AppError("Unauthorized", 403);
    }

    const performance = await getRunnerPerformance(runnerId);

    res.json({ performance });
  } catch (err) {
    next(err);
  }
});

export default router;
