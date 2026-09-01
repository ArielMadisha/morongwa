# QwertyPodcasts — architecture

QwertyPodcasts is the audio section of **QwertyMedia** (the hub that now contains **QwertyTV**, **QwertyMusic** and **QwertyPodcasts**). It reuses Qwertymates infrastructure rather than standing up a parallel stack: disk-backed uploads served from `/uploads`, the TVPost feed for cross-posting, the shared notification service, and the ACBPay Wallet for paid unlocks.

## Layers

### 1. Content layer — **Phase 1, shipped**

Creators own **shows** (`Podcast`) and publish **episodes** (`PodcastEpisode`) into them.

- Upload accepts **MP3, AAC/M4A, WAV, OGG** (500 MB limit) plus an optional episode cover.
- Metadata: title, description, tags, category, season/episode numbers, explicit flag on the show.
- Categories are server-owned (`PODCAST_CATEGORIES` in `backend/src/routes/podcasts.ts`): Business, Lifestyle, Music, News & Politics, Sport, Technology, Education, Health & Wellness, Comedy, Faith & Spirituality, True Crime, Society & Culture.

Storage: `backend/src/middleware/podcastUpload.ts` writes to `uploads/podcasts/` and returns `/uploads/podcasts/<file>`, the same public-static pattern used by TV and Music uploads.

### 2. Processing layer — **partly shipped**

`backend/src/services/podcastProcessing.ts` runs after upload, fire-and-forget, so a failure never blocks publishing.

| Capability | Status | Notes |
|---|---|---|
| Duration probe | Shipped | `ffprobe`; silently skipped if the binary is missing. |
| Multi-bitrate transcode (64k / 128k AAC) | Shipped | `ffmpeg`, same spawn pattern as `tvChannelRestreamWorker.ts`. |
| HLS VOD manifest (master + per-bitrate playlists) | Shipped | Written next to the source in `uploads/podcasts/`. |
| Graceful degradation | Shipped | No ffmpeg → `transcodeState: "skipped"`, original file stays playable. |
| Metadata moderation filter | Shipped | Keyword screen on title/description/tags → `moderationState`. |
| **Audio content moderation** | **Deferred** | Sightengine (`contentModeration.ts`) covers image/video; audio classification not wired. |
| **AskMacGyver speech-to-text transcripts** | **Deferred (hook present)** | `requestTranscript()` + `transcriptState` / `transcriptText` fields; enable with `PODCAST_TRANSCRIPTS=1` once MacGyver exposes a transcription endpoint. |

Env: `PODCAST_FFMPEG_BIN`, `PODCAST_FFPROBE_BIN`, `PODCAST_TRANSCODE=0` to disable, `PODCAST_TRANSCRIPTS=1` to enable the transcript hook.

### 3. Distribution layer

| Capability | Status | Notes |
|---|---|---|
| Progressive streaming from `/uploads/podcasts/` | Shipped | Web `Audio`, mobile `expo-av`. |
| HLS manifest served for adaptive players | Shipped (produced) | `hlsUrl` returned by the API; web/mobile players currently use `audioUrl`. Swap in an HLS-capable player to consume it. |
| `allowDownload` flag for offline | Shipped (flag) | Clients may cache the file when true. |
| **DRM-protected offline download** | **Deferred** | Needs a licence server (Widevine/FairPlay) plus encrypted HLS; the `allowDownload` flag is the placeholder. |
| Cross-post to QwertyTV feed | Shipped | Free, approved episodes create a `TVPost` (`type: "audio"`, `genre: "podcast"`, `#QwertyPodcasts`) and store `tvPostId`. Premium episodes are not cross-posted. |
| WhatsApp portal / external sharing | Deferred | Reuse the existing share surfaces; no podcast-specific share endpoint yet. |

### 4. Engagement layer — **Phase 1, shipped**

