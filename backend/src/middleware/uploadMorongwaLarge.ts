import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(__dirname, "../../uploads/morongwa-files");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeOriginal = String(file.originalname || "file")
      .replace(/[^\w.\-()+]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120);
    cb(null, `${uniqueSuffix}-${safeOriginal}`);
  },
});

/** Large Morongwa P2P transfers — up to 100 MB. */
export const uploadMorongwaLarge = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});
