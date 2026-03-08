import express, { Response } from "express";
import LandingBackground from "../data/models/LandingBackground";

const router = express.Router();

/** Public: Get active landing backgrounds for login/register pages */
router.get("/", async (_req: express.Request, res: Response) => {
  try {
    const items = await LandingBackground.find({ active: true })
      .sort({ order: 1 })
      .lean();
    res.json({ data: items });
  } catch (err) {
    res.status(500).json({ error: "Failed to load backgrounds" });
  }
});

export default router;
