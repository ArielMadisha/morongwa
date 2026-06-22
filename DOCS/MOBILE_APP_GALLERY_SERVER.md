# Mobile app gallery (server-hosted)

Android and Huawei install files are hosted on **our servers** only — no Play Store or AppGallery upload required for direct download.

## URLs (production)

| Item | URL |
|------|-----|
| **Gallery page** | https://www.qwertymates.com/apps |
| **Manifest** | https://api.qwertymates.com/uploads/mobile-releases/manifest.json |
| **Android AAB** | `…/uploads/mobile-releases/android/qwertymates-*.aab` |
| **Huawei APK** | `…/uploads/mobile-releases/huawei/qwertymates-*.apk` |

## Update (from `backend/`)

```bash
npm run mobile:sync-gallery-remote
```

This:

1. Downloads the latest **finished** EAS artifacts (no new cloud build / no quota use).
2. Updates `uploads/mobile-releases/manifest.json`.
3. SFTP tarball sync to production `backend/uploads/mobile-releases/`.

## Local staging

`backend/uploads/mobile-releases/`

- `android/` — Google Play AAB
- `huawei/` — Huawei / sideload APK
- `gallery/android/` — optional store screenshots (PNG/JPG)
- `gallery/huawei/` — optional store screenshots
- `manifest.json` — version + download URLs

After adding screenshots under `gallery/`, re-run `npm run mobile:push-gallery-remote` and list paths in `manifest.json` → `gallery.android` / `gallery.huawei`.

## v1.3.1 note

EAS free-tier quota resets **2026-07-01**. Until then, gallery hosts the latest available artifacts (production AAB + interim preview APK). See `DOCS/EAS_ANDROID_JULY_BUILD.md`.
