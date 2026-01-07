// Review routes for rating system
import express, { Response } from "express";
import Review from "../data/models/Review";
import Task from "../data/models/Task";
import AuditLog from "../data/models/AuditLog";
import { authenticate, AuthRequest } from "../middleware/auth";
import { reviewSchema } from "../utils/validators";
import { AppError } from "../middleware/errorHandler";
import { getPaginationParams } from "../utils/helpers";
import { sendNotification } from "../services/notification";

const router = express.Router();

// Create a review
router.post("/:taskId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { error } = reviewSchema.validate(req.body);
    if (error) throw new AppError(error.details[0].message, 400);

    const task = await Task.findById(req.params.taskId);
    if (!task) throw new AppError("Task not found", 404);

    if (task.status !== "completed") {
      throw new AppError("Can only review completed tasks", 400);
    }

    const reviewerId = req.user!._id;
    let revieweeId;

    if (task.client.toString() === reviewerId.toString()) {
      revieweeId = task.runner;
    } else if (task.runner?.toString() === reviewerId.toString()) {
      revieweeId = task.client;
    } else {
      throw new AppError("Unauthorized to review this task", 403);
    }

    const existingReview = await Review.findOne({
      task: task._id,
      reviewer: reviewerId,
    });

    if (existingReview) {
      throw new AppError("Review already submitted", 400);
    }

    const { rating, comment } = req.body;

    const review = await Review.create({
      task: task._id,
      reviewer: reviewerId,
      reviewee: revieweeId,
      rating,
      comment,
    });

    await AuditLog.create({
      action: "REVIEW_CREATED",
      user: reviewerId,
      target: review._id,
      meta: { taskId: task._id, rating },
    });

    await sendNotification({
      userId: revieweeId!.toString(),
      type: "NEW_REVIEW",
      message: `You received a new ${rating}-star review`,
    });

    res.status(201).json({ message: "Review submitted successfully", review });
  } catch (err) {
    next(err);
  }
});

// Get reviews for a user
router.get("/user/:userId", async (req: AuthRequest, res: Response, next) => {
  try {
    const { page, limit } = req.query;
    const { skip, limit: limitNum } = getPaginationParams(
      page ? parseInt(page as string) : undefined,
      limit ? parseInt(limit as string) : undefined
    );

    const [reviews, total] = await Promise.all([
      Review.find({ reviewee: req.params.userId })
        .populate("reviewer", "name avatar")
        .populate("task", "title")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Review.countDocuments({ reviewee: req.params.userId }),
    ]);

    const avgRating = await Review.aggregate([
      { $match: { reviewee: req.params.userId } },
      { $group: { _id: null, avgRating: { $avg: "$rating" } } },
    ]).then((res) => res[0]?.avgRating || 0);

    res.json({
      reviews,
      avgRating: parseFloat(avgRating.toFixed(2)),
      pagination: {
        total,
        page: Math.floor(skip / limitNum) + 1,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Get reviews for a task
router.get("/task/:taskId", async (req: AuthRequest, res: Response, next) => {
  try {
    const reviews = await Review.find({ task: req.params.taskId })
      .populate("reviewer", "name avatar")
      .populate("reviewee", "name avatar");

    res.json({ reviews });
  } catch (err) {
    next(err);
  }
});

export default router;
