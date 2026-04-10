import express, { Response } from "express";
import Follow from "../data/models/Follow";
import User from "../data/models/User";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";

const router = express.Router();

// Friend request a user (force pending regardless of target privacy)
router.post("/friend/:userId", authenticate, async (req: AuthRequest, res: Response, next) => {
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
      return res.json({ message: "Friend request already sent", data: existing });
    }

    // Always require approval: store as pending
    const follow = await Follow.create({
      followerId,
      followingId,
      status: "pending",
    });

    const populated = await Follow.findById(follow._id)
      .populate("followerId", "name avatar")
      .populate("followingId", "name avatar")
      .lean();

    res.status(201).json({
      message: "Friend request sent",
      data: populated,
    });
  } catch (err) {
    next(err);
  }
});

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

// Get suggested users (random, or search-filtered when q provided - MacGyver super search)
router.get("/suggested", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const currentId = req.user!._id;
    const limit = Math.min(parseInt((req.query.limit as string) || "5") || 5, 30);
    const search = (req.query.q as string)?.trim()?.toLowerCase() || "";

    const followingIds = await Follow.find({ followerId: currentId }).distinct("followingId");

    const excludeIds = [currentId, ...followingIds];

    const baseMatch: any = {
      _id: { $nin: excludeIds },
      active: { $ne: false },
      suspended: { $ne: true },
      role: { $nin: ["admin", "superadmin"] },
    };
    if (search.length >= 1) {
      baseMatch.$or = [
        { name: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ];
    }

    const searchLen = search.length;
    const sortOrSample = searchLen >= 1
      ? [
          {
            $addFields: {
              _relevance: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $or: [
                          { $eq: [{ $toLower: { $substrCP: [{ $ifNull: ["$name", ""] }, 0, searchLen] } }, search] },
                          { $eq: [{ $toLower: { $substrCP: [{ $ifNull: ["$username", ""] }, 0, searchLen] } }, search] },
                        ],
                      },
                      then: 2,
                    },
                    {
                      case: {
                        $or: [
                          { $gt: [{ $indexOfCP: [{ $toLower: { $ifNull: ["$name", ""] } }, search] }, -1] },
                          { $gt: [{ $indexOfCP: [{ $toLower: { $ifNull: ["$username", ""] } }, search] }, -1] },
                        ],
                      },
                      then: 1,
                    },
                  ],
                  default: 0,
                },
              },
            },
          },
          { $sort: { _relevance: -1 as 1 | -1, name: 1 as 1 | -1 } },
          { $limit: limit },
          { $project: { _relevance: 0 } },
        ]
      : [{ $sample: { size: limit } }];

    const suggested = await User.aggregate([
      { $match: baseMatch },
      ...sortOrSample,
      {
        $lookup: {
          from: "follows",
          let: { uid: "$_id" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$followingId", "$$uid"] }, { $eq: ["$status", "accepted"] }] } } },
            { $count: "count" },
          ],
          as: "followerCountArr",
        },
      },
      {
        $addFields: {
          followerCount: { $ifNull: [{ $arrayElemAt: ["$followerCountArr.count", 0] }, 0] },
        },
      },
      { $project: { passwordHash: 0, followerCountArr: 0 } },
    ]);

    res.json({ data: suggested });
  } catch (err) {
    next(err);
  }
});

// Get followers for a user (accepted only)
router.get("/:userId/followers", async (req: AuthRequest, res: Response, next) => {
  try {
    const followingId = req.params.userId;
    const followers = await Follow.find({ followingId, status: "accepted" })
      .populate("followerId", "name avatar username")
      .sort({ createdAt: -1 })
      .lean();
    const users = followers
      .map((f: any) => f.followerId)
      .filter(Boolean);
    res.json({ data: users });
  } catch (err) {
    next(err);
  }
});

// Get accounts a user follows (accepted only)
router.get("/:userId/following", async (req: AuthRequest, res: Response, next) => {
  try {
    const followerId = req.params.userId;
    const following = await Follow.find({ followerId, status: "accepted" })
      .populate("followingId", "name avatar username")
      .sort({ createdAt: -1 })
      .lean();
    const users = following
      .map((f: any) => f.followingId)
      .filter(Boolean);
    res.json({ data: users });
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
