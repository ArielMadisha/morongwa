import multer from "multer";
import path from "path";
import fs from "fs";

const destDir = path.join(process.cwd(), "uploads", "wa-adverts");
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, destDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || (file.mimetype === "video/quicktime" ? ".mov" : ".mp4");
    const safe = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 48) || "ad";
    cb(null, `wam-${Date.now()}-${Math.round(Math.random() * 1e9)}-${safe}${ext.toLowerCase()}`);
  },
});

const allowedMimes = new Set([
  "video/mp4",
  "video/quicktime",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const waPremenuMediaUpload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMimes.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Allowed: MP4, MOV, JPEG, PNG, GIF, WebP. Use MP4 for WhatsApp video."));
    }
  },
});
