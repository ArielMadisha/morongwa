import express, { Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { handleAskMacGyver } from "../services/macgyverService";

const router = express.Router();

/**
 * POST /api/macgyver/ask
 * Ask MacGyver a question. Uses OpenAI for Qwertymates + general knowledge.
 * Body: { query: string }
 */
router.post("/ask", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const result = await handleAskMacGyver(query);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
