// File sharing routes for task attachments
import express, { Response } from "express";
import FileShare from "../data/models/FileShare";
import Task from "../data/models/Task";
import AuditLog from "../data/models/AuditLog";
import { authenticate, AuthRequest } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { AppError } from "../middleware/errorHandler";

const router = express.Router();

// Upload file to task thread
router.post(
  "/task/:taskId",
  authenticate,
  upload.single("file"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const task = await Task.findById(req.params.taskId);
      if (!task) throw new AppError("Task not found", 404);

      if (
        task.client.toString() !== req.user!._id.toString() &&
        task.runner?.toString() !== req.user!._id.toString()
      ) {
        throw new AppError("Unauthorized", 403);
      }

      if (!req.file) throw new AppError("No file uploaded", 400);

      const fileShare = await FileShare.create({
        task: task._id,
        uploader: req.user!._id,
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      await AuditLog.create({
        action: "FILE_SHARED",
        user: req.user!._id,
        meta: { taskId: task._id, filename: req.file.originalname },
      });

      res.status(201).json({
        message: "File uploaded successfully",
        file: fileShare,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Get files for a task
router.get("/task/:taskId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) throw new AppError("Task not found", 404);

    if (
      task.client.toString() !== req.user!._id.toString() &&
      task.runner?.toString() !== req.user!._id.toString()
    ) {
      throw new AppError("Unauthorized", 403);
    }

    const files = await FileShare.find({ task: task._id })
      .populate("uploader", "name avatar")
      .sort({ createdAt: -1 });

    res.json({ files });
  } catch (err) {
    next(err);
  }
});

// Delete a shared file
router.delete("/:fileId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const file = await FileShare.findById(req.params.fileId);
    if (!file) throw new AppError("File not found", 404);

    if (file.uploader.toString() !== req.user!._id.toString()) {
      throw new AppError("Unauthorized", 403);
    }

    await file.deleteOne();

    await AuditLog.create({
      action: "FILE_DELETED",
      user: req.user!._id,
      meta: { fileId: file._id, filename: file.originalName },
    });

    res.json({ message: "File deleted successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
