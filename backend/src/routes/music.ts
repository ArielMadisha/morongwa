import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import ArtistVerification from "../data/models/ArtistVerification";
import Song from "../data/models/Song";
import TVPost from "../data/models/TVPost";
import { musicUploadSingle, musicUploadSong } from "../middleware/musicUpload";
import multer from "multer";
import path from "path";
import fs from "fs";

const docUploadDir = path.join(__dirname, "../../uploads/artist-docs");
if (!fs.existsSync(docUploadDir)) fs.mkdirSync(docUploadDir, { recursive: true });
const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, docUploadDir),
  filename: (_req, file, cb) => cb(null, `artist-${Date.now()}-${file.originalname}`),
});
const docUpload = multer({ storage: docStorage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

/** Music genres for QwertyMusic */
export const MUSIC_GENRES = [
  { id: "pop", label: "Pop" },
  { id: "hiphop", label: "Hip Hop" },
  { id: "rnb", label: "R&B" },
  { id: "afrobeats", label: "Afrobeats" },
  { id: "amapiano", label: "Amapiano" },
  { id: "gospel", label: "Gospel" },
  { id: "jazz", label: "Jazz" },
  { id: "rock", label: "Rock" },
  { id: "electronic", label: "Electronic" },
  { id: "classical", label: "Classical" },
  { id: "reggae", label: "Reggae" },
  { id: "other", label: "Other" },
];

/** GET /api/music/genres - list music genres */
router.get("/genres", (_req, res: Response) => {
  res.json({ data: MUSIC_GENRES });
});

/** GET /api/music/songs - list songs and albums (public) */
router.get("/songs", async (_req, res: Response, next) => {
  try {
    const songs = await Song.find()
      .sort({ createdAt: -1 })
      .populate("userId", "name")
      .lean();
    res.json({ data: songs });
  } catch (err) {
    next(err);
  }
});

/** GET /api/music/artist-status - check if current user is verified artist */
router.get("/artist-status", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const verification = await ArtistVerification.findOne({ userId: req.user!._id }).lean();
    const isVerified = verification?.status === "approved";
    res.json({
      data: {
        isVerified,
        status: verification?.status ?? null,
        type: verification?.type ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/music/upload-audio - upload voice/audio for post (any user) */
router.post(
  "/upload-audio",
  authenticate,
  musicUploadSingle.single("audio"),
  async (req: AuthRequest, res: Response, next) => {
    try {
      if (!req.file) throw new AppError("No audio file uploaded", 400);
      const url = `/uploads/music/${req.file.filename}`;
      res.json({ data: { url } });
    } catch (err) {
      next(err);
    }
  }
);

/** POST /api/music/upload-song - upload song/album (verified artists only)
 * Requires: WAV audio, JPEG/PNG artwork (3000x3000), metadata (title, artist, songwriters, producer, genre, lyrics)
 */
router.post(
  "/upload-song",
  authenticate,
  (req: AuthRequest, res: Response, next) => {
    musicUploadSong(req, res, (err) => {
      if (err) next(err);
      else next();
    });
  },
  async (req: AuthRequest, res: Response, next) => {
    try {
      const verification = await ArtistVerification.findOne({ userId: req.user!._id });
      if (!verification || verification.status !== "approved") {
        throw new AppError("Artist verification required to upload music. Apply at QwertyMusic.", 403);
      }
      const files = (req as any).files as { audio?: Express.Multer.File[]; artwork?: Express.Multer.File[] };
      const audioFile = files?.audio?.[0];
      const artworkFile = files?.artwork?.[0];
      if (!audioFile) throw new AppError("No audio file uploaded. Use high-quality WAV (16-bit, 44.1 kHz or higher).", 400);
      if (!artworkFile) throw new AppError("No artwork uploaded. Use 3000x3000 JPEG or PNG cover art.", 400);

      const { title, artist, songwriters, producer, genre, lyrics } = req.body;
      if (!title?.trim()) throw new AppError("Song title is required", 400);
      if (!artist?.trim()) throw new AppError("Artist name is required", 400);
      if (!genre?.trim()) throw new AppError("Genre is required", 400);

      const audioUrl = `/uploads/music/${audioFile.filename}`;
      const artworkUrl = `/uploads/music/${artworkFile.filename}`;

      const song = await Song.create({
        type: "song",
        title: title.trim(),
        artist: artist.trim(),
        songwriters: songwriters?.trim(),
        producer: producer?.trim(),
        genre: genre.trim(),
        lyrics: lyrics?.trim(),
        audioUrl,
        artworkUrl,
        userId: req.user!._id,
      });

      // Create TV post so music appears on Home feed and QwertyTV
      const tvPost = await TVPost.create({
        creatorId: req.user!._id,
        type: "audio",
        mediaUrls: [audioUrl],
        caption: `${title.trim()} – ${artist.trim()}`,
        genre: genre.trim(),
        hasWatermark: true,
        status: "approved",
      });
      const populatedPost = await TVPost.findById(tvPost._id)
        .populate("creatorId", "name avatar")
        .lean();

      res.json({
        data: {
          _id: song._id,
          url: audioUrl,
          artworkUrl,
          title: song.title,
          artist: song.artist,
          genre: song.genre,
        },
        post: populatedPost,
      });
    } catch (err) {
      next(err);
    }
  }
);

/** POST /api/music/artist-apply - apply for artist verification */
router.post(
  "/artist-apply",
  authenticate,
  docUpload.array("documents", 5),
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { type, stageName, labelName } = req.body;
      if (!type || !["company", "artist", "producer"].includes(type)) {
        throw new AppError("type required: company, artist, or producer", 400);
      }
      const existing = await ArtistVerification.findOne({ userId: req.user!._id });
      if (existing) {
        if (existing.status === "pending") throw new AppError("Application already pending", 400);
        if (existing.status === "approved") throw new AppError("Already verified", 400);
      }
      const files = (req as any).files as Express.Multer.File[];
      const documents = (files || []).map((f) => ({
        filename: f.filename,
        path: `/uploads/artist-docs/${f.filename}`,
        uploadedAt: new Date(),
      }));
      await ArtistVerification.findOneAndUpdate(
        { userId: req.user!._id },
        {
          userId: req.user!._id,
          type,
          stageName: stageName?.trim(),
          labelName: labelName?.trim(),
          status: "pending",
          documents,
          $unset: { rejectionReason: 1 },
        },
        { upsert: true, new: true }
      );
      res.json({ data: { message: "Application submitted. Manual verification in progress." } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
