import multer from "multer";
import path from "path";
import fs from "fs";

/**
 * TV media must use the same tree `express.static` serves (see server.ts).
 * `process.cwd()/uploads` matches Docker volume mounts (e.g. /app/uploads) and avoids
 * mismatches where multer wrote under dist/uploads but static preferred cwd/uploads.
 */
export const TV_UPLOAD_STORAGE_DIR = path.join(process.cwd(), "uploads", "tv");
const uploadDir = TV_UPLOAD_STORAGE_DIR;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/** When clients omit a filename extension, derive from MIME so URLs stay unambiguous (feed uses extension + path heuristics). */
function extensionFromMimetype(mimetype: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-m4v": ".m4v",
    "video/3gpp": ".3gp",
    "video/3gpp2": ".3g2",
    "video/x-matroska": ".mkv",
  };
  return map[mimetype] || "";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    let ext = path.extname(file.originalname || "") || "";
    if (!ext) ext = extensionFromMimetype(file.mimetype);
    ext = ext.toLowerCase();
    cb(null, `tv-${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_VIDEO = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/3gpp",
  "video/3gpp2",
  "video/x-matroska", // MKV
];
const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_MIMES = [...ALLOWED_VIDEO, ...ALLOWED_IMAGE];

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv", ".3gp", ".3g2"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function isAllowedTvUpload(mimetype: string, originalname: string): boolean {
  if (ALLOWED_MIMES.includes(mimetype)) return true;
  const ext = path.extname(originalname || "").toLowerCase();
  if (!ext) return false;
  // Browsers on Windows often send application/octet-stream or an empty type for valid videos.
  const genericMime =
    !mimetype || mimetype === "application/octet-stream" || mimetype === "binary/octet-stream";
  if (genericMime && (VIDEO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext))) return true;
  return false;
}

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (isAllowedTvUpload(file.mimetype, file.originalname || "")) cb(null, true);
  else cb(new Error("Invalid file type. Only videos (MP4, WebM, MKV, MOV) and images (JPEG, PNG, GIF, WebP) allowed."));
};

/** For single video or image */
export const tvUploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB for videos (large uploads may take several minutes)
});

/** For multiple images (carousel) */
export const tvUploadMultiple = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024, files: 20 }, // 50MB each, max 20
});
