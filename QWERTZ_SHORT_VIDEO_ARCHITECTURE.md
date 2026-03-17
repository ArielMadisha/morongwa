# Qwertz Short Video Functions and Architecture

## Product Definition

Qwertz are vertical short-form videos (max 3 minutes) designed for mobile-first viewing, similar to Reels/TikTok.

## Frontend Flow

Entry points:
- `Create Post` modal -> `Create Qwertz` action.
- Optional deep-link route: `/morongwa-tv?compose=qwertz`.

Creation pipeline:
1. User selects `Create Qwertz`.
2. File picker accepts video formats only (`mp4`, `webm`, `quicktime`).
3. Duration validator checks local metadata before upload.
4. Reject if `duration > 180s`.
5. Upload media via TV upload API.
6. Open post details step with:
   - `type = video`
   - `genre = qwertz`
7. Submit creates TV post tagged as Qwertz.

Core frontend functions:
- `handleQwertzSelect(...)`
- `validateQwertzVideoDuration(...)`

## Backend Integration

Current approach:
- Reuses existing TV post creation (`/api/tv`) and media upload endpoints.
- Qwertz posts are identified by `type=video` + `genre=qwertz`.

Recommended next backend hardening:
- Server-side duration validation from uploaded media metadata.
- Enforce `genre=qwertz` duration limit at API level.
- Add moderation flags specific to short-form feed.

## Feed and Discovery

Qwertz content surfacing:
- Genre filter in QwertyTV includes `Qwertz`.
- Dedicated compose behavior pre-selects Qwertz genre.
- Existing TV grid tile rendering supports Qwertz video playback.

## Future Enhancements

- In-app trim/crop tools for vertical framing.
- Music, text, and effects timeline.
- Draft autosave and scheduled publish.
- Qwertz analytics: watch time, completion, replays, shares.
