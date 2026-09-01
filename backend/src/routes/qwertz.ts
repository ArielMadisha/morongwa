import express, { Response } from "express";
import multer from "multer";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = express.Router();

const QWERTZ_API_URL = (process.env.QWERTZ_API_URL || "http://localhost:4100").replace(/\/$/, "");
const QWERTZ_API_KEY = (process.env.QWERTZ_API_KEY || "").trim();

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 120 * 1024 * 1024 },
});

function qwertzHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (QWERTZ_API_KEY) h["X-Qwertz-Api-Key"] = QWERTZ_API_KEY;
  return h;
}

async function forwardJson(
  req: AuthRequest,
  res: Response,
  method: string,
  qwertzPath: string,
  body?: unknown
): Promise<void> {
  if (!QWERTZ_API_URL) {
    res.status(503).json({ error: "Qwertz service not configured", message: "Set QWERTZ_API_URL" });
    return;
  }
  try {
    const headers = qwertzHeaders();
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const r = await fetch(`${QWERTZ_API_URL}/api/v1${qwertzPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json: unknown = text;
    try {
      json = JSON.parse(text);
    } catch {
      /* plain text */
    }
    res.status(r.status).json(typeof json === "object" ? json : { data: json });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "Qwertz upstream unavailable", message });
  }
}

router.get("/health", async (_req, res) => {
  if (!QWERTZ_API_URL) {
    res.status(503).json({ error: "Qwertz not configured" });
    return;
  }
  try {
    const r = await fetch(`${QWERTZ_API_URL}/api/v1/health`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Qwertz health check failed", message: String(err) });
  }
});

router.use(authenticate);

router.post("/videos/upload", videoUpload.single("video"), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "Missing video file (field: video)" });
    return;
  }
  if (!QWERTZ_API_URL) {
    res.status(503).json({ error: "Qwertz service not configured" });
    return;
  }
  try {
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    form.append("video", blob, req.file.originalname || "upload.mp4");
    const r = await fetch(`${QWERTZ_API_URL}/api/v1/videos/upload`, {
      method: "POST",
      headers: qwertzHeaders(),
      body: form,
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "Qwertz upload failed", message: String(err) });
  }
});

router.post("/videos/:id/edit", (req: AuthRequest, res) => {
  void forwardJson(req, res, "POST", `/videos/${req.params.id}/edit`, req.body);
});

router.get("/videos/:id", (req: AuthRequest, res) => {
  void forwardJson(req, res, "GET", `/videos/${req.params.id}`);
});

router.get("/jobs/:jobId", (req: AuthRequest, res) => {
  void forwardJson(req, res, "GET", `/jobs/${req.params.jobId}`);
});

router.post("/videos/:id/export/qwertymates", (req: AuthRequest, res) => {
  void forwardJson(req, res, "POST", `/videos/${req.params.id}/export/qwertymates`, req.body);
});

router.post("/videos/:id/export/whatsapp", (req: AuthRequest, res) => {
  void forwardJson(req, res, "POST", `/videos/${req.params.id}/export/whatsapp`, req.body);
});

router.delete("/videos/:id", (req: AuthRequest, res) => {
  void forwardJson(req, res, "DELETE", `/videos/${req.params.id}`);
});

router.post("/ai/captions", (req: AuthRequest, res) => {
  void forwardJson(req, res, "POST", "/ai/captions", req.body);
});

router.post("/ai/hashtags", (req: AuthRequest, res) => {
  void forwardJson(req, res, "POST", "/ai/hashtags", req.body);
});

router.get("/templates", (req: AuthRequest, res) => {
  void forwardJson(req, res, "GET", "/templates");
});

export default router;
