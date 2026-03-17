/**
 * FX rates API – for frontend currency conversion
 */

import { Router, Request, Response } from "express";
import { getFxRates } from "../services/fxService";

const router = Router();

/** GET /api/fx/rates – returns USD base rates (ZAR, EUR, etc.) */
router.get("/rates", async (_req: Request, res: Response) => {
  try {
    const { base, rates } = await getFxRates();
    res.json({ base, rates });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch FX rates" });
  }
});

export default router;
