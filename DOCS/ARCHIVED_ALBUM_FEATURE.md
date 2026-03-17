# Archived Album Feature

**Archived:** 2026-02-16  
**Reason:** App simplified to songs-only. Code preserved for future use.

To restore albums: re-apply the changes below and re-enable the routes/UI.

---

## 1. Song Model (backend/src/data/models/Song.ts)

Keep `type: "song" | "album"` and `tracks` array. When restoring, ensure:
- `type: { type: String, enum: ["song", "album"], default: "song" }`
- `tracks: [{ title: String, audioUrl: String, duration: Number }]`

---

## 2. Music Upload Middleware (backend/src/middleware/musicUpload.ts)

```typescript
/** Album upload: one artwork + up to 20 WAV track files */
const albumUploadFileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.fieldname === "tracks") {
    if (WAV_MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Album tracks must be WAV (16-bit, 44.1 kHz or higher)."));
  } else if (file.fieldname === "artwork") {
    if (ARTWORK_MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Artwork must be JPEG or PNG (1200×1200 square recommended)."));
  } else {
    cb(new Error("Invalid field"));
  }
};

export const musicUploadAlbum = multer({
  storage: songStorage,
  fileFilter: albumUploadFileFilter,
  limits: { fileSize: 100 * 1024 * 1024, files: 21 },
}).fields([
  { name: "tracks", maxCount: 20 },
  { name: "artwork", maxCount: 1 },
]);
```

---

## 3. Music Routes - Upload Album (backend/src/routes/music.ts)

```typescript
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
      const artworkUrl = artworkFile.filename;

      const album = await Song.create({
        type: "album",
        title: title.trim(),
        artist: artist.trim(),
        songwriters: songwriters?.trim(),
        producer: producer?.trim(),
        genre: genre.trim(),
        lyrics: lyrics?.trim(),
        audioUrl: tracks[0].audioUrl,
        artworkUrl: `/uploads/music/${artworkFile.filename}`,
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
      // ... return response
    } catch (err) {
      next(err);
    }
  }
);
```

---

## 4. Music Routes - Download (album type handling)

In GET /api/music/:id/download:
```typescript
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
```

---

## 5. Admin Routes - Upload Album (backend/src/routes/admin.ts)

```typescript
/** Admin: Upload album (bypass artist verification) */
router.post(
  "/music/upload-album",
  (req: AuthRequest, res: Response, next) => {
    musicUploadAlbum(req, res, (err) => (err ? next(err) : next()));
  },
  async (req: AuthRequest, res: Response, next) => {
    try {
      const { userId, title, artist, songwriters, producer, genre, lyrics } = req.body;
      // ... validation ...
      const tracks = trackFiles.map((file) => ({
        title: path.parse(file.originalname).name,
        audioUrl: `/uploads/music/${file.filename}`,
      }));
      const album = await Song.create({
        type: "album",
        title: title.trim(),
        artist: artist.trim(),
        // ...
        tracks,
        // ...
      });
      // ...
    } catch (err) {
      next(err);
    }
  }
);
```

---

## 6. Frontend API (frontend/lib/api.ts)

```typescript
uploadMusicAlbum: (
  tracks: File[],
  artwork: File,
  metadata: { userId?: string; title: string; artist: string; ... }
) => {
  const formData = new FormData();
  tracks.forEach((track) => formData.append('tracks', track));
  formData.append('artwork', artwork);
  // ... metadata
  return api.post('/admin/music/upload-album', formData);
},

// musicAPI
uploadAlbum: (albumTracks, artworkFile, metadata) => {
  const formData = new FormData();
  albumTracks.forEach((track) => formData.append('tracks', track));
  formData.append('artwork', artworkFile);
  // ...
  return api.post('/music/upload-album', formData);
},
```

---

## 7. AppSidebar - QwertyMusic Dropdown

- `qwertyMusicSubItems`: `[{ href: '/qwerty-music?filter=songs', label: 'Songs' }, { href: '/qwerty-music?filter=albums', label: 'Albums' }]`
- QwertyMusic nav item: `{ type: 'qwertyMusic' }` with expandable sub-items (Songs | Albums)
- `qwertyMusicExpanded`, `isQwertyMusicActive`, `isMusicSubActive(subHref)`, `musicFilter`
- Desktop: dropdown on hover; Mobile: inline sub-items when expanded

---

## 8. QwertyMusic Page - Filter & Album UI

- Filter: `filter = searchParams.get('filter') || 'songs'`, `typeFilter = filter === 'albums' ? 'album' : 'song'`
- getSongs({ type: typeFilter })
- Album track list display:
```tsx
{s.type === 'album' && Array.isArray(s.tracks) && s.tracks.length > 0 && (
  <div className="mt-2 pt-2 border-t border-slate-100">
    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">Tracks</p>
    <ol className="space-y-0.5 text-xs text-slate-600 max-h-20 overflow-y-auto">
      {s.tracks.map((t, i) => (
        <li key={i} className="truncate" title={t.title}>{i + 1}. {t.title}</li>
      ))}
    </ol>
  </div>
)}
```
- Download button: `s.type === 'album' ? 'Download album' : 'Download song'`
- Upload modal: uploadType 'song' | 'album', album tracks input, handleUploadAlbum

---

## 9. Admin Music Page - Album Upload

- openUploadAlbum(), Upload album button (violet)
- uploadType state, Type dropdown (Song | Album)
- Album tracks file input (multiple)
- handleUpload: if uploadType === 'album' call uploadMusicAlbum
- Album track list in card: `s.type === 'album' && s.tracks?.map(...)`

---

## 10. Profile Downloads - Album tracks

- Backend purchases/me: include `tracks` in song object
- Profile: `d.song?.type === 'album' && d.song.tracks?.map(...)`

---

## 11. Purchases API - tracks in response

```typescript
song: song ? {
  // ...
  tracks: (song as any).tracks,
} : null,
```
