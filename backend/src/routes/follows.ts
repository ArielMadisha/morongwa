import express, { Response } from "express";
import Follow from "../data/models/Follow";
import User from "../data/models/User";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = express.Router();

// Follow a user
router.post("/:userId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const followerId = req.user!._id;
    const followingId = req.params.userId;
    if (followerId.toString() === followingId) {
      throw new AppError("You cannot follow yourself", 400);
    }
    const targetUser = await User.findById(followingId);
    if (!targetUser) throw new AppError("User not found", 404);

    const existing = await Follow.findOne({ followerId, followingId });
    if (existing) {
      if (existing.status === "accepted") {
        return res.json({ message: "Already following", data: existing });
      }
      return res.json({ message: "Follow request already sent", data: existing });
    }

    const status = (targetUser as any).isPrivate ? "pending" : "accepted";
    const follow = await Follow.create({
      followerId,
      followingId,
      status,
    });
    const populated = await Follow.findById(follow._id)
      .populate("followerId", "name avatar")
      .populate("followingId", "name avatar")
      .lean();
    res.status(201).json({
      message: status === "pending" ? "Follow request sent" : "Now following",
      data: populated,
    });
  } catch (err) {
    next(err);
  }
});

// Unfollow
router.delete("/:userId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const followerId = req.user!._id;
    const followingId = req.params.userId;
    const result = await Follow.findOneAndDelete({ followerId, followingId });
    if (!result) throw new AppError("Not following this user", 404);
    res.json({ message: "Unfollowed" });
  } catch (err) {
    next(err);
  }
});

// Accept follow request (for private accounts)
router.post("/:followerId/accept", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const followingId = req.user!._id; // the account owner
    const followerId = req.params.followerId;
    const follow = await Follow.findOne({ followerId, followingId, status: "pending" });
    if (!follow) throw new AppError("Follow request not found", 404);
    (follow as any).status = "accepted";
    await follow.save();
    res.json({ message: "Follow request accepted", data: follow });
  } catch (err) {
    next(err);
  }
});

// Reject follow request
router.post("/:followerId/reject", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const followingId = req.user!._id;
    const followerId = req.params.followerId;
    const result = await Follow.findOneAndDelete({ followerId, followingId, status: "pending" });
    if (!result) throw new AppError("Follow request not found", 404);
    res.json({ message: "Follow request rejected" });
  } catch (err) {
    next(err);
  }
});

// Get pending follow requests (for private account owners)
router.get("/requests/pending", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const followingId = req.user!._id;
    const requests = await Follow.find({ followingId, status: "pending" })
      .populate("followerId", "name avatar email")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: requests });
  } catch (err) {
    next(err);
  }
});

// Check if current user follows target
router.get("/:userId/status", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const followerId = req.user!._id;
    const followingId = req.params.userId;
    const follow = await Follow.findOne({ followerId, followingId }).lean();
    res.json({
      following: !!follow,
      status: follow ? (follow as any).status : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
