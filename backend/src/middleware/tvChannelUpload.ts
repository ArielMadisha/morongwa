import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(__dirname, "../../uploads/tv-channel");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || "") || ".mp4";
    cb(null, `ch-${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_VIDEO = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/3gpp",
  "video/3gpp2",
  "video/x-matroska",
];

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (ALLOWED_VIDEO.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Invalid file type. Use MP4, WebM, MOV, or MKV."));
};

/** Long-form movies for admin linear channel (same cap as TV uploads). */
export const tvChannelVideoUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 1024 },
});
