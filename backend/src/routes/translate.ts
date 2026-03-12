import express, { Request, Response } from "express";
import { translate } from "@vitalets/google-translate-api";
import { AppError } from "../middleware/errorHandler";

const router = express.Router();

const SUPPORTED_LANGUAGES = [
  "en", "af", "zu", "xh", "st", "tn", "ss", "ve", "ts", "nso", "fr", "es", "pt", "de", "zh", "ar", "hi", "ja", "ko",
] as const;

// GET /api/translate?text=...&target=en&source=auto
router.get("/", async (req: Request, res: Response, next) => {
  try {
    const text = (req.query.text as string)?.trim();
    const target = ((req.query.target as string) || "en").toLowerCase();
    const source = ((req.query.source as string) || "auto").toLowerCase();

    if (!text || text.length > 5000) {
      throw new AppError("Text is required and must be under 5000 characters", 400);
    }

    if (source !== "auto" && !SUPPORTED_LANGUAGES.includes(source as any)) {
      throw new AppError("Unsupported source language", 400);
    }
    if (!SUPPORTED_LANGUAGES.includes(target as any)) {
      throw new AppError("Unsupported target language", 400);
    }

    const result = await translate(text, {
      from: source,
      to: target,
    });

    res.json({
      translatedText: result.text,
      detectedLanguage: (result.raw as any)?.from?.language?.iso ?? source,
    });
  } catch (err: any) {
    if (err.name === "TooManyRequestsError") {
      return next(new AppError("Translation rate limit exceeded. Please try again later.", 429));
    }
    next(err);
  }
});

export default router;
