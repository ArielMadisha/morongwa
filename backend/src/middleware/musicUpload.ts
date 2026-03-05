import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(__dirname, "../../uploads/music");
const artworkDir = path.join(__dirname, "../../uploads/music");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || ".mp3";
    cb(null, `music-${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_AUDIO = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/x-m4a",
];

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_AUDIO.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Invalid file type. Only audio (MP3, WAV, OGG, M4A) allowed."));
};

export const musicUploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/** WAV only - high-quality (16-bit, 44.1 kHz or higher) for song/album uploads */
const WAV_MIMETYPES = ["audio/wav", "audio/wave", "audio/x-wav"];
const wavFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (WAV_MIMETYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Invalid file type. Only high-quality WAV files (16-bit, 44.1 kHz or higher) allowed."));
};

const wavStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || ".wav";
    cb(null, `song-${uniqueSuffix}${ext}`);
  },
});

export const musicUploadWav = multer({
  storage: wavStorage,
  fileFilter: wavFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for WAV
});

/** JPEG/PNG cover art - 3000x3000 pixel square recommended */
const ARTWORK_MIMETYPES = ["image/jpeg", "image/jpg", "image/png"];
const artworkFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ARTWORK_MIMETYPES.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Invalid file type. Only JPEG or PNG allowed (3000x3000 square recommended)."));
};

const artworkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, artworkDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `artwork-${uniqueSuffix}${ext}`);
  },
});

export const musicUploadArtwork = multer({
  storage: artworkStorage,
  fileFilter: artworkFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/** Combined: audio (WAV) + artwork (JPEG/PNG) for song/album upload */
const songUploadFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.fieldname === "audio") {
    if (WAV_MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Audio must be WAV (16-bit, 44.1 kHz or higher)."));
  } else if (file.fieldname === "artwork") {
    if (ARTWORK_MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Artwork must be JPEG or PNG (3000x3000 square recommended)."));
  } else {
    cb(new Error("Invalid field"));
  }
};

const songStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || (file.fieldname === "artwork" ? ".jpg" : ".wav");
    const prefix = file.fieldname === "artwork" ? "artwork" : "song";
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  },
});

export const musicUploadSong = multer({
  storage: songStorage,
  fileFilter: songUploadFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
}).fields([
  { name: "audio", maxCount: 1 },
  { name: "artwork", maxCount: 1 },
]);