- Likes (`PodcastInteraction` type `like`) and threaded comments (`PodcastComment`), mirroring the TV interaction models.
- Subscriptions (`PodcastSubscription`); publishing an episode notifies every subscriber through `sendNotification` (`type: "podcast_episode"`, deep-link `meta.url`).
- Play tracking (`PodcastInteraction` type `play`, with resume `positionSeconds`) feeds recommendations.
- `GET /podcasts/recommended` is a **Phase 1 heuristic**: categories drawn from the caller's recent plays, ranked by play count, falling back to global popularity. **AskMacGyver-ranked recommendations are deferred**; the endpoint contract will not change when that lands.

### 5. Monetization layer

| Capability | Status | Notes |
|---|---|---|
| Premium episode unlock via ACBPay Wallet | Shipped | `POST /podcasts/episodes/:id/unlock` debits the wallet (idempotent reference `podcast-<episodeId>-<userId>`) and writes `PodcastPurchase`. Locked episodes never leak `audioUrl` / `hlsUrl` / `transcriptText`. |
| **iOS gate** | Shipped | Blocked server-side when the client declares `platform: "ios"` (or header `x-qwerty-platform: ios`), and hidden client-side on iOS. Apple Guideline 3.1.1 would require In-App Purchase. Android and web keep the wallet flow. |
| Ad break markers (pre-roll / mid-roll) | Shipped (data) | `adBreaksSeconds` on the episode. |
| **Dynamic ad insertion / stitching** | **Deferred** | Needs an ad decision server and server-side stitching into the HLS manifest. |
| Sponsorship tiers (Gold / Silver / Bronze) | Shipped (data) | `sponsorshipTier` + `sponsorName`, ready to bind to CSR packages. |

### 6. Integration layer

- **ACBPay Wallet** — premium unlocks debit the wallet through `onWalletSaved`, so realtime balance sync and side effects behave like every other wallet spend.
- **QwertyTV** — cross-posted episodes appear in the catalog and are reachable through the new `podcast` genre chip.
- **QwertyHub merch / Errands promo runs** — deferred; shows carry tags and an owner, which is the join key when merch listings are added.

## Data model

| Model | File | Purpose |
|---|---|---|
| `Podcast` | `backend/src/data/models/Podcast.ts` | Show: owner, title, category, tags, cover, counters. |
| `PodcastEpisode` | `backend/src/data/models/PodcastEpisode.ts` | Episode: audio, renditions, HLS, processing/moderation state, premium, ad breaks, counters. |
| `PodcastSubscription` | `backend/src/data/models/PodcastSubscription.ts` | Follow a show, notify on publish. |
| `PodcastComment` | `backend/src/data/models/PodcastComment.ts` | Comments and replies. |
| `PodcastInteraction` | `backend/src/data/models/PodcastInteraction.ts` | Likes and plays (unique per user/episode/type). |
| `PodcastPurchase` | `backend/src/data/models/PodcastPurchase.ts` | Wallet unlock record (unique per user/episode). |

## Clients

**Web** (`frontend/`)

- `/qwerty-media` — QwertyMedia hub.
- `/qwerty-media/podcasts` — browse by category, shows rail, episode list, play/like, upload modal (create show + publish episode).
- `/qwerty-media/podcasts/[id]` — episode detail: play, like, subscribe, comments, unlock.
- `/qwerty-media/podcasts/show/[id]` — show detail and episode list.
- `components/media/MediaSectionTabs.tsx` — the QwertyTV / QwertyMusic / QwertyPodcasts switcher rendered on all three pages.

**Mobile** (`mobile/`)

- Bottom tab **QwertyTV → QwertyMedia**; the standalone QwertyMusic tab is removed and lives inside QwertyMedia.
- `src/screens/PodcastsScreen.tsx`; section and genre chips via `src/components/MediaChipsRow.tsx`.
- Premium unlock is hidden and refused on iOS.

## Deferred work, in priority order

1. AskMacGyver speech-to-text transcripts (hook and schema already in place).
2. HLS-capable players on web and mobile so `hlsUrl` is actually consumed.
3. Audio content moderation.
4. Dynamic ad insertion (ad decision server + manifest stitching).
5. DRM-protected offline downloads.
6. AskMacGyver-ranked recommendations replacing the category heuristic.
7. QwertyHub merch and Errands promo-material integration.
