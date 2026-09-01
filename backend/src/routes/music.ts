import { Router, Response } from "express";
import { authenticate, AuthRequest } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import ArtistVerification from "../data/models/ArtistVerification";
import Song from "../data/models/Song";
import TVPost from "../data/models/TVPost";
import Wallet from "../data/models/Wallet";
import User from "../data/models/User";
import MusicPurchase from "../data/models/MusicPurchase";
import AuditLog from "../data/models/AuditLog";
import { notifyHrInbox } from "../services/notification";
import { musicUploadSingle, musicUploadSong, musicUploadAlbum } from "../middleware/musicUpload";
import multer from "multer";
import path from "path";
import fs from "fs";

const docUploadDir = path.join(__dirname, "../../uploads/artist-docs");
if (!fs.existsSync(docUploadDir)) fs.mkdirSync(docUploadDir, { recursive: true });
const ARTIST_DOC_MIMES: Record<string, Set<string>> = {
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
  "application/pdf": new Set([".pdf"]),
};
const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, docUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || "")).toLowerCase() || ".bin";
    const safeExt = /^\.(jpe?g|png|webp|pdf)$/i.test(ext) ? ext : ".bin";
    cb(null, `artist-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});
const docUpload = multer({
  storage: docStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ARTIST_DOC_MIMES[file.mimetype];
    if (!allowed) {
      cb(new Error("Invalid file type. Only images and PDF are allowed."));
      return;
    }
    const ext = path.extname(String(file.originalname || "")).toLowerCase();
    if (!ext || !allowed.has(ext)) {
      cb(new Error("Invalid file extension for the declared content type."));
      return;
    }
    cb(null, true);
  },
});

const router = Router();
const PLATFORM_COMMISSION_PCT = 30;
const OWNER_SHARE_PCT = 70;

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

/** GET /api/music/artists — distinct artist names for browse filters (public). */
router.get("/artists", async (_req, res: Response, next) => {
  try {
    const artists = await Song.distinct("artist", {
      type: "song",
      artist: { $exists: true, $nin: [null, ""] },
    });
    const sorted = (artists as string[])
      .map((a) => String(a).trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    res.json({ data: sorted.slice(0, 300) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/music/songs - list songs and albums (public). Query: type=song|album, page, limit, random=1, genre, artist */
router.get("/songs", async (req, res: Response, next) => {
  try {
    const type = req.query.type as string | undefined;
    const page = Math.max(parseInt((req.query.page as string) || "1", 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "20", 10) || 20, 1), 100);
    const random = req.query.random === "1" || req.query.random === "true";
    const skip = (page - 1) * limit;
    const genre = String(req.query.genre || "").trim().toLowerCase();
    const artist = String(req.query.artist || "").trim();
    const filter: Record<string, unknown> = type === "song" || type === "album" ? { type } : {};
    const genreDef = MUSIC_GENRES.find((g) => g.id === genre);
    if (genre && genre !== "all" && genreDef) {
      // Stored song.genre is inconsistent: some rows hold the id ("gospel"), others the label ("Gospel").
      const escaped = genreDef.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.genre = { $in: [new RegExp(`^${genreDef.id}$`, "i"), new RegExp(`^${escaped}$`, "i")] };
    }
    if (artist && artist !== "all") {
      const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.artist = { $regex: new RegExp(`^${escapedArtist}$`, "i") };
    }
    const total = await Song.countDocuments(filter);

    let songs: any[] = [];
    if (random) {
      songs = await Song.aggregate([
        { $match: filter },
        { $sample: { size: limit } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userId",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        { $unwind: { path: "$userId", preserveNullAndEmptyArrays: true } },
      ]);
    } else {
      songs = await Song.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name")
        .lean();
    }

    const hasMore = random ? songs.length > 0 : skip + songs.length < total;
    res.json({ data: songs, page, limit, total, hasMore });
  } catch (err) {
    next(err);
  }
});

/** GET /api/music/sounds — approved catalog singles for QwertyTV video “Sounds” (public). */
router.get("/sounds", async (req, res: Response, next) => {
  try {
    const page = Math.max(parseInt((req.query.page as string) || "1", 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "30", 10) || 30, 1), 60);
    const skip = (page - 1) * limit;
    const q = String(req.query.q || "").trim();
    const filter: Record<string, unknown> = {
      type: "song",
      soundLibraryStatus: "approved",
    };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      (filter as any).$or = [{ title: rx }, { artist: rx }];
    }
    const total = await Song.countDocuments(filter);
    const songs = await Song.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name")
      .select("title artist genre artworkUrl audioUrl userId createdAt")
      .lean();
    res.json({
      data: songs,
      page,
      limit,
      total,
      hasMore: skip + songs.length < total,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/music/me/catalog — current user’s uploads + sound-library status (auth). */
router.get("/me/catalog", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const songs = await Song.find({ userId: req.user!._id })
      .sort({ createdAt: -1 })
      .select(
        "title artist genre artworkUrl audioUrl type soundLibraryStatus soundLibraryRejectedReason soundLibraryRequestedAt soundLibraryReviewedAt downloadEnabled downloadPrice createdAt"
      )
      .lean();
    res.json({ data: songs });
  } catch (err) {
    next(err);
  }
});

/** POST /api/music/sound-library/request/:songId — rights holder asks for catalog inclusion (auth). */
router.post("/sound-library/request/:songId", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const verification = await ArtistVerification.findOne({ userId: req.user!._id }).lean();
    if (!verification || verification.status !== "approved") {
      throw new AppError("Verified artist account required", 403);
    }
    const song = await Song.findById(req.params.songId);
    if (!song) throw new AppError("Song not found", 404);
    if (String(song.userId) !== String(req.user!._id)) throw new AppError("Not your song", 403);
    if (song.type !== "song") throw new AppError("Only single tracks can join the Sounds catalog", 400);
    const st = (song as any).soundLibraryStatus as string | undefined;
    if (st === "approved") throw new AppError("Already approved for Sounds", 400);
    if (st === "pending") throw new AppError("Already pending review", 400);
    (song as any).soundLibraryStatus = "pending";
    (song as any).soundLibraryRequestedAt = new Date();
    (song as any).soundLibraryRejectedReason = undefined;
    await song.save();
    res.json({ ok: true, data: { soundLibraryStatus: "pending" } });
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
 * Requires: WAV audio, JPEG/PNG artwork (1200×1200), metadata (title, artist, songwriters, producer, genre, lyrics)
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
      if (!artworkFile) throw new AppError("No artwork uploaded. Use 1200×1200 JPEG or PNG cover art.", 400);

      const { title, artist, songwriters, producer, genre, lyrics } = req.body;
      if (!title?.trim()) throw new AppError("Song title is required", 400);
      if (!artist?.trim()) throw new AppError("Artist name is required", 400);
      if (!genre?.trim()) throw new AppError("Genre is required", 400);

      const downloadEnabled = String(req.body?.downloadEnabled || "false") === "true";
      const parsedDownloadPrice = Number(req.body?.downloadPrice);
      const downloadPrice = Number.isFinite(parsedDownloadPrice) ? parsedDownloadPrice : undefined;
      if (downloadEnabled) {
        if (downloadPrice == null || downloadPrice < 10 || downloadPrice > 15) {
          throw new AppError("Download price must be between R10 and R15", 400);
        }
      }

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
        downloadEnabled,
        downloadPrice: downloadEnabled ? downloadPrice : undefined,
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

/** POST /api/music/upload-album - upload album with multiple WAV tracks (verified artists only) */
router.post(
  "/upload-album",
  authenticate,
  (req: AuthRequest, res: Response, next) => {
    musicUploadAlbum(req, res, (err) => {
      if (err) next(err);
      else next();
    });
  },
  async (req: AuthRequest, res: Response, next) => {
    try {
      const verification = await ArtistVerification.findOne({ userId: req.user!._id });
      if (!verification || verification.status !== "approved") {
        throw new AppError("Artist verification required to upload albums.", 403);
      }
      const { title, artist, songwriters, producer, genre, lyrics } = req.body;
      if (!title?.trim()) throw new AppError("Album title is required", 400);
      if (!artist?.trim()) throw new AppError("Artist name is required", 400);
      if (!genre?.trim()) throw new AppError("Genre is required", 400);

      const files = (req as any).files as { tracks?: Express.Multer.File[]; artwork?: Express.Multer.File[] };
      const trackFiles = files?.tracks || [];
      const artworkFile = files?.artwork?.[0];
      if (!trackFiles.length) throw new AppError("At least one album track is required", 400);
      if (!artworkFile) throw new AppError("Album artwork is required", 400);

      const downloadEnabled = String(req.body?.downloadEnabled || "false") === "true";
      const parsedDownloadPrice = Number(req.body?.downloadPrice);
      const downloadPrice = Number.isFinite(parsedDownloadPrice) ? parsedDownloadPrice : undefined;
      if (downloadEnabled) {
        if (downloadPrice == null || downloadPrice < 10 || downloadPrice > 15) {
          throw new AppError("Download price must be between R10 and R15", 400);
        }
      }

      const tracks = trackFiles.map((file) => ({
        title: path.parse(file.originalname).name,
        audioUrl: `/uploads/music/${file.filename}`,
      }));
      const artworkUrl = `/uploads/music/${artworkFile.filename}`;

      const album = await Song.create({
        type: "album",
        title: title.trim(),
        artist: artist.trim(),
        songwriters: songwriters?.trim(),
        producer: producer?.trim(),
        genre: genre.trim(),
        lyrics: lyrics?.trim(),
        audioUrl: tracks[0].audioUrl,
        artworkUrl,
        tracks,
        userId: req.user!._id,
        downloadEnabled,
        downloadPrice: downloadEnabled ? downloadPrice : undefined,
      });

      const tvPost = await TVPost.create({
        creatorId: req.user!._id,
        type: "audio",
        mediaUrls: [tracks[0].audioUrl],
        caption: `${title.trim()} (Album) – ${artist.trim()}`,
        genre: genre.trim(),
        hasWatermark: true,
        status: "approved",
      });
      const populatedPost = await TVPost.findById(tvPost._id)
        .populate("creatorId", "name avatar")
        .lean();

      res.json({
        data: {
          _id: album._id,
          type: album.type,
          title: album.title,
          artist: album.artist,
          genre: album.genre,
          tracks: album.tracks,
          artworkUrl: album.artworkUrl,
          downloadEnabled: album.downloadEnabled,
          downloadPrice: album.downloadPrice,
        },
        post: populatedPost,
      });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /api/music/purchases/me - list purchased songs/albums for current user with song details */
router.get("/purchases/me", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const purchases = await MusicPurchase.find({ buyerId: req.user!._id })
      .select("songId reference amount createdAt")
      .sort({ createdAt: -1 })
      .lean();
    const songIds = purchases.map((p) => p.songId);
    const songs = await Song.find({ _id: { $in: songIds } })
      .select("title artist artworkUrl audioUrl type downloadPrice tracks")
      .lean();
    const songMap = new Map(songs.map((s) => [s._id.toString(), s]));
    const data = purchases.map((p) => {
      const song = songMap.get((p.songId as any).toString());
      return {
        ...p,
        song: song ? {
          _id: song._id,
          title: (song as any).title,
          artist: (song as any).artist,
          artworkUrl: (song as any).artworkUrl,
          audioUrl: (song as any).audioUrl,
          type: (song as any).type,
          downloadPrice: (song as any).downloadPrice,
          tracks: (song as any).tracks,
        } : null,
      };
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** POST /api/music/:id/purchase - buy download entitlement from wallet */
router.post("/:id/purchase", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) throw new AppError("Song/album not found", 404);
    if (!song.downloadEnabled || !song.downloadPrice) {
      throw new AppError("Downloads are not enabled for this title", 400);
    }
    if (String(song.userId) === String(req.user!._id)) {
      throw new AppError("You already own this title", 400);
    }

    const existing = await MusicPurchase.findOne({ songId: song._id, buyerId: req.user!._id });
    if (existing) {
      return res.json({ message: "Already purchased", data: { reference: existing.reference } });
    }

    let buyerWallet = await Wallet.findOne({ user: req.user!._id });
    if (!buyerWallet) buyerWallet = await Wallet.create({ user: req.user!._id });
    const amount = Number(song.downloadPrice);
    if (buyerWallet.balance < amount) {
      throw new AppError("Insufficient wallet balance", 400);
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminUser = adminEmail ? await User.findOne({ email: adminEmail }).select("_id") : null;
    if (!adminUser?._id) {
      throw new AppError("Admin payout account not configured", 500);
    }

    let ownerWallet = await Wallet.findOne({ user: song.userId });
    if (!ownerWallet) ownerWallet = await Wallet.create({ user: song.userId });
    let adminWallet = await Wallet.findOne({ user: adminUser._id });
    if (!adminWallet) adminWallet = await Wallet.create({ user: adminUser._id });

    const adminCommission = Math.round((amount * PLATFORM_COMMISSION_PCT) * 100) / 100;
    const ownerShare = Math.round((amount * OWNER_SHARE_PCT) * 100) / 100;
    const reference = `MUSIC-${song._id}-${Date.now()}`;

    buyerWallet.balance -= amount;
    buyerWallet.transactions.push({
      type: "debit",
      amount: -amount,
      reference,
      createdAt: new Date(),
    });
    await buyerWallet.save();

    ownerWallet.balance += ownerShare;
    ownerWallet.transactions.push({
      type: "credit",
      amount: ownerShare,
      reference: `${reference}-OWNER`,
      createdAt: new Date(),
    });
    await ownerWallet.save();

    adminWallet.balance += adminCommission;
    adminWallet.transactions.push({
      type: "credit",
      amount: adminCommission,
      reference: `${reference}-ADMIN`,
      createdAt: new Date(),
    });
    await adminWallet.save();

    await MusicPurchase.create({
      songId: song._id,
      buyerId: req.user!._id,
      ownerId: song.userId,
      amount,
      adminCommission,
      ownerShare,
      reference,
    });

    await AuditLog.create({
      action: "MUSIC_PURCHASE",
      user: req.user!._id,
      meta: { songId: song._id, amount, adminCommission, ownerShare, reference },
    });

    res.json({
      message: "Purchase successful",
      data: { reference, amount, adminCommission, ownerShare, balance: buyerWallet.balance },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/music/:id/download - return downloadable URLs for purchased users (or owner/admin) */
router.get("/:id/download", authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const song = await Song.findById(req.params.id).lean();
    if (!song) throw new AppError("Song/album not found", 404);
    if (!song.downloadEnabled) throw new AppError("Downloads are disabled for this title", 400);

    const isOwner = String((song as any).userId) === String(req.user!._id);
    const userRoles = Array.isArray((req.user as any)?.role) ? (req.user as any).role : [];
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");
    const purchased = await MusicPurchase.findOne({ songId: song._id, buyerId: req.user!._id }).lean();
    if (!isOwner && !isAdmin && !purchased) {
      throw new AppError("Purchase required before download", 403);
    }

    if (song.type === "album") {
      const tracks = Array.isArray((song as any).tracks) ? (song as any).tracks : [];
      return res.json({
        data: {
          type: "album",
          title: song.title,
          tracks: tracks.map((t: any) => ({ title: t.title, url: t.audioUrl })),
        },
      });
    }
    res.json({
      data: {
        type: "song",
        title: song.title,
        url: (song as any).audioUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

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
      void notifyHrInbox({
        subject: "New artist verification application",
        message: [
          `Artist verification application (${type}).`,
          `Stage name: ${stageName?.trim() || "—"}`,
          `Label: ${labelName?.trim() || "—"}`,
          `User id: ${req.user!._id}`,
          `Documents: ${documents.length}`,
        ].join("\n"),
      });
      res.json({ data: { message: "Application submitted. Manual verification in progress." } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
