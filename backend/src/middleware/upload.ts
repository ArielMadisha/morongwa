// File upload middleware using Multer
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(__dirname, "../../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/** MIME → allowed extensions (defense in depth vs Content-Type spoofing). */
const ALLOWED_UPLOADS: Record<string, Set<string>> = {
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/gif": new Set([".gif"]),
  "image/webp": new Set([".webp"]),
  "application/pdf": new Set([".pdf"]),
  "application/msword": new Set([".doc"]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": new Set([".docx"]),
  "text/plain": new Set([".txt"]),
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeOriginal = String(file.originalname || "image")
      .replace(/[^\w.\-()+]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120);
    cb(null, `${uniqueSuffix}-${safeOriginal}`);
  },
});

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedExts = ALLOWED_UPLOADS[file.mimetype];
  if (!allowedExts) {
    cb(new Error("Invalid file type. Only images and documents are allowed."));
    return;
  }
  const ext = path.extname(String(file.originalname || "")).toLowerCase();
  if (!ext || !allowedExts.has(ext)) {
    cb(new Error("Invalid file extension for the declared content type."));
    return;
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/** KYC / runner ID docs — not world-readable via /uploads static. */
const runnerKycDir = path.join(uploadDir, "runner-kyc");
if (!fs.existsSync(runnerKycDir)) {
  fs.mkdirSync(runnerKycDir, { recursive: true });
}

const runnerKycStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, runnerKycDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeOriginal = String(file.originalname || "document")
      .replace(/[^\w.\-()+]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120);
    cb(null, `${uniqueSuffix}-${safeOriginal}`);
  },
});

export const uploadRunnerKyc = multer({
  storage: runnerKycStorage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});
