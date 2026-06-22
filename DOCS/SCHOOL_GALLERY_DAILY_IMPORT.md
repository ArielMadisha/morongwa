# School gallery daily import

Recurring job: load school photos from OneDrive into Qwertymates school accounts.

## Policy

1. **One school per calendar day** — only one folder is imported each day.
2. **Never repeat the same school folder** — once a folder is successfully imported, it is recorded in `backend/exports/school-gallery-daily-state.json` (`processedFolderKeys`) and skipped forever.
3. **Existing account** — folders usually belong to schools that already exist on Qwertymates. Match by fuzzy name and **append** photos to `profileGalleryUrls` (daily runs always use `--append`).
4. **No account yet** — if the folder has photos but no matching user, **create** a school account and upload the photos.

## Photo source

Default folder (thousands of school subfolders):

```
C:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\Schools
```

Override with env `SCHOOL_GALLERY_IMPORT_ROOT` or `--root=...`.

## How to run

From `backend/`:

```bash
# Preview next school (no DB writes, state unchanged)
npm run school:import-gallery-daily -- --dry-run --force

# Live import (once per day; requires MONGO_URI in .env)
npm run school:import-gallery-daily
```

## Automate on Windows

This job runs **on the owner PC** (where OneDrive `Schools` lives). It is **not** on the production server.

Register a daily task at 06:30 (run once):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Register-SchoolGalleryDailyTask.ps1
```

Test the wrapper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Run-SchoolGalleryDailyImport.ps1 -DryRun
```

**Logs:** `backend/exports/school-gallery-daily-task.log`

### If the task shows Last Result `1`

Windows Scheduled Tasks use a **minimal PATH** — `npm` is usually missing. The wrapper script adds `C:\Program Files\nodejs` automatically. Re-register after script updates:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/Register-SchoolGalleryDailyTask.ps1
```

Also check: PC was awake at 06:30, OneDrive folder synced, `MONGO_URI` in `backend/.env`.

## Progress file

`backend/exports/school-gallery-daily-state.json` holds:

- `nextOffset` — next folder index (alphabetical, after junk/duplicate filtering)
- `processedFolderKeys` — schools already done (no repeats)
- `lastRunDate` — blocks a second live run the same day unless `--force`
- `history` — last runs with folder name, status, and report path

**Folder catalog (cached scan):** `backend/exports/school-gallery-folder-catalog.json` — built once from OneDrive (~11k folders). Daily runs read this file instead of re-scanning OneDrive every morning. Rebuild with:

```bash
npm run school:import-gallery-daily -- --refresh-catalog --dry-run
```

## What happens on import

1. Pick the next unprocessed folder (sorted A→Z).
2. Run batch import with `--limit=1 --append --offset=N`.
3. Fuzzy-match folder name → existing school user, or create `zagal*` school user.
4. Copy images to `backend/uploads/school-gallery/{userId}/`.
5. Update MongoDB `profileGalleryUrls` and publish TV/feed updates.
6. Sync files to production via `pushSchoolGalleryRemote.mjs --incremental`.

## Related scripts

| Script | Purpose |
|--------|---------|
| `importSchoolGalleriesDaily.ts` | One folder per day orchestrator |
| `importSchoolGalleriesBatchFromDir.ts` | Match/create/append logic |
| `pushSchoolGalleryRemote.mjs` | Upload gallery files to server |

## Cursor rules (survive Cursor updates)

Both must stay **`alwaysApply: true`** in `.cursor/rules/`:

| Rule | Purpose |
|------|---------|
| **`school-gallery-daily-import.mdc`** | One school per day — detail |
| **`recurring-owner-schedules.mdc`** | School daily + World News sports Tue/Fri — index |

After a Cursor update, if agents drop these rules, restore from git and re-register the Windows task (`Register-SchoolGalleryDailyTask.ps1`).
