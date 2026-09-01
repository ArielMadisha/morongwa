# QwertyPodcasts API

Base path: `/api/podcasts` (registered in `backend/server.ts`). Handlers live in `backend/src/routes/podcasts.ts`.

Auth follows the rest of the platform: `Authorization: Bearer <jwt>`. Endpoints marked *optional auth* return richer data (lock state, liked/subscribed) when a token is present.

## Catalog

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/categories` | — | Podcast categories (id + label). |
| GET | `/shows` | — | Browse shows. Query: `category`, `q`, `page`, `limit`. |
| GET | `/shows/:id` | — | Single show with populated owner. |
| GET | `/episodes` | optional | Browse episodes. Query: `category`, `podcastId`, `q`, `sort=newest\|popular`, `page`, `limit`. |
| GET | `/episodes/:id` | optional | Episode detail plus `liked` and `subscribed`. |
| GET | `/recommended` | optional | Heuristic recommendations. Query: `limit`. Response includes `basis: "listening-history" \| "popular"`. |

Premium episodes the caller has not purchased come back with `locked: true` and **without** `audioUrl`, `hlsUrl`, `renditions` or `transcriptText`.

## Creator

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/shows` | yes | Create a show. `multipart/form-data`: `title`*, `category`*, `description`, `tags`, `language`, `explicit`, `cover`. |
| PATCH | `/shows/:id` | yes (owner) | Update `title`, `description`, `category`, `tags`. |
| GET | `/me/shows` | yes | Shows owned by the caller. |
| POST | `/episodes` | yes (owner of show) | Publish an episode. |
| DELETE | `/episodes/:id` | yes (creator) | Soft-remove (`status: "removed"`). |

### `POST /episodes` fields (`multipart/form-data`)

| Field | Required | Notes |
|---|---|---|
| `audio` | yes | MP3, AAC/M4A, WAV or OGG, up to 500 MB. |
| `podcastId` | yes | Show the episode belongs to; caller must own it. |
| `title` | yes | |
| `cover` | no | Falls back to the show cover. |
| `description`, `tags` | no | `tags` is comma-separated or an array. |
| `episodeNumber`, `seasonNumber` | no | |
| `isPremium`, `price` | no | `price` (ZAR) required when `isPremium` is set. |
| `allowDownload` | no | Defaults true; send `0` to disable. |
| `crossPostToTv` | no | Defaults true. Applies only to free, approved episodes. |
| `adBreaksSeconds` | no | Comma-separated second offsets; `0` means pre-roll. |
| `sponsorshipTier`, `sponsorName` | no | `gold` / `silver` / `bronze`. |

Responds `201` with the created episode. Transcoding, HLS generation and the transcript hook run in the background — poll `GET /episodes/:id` for `transcodeState` and `hlsUrl`.

## Engagement

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/episodes/:id/play` | optional | Increment play count; stores `positionSeconds` for signed-in listeners. |
| POST | `/episodes/:id/like` | yes | Toggle like. Returns `{ liked, likeCount }`. |
| GET | `/episodes/:id/comments` | — | Paged comments. |
| POST | `/episodes/:id/comments` | yes | Body `{ text, parentId? }`. Notifies the creator. |
| POST | `/shows/:id/subscribe` | yes | Toggle subscription. Returns `{ subscribed }`. |
| GET | `/me/subscriptions` | yes | Shows the caller subscribes to. |

## Monetization

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/episodes/:id/unlock` | yes | Debit the ACBPay Wallet and unlock a premium episode. Body `{ platform: "web" \| "android" }`. |

**iOS is rejected with `403`.** The server treats a request as iOS when `platform` (body or query) or the `x-qwerty-platform` header is `ios`; the mobile client additionally hides the control on iOS. Apple Guideline 3.1.1 requires In-App Purchase for digital unlocks, so the wallet path stays Android/web only.

Purchases are idempotent per user and episode (unique index plus a deterministic wallet reference `podcast-<episodeId>-<userId>`); repeat calls return `{ unlocked: true, alreadyOwned: true }`.

## Related TV endpoint

| Method | Path | Description |
|---|---|---|
| GET | `/api/tv/genres` | Canonical QwertyTV genre chips, including `qwertz` (short-form vertical) and `podcast` (cross-posted episodes). |

`GET /api/tv?genre=<id>` filters the catalog. `genre=all` is a no-op; `genre=qwertz` narrows to video posts marked with the Qwertz genre or hashtag.

## Environment

| Var | Default | Purpose |
|---|---|---|
| `PODCAST_FFMPEG_BIN` | `ffmpeg` | Transcoder binary. |
| `PODCAST_FFPROBE_BIN` | `ffprobe` | Duration probe binary. |
| `PODCAST_TRANSCODE` | enabled | Set `0` to skip transcoding (original audio still streams). |
| `PODCAST_TRANSCRIPTS` | disabled | Set `1` to enable the AskMacGyver transcript hook. |
