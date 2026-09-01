import express, { NextFunction, Response } from "express";
import multer from "multer";
import path from "path";
import { authenticate, AuthRequest } from "../middleware/auth";
import { handleAskMacGyver, handleAskMacGyverFromImage } from "../services/macgyverService";

const router = express.Router();

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const IMAGE_EXTS: Record<string, Set<string>> = {
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/gif": new Set([".gif"]),
  "image/webp": new Set([".webp"]),
};

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype;
    if (!IMAGE_MIMES.has(mime)) {
      cb(new Error("Only image files are allowed (JPEG, PNG, GIF, WebP)."));
      return;
    }
    file.mimetype = mime;
    const ext = path.extname(String(file.originalname || "")).toLowerCase();
    // Phone camera captures often omit a filename/extension — allow by MIME alone.
    if (ext) {
      const allowed = IMAGE_EXTS[mime];
      if (!allowed?.has(ext)) {
        cb(new Error("Invalid image file extension."));
        return;
      }
    }
    cb(null, true);
  },
});

function uploadMacGyverImage(req: AuthRequest, res: Response, next: NextFunction) {
  imageUpload.single("image")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : "Invalid image upload.";
    if (code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ message: "Image is too large (max 8 MB)." });
      return;
    }
    res.status(400).json({ message });
  });
}

/**
 * POST /api/macgyver/ask
 * Ask MacGyver: static FAQ → learned DB → platform search → open web snippets → OpenAI synthesis.
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

/**
 * POST /api/macgyver/ask-image
 * Image search: vision caption → MacGyver ask (platform + web + LLM).
 * Multipart: image (required), hint (optional text field).
 */
router.post(
  "/ask-image",
  authenticate,
  uploadMacGyverImage,
  async (req: AuthRequest, res: Response, next) => {
    try {
      const file = req.file;
      if (!file?.buffer?.length) {
        res.status(400).json({ message: "Image file is required." });
        return;
      }
      const hint = typeof req.body?.hint === "string" ? req.body.hint.trim() : "";
      const result = await handleAskMacGyverFromImage(file.buffer, file.mimetype, hint);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
