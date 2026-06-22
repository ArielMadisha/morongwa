/**
 * Serve /uploads with a placeholder when legacy music artwork files are missing on disk.
 */
import fs from "fs";
import path from "path";
import { Request, Response } from "express";

const uploadsRoot = path.join(__dirname, "../../uploads");
const musicArtworkPlaceholder = path.join(__dirname, "../assets/music-artwork-placeholder.svg");

function isMissingMusicArtwork(rel: string): boolean {
  return /^music\/artwork-.*\.(png|jpe?g|webp)$/i.test(rel);
}

export function uploadsStaticMiddleware(req: Request, res: Response): void {
  const rel = decodeURIComponent(String(req.path || "").replace(/^\//, ""));
  if (!rel || rel.includes("..")) {
    res.status(400).end();
    return;
  }

  const filePath = path.join(uploadsRoot, rel);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.sendFile(filePath);
    return;
  }

  if (isMissingMusicArtwork(rel) && fs.existsSync(musicArtworkPlaceholder)) {
    res.type("image/svg+xml");
    res.sendFile(musicArtworkPlaceholder);
    return;
  }

  res.status(404).end();
}
