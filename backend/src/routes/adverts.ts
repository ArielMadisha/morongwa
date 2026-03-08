import express, { Request, Response } from "express";
import Advert from "../data/models/Advert";
import { AppError } from "../middleware/errorHandler";

const router = express.Router();

/** Get active adverts by slot. Public endpoint. */
router.get("/", async (req: Request, res: Response, next) => {
  try {
    const { slot } = req.query;
    const now = new Date();

    const query: any = {
      active: true,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
      ],
    };
    if (slot && (slot === "random" || slot === "promo")) {
      query.slot = slot;
    }

    const adverts = await Advert.find(query)
      .sort({ order: 1, createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ data: adverts });
  } catch (err) {
    next(err);
  }
});

export default router;
