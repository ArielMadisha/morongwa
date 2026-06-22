import express, { Response } from "express";
import { getChannelNowPayload } from "../services/tvChannelRuntime";

const router = express.Router();

/** Public: current linear channel programme (QwertyTV / apps poll this). */
router.get("/now", async (_req, res: Response, next) => {
  try {
    const data = await getChannelNowPayload();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
