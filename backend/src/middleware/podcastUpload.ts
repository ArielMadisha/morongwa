import multer from "multer";
import path from "path";
import fs from "fs";

export const PODCAST_UPLOAD_DIR = path.join(process.cwd(), "uploads", "podcasts");

if (!fs.existsSync(PODCAST_UPLOAD_DIR)) {
  fs.mkdirSync(PODCAST_UPLOAD_DIR, { recursive: true });
}

const AUDIO_MIME_EXT: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/aac": ".aac",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/m4a": ".m4a",
  "audio/wav": ".wav",
  "audio/wave": ".wav",
  "audio/x-wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
};

const COVER_MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PODCAST_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const isCover = file.fieldname === "cover";
    const table = isCover ? COVER_MIME_EXT : AUDIO_MIME_EXT;
    const ext = table[file.mimetype] || path.extname(String(file.originalname || "")).toLowerCase() || (isCover ? ".jpg" : ".mp3");
    cb(null, `${isCover ? "podcast-cover" : "podcast-audio"}-${unique}${ext}`);
  },
});

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.fieldname === "cover") {
    if (COVER_MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error("Cover must be JPEG, PNG or WebP."));
    return;
  }
  if (file.fieldname === "audio") {
    if (AUDIO_MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error("Episode audio must be MP3, AAC/M4A, WAV or OGG."));
    return;
  }
  cb(new Error("Unexpected upload field."));
};

/** Episode upload: one audio file (up to 500MB) plus optional episode cover art. */
export const podcastEpisodeUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024, files: 2 },
}).fields([
  { name: "audio", maxCount: 1 },
  { name: "cover", maxCount: 1 },
]);

/** Show cover upload. */
export const podcastCoverUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single("cover");

export function podcastPublicUrl(filename: string): string {
  return `/uploads/podcasts/${filename}`;
}
