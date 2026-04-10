# Production backup download & media integrity

## Local folder (Qwertymates)

Use a stable folder on your PC, for example:

- `C:\Users\<you>\Qwertymates\backups\` (create if missing)

The repo also has `Qwertymates-backups\` under the Morongwa project root from earlier runs; you can move everything into your preferred `Qwertymates` tree.

**Important:** If any `part-NN` file is smaller than ~1GiB (except the last part), delete it and re-download that part — partial files will corrupt the joined archive.

## Chunk download (recommended for ~9GB tarball)

On the server, chunks live under:

`/home/zweppe/backups/chunks/pre-morongwa-cutover-20260401_105119.part-*`

**Batch (recommended):** copy `backend/.env.deploy.example` to `backend/.env.deploy`, set `PROD_SSH_*` and optional `BACKUP_DOWNLOAD_LOCAL_DIR`. Optionally wipe bad partials: `SCRUB_LOCAL_CHUNKS=1`.

```bash
cd backend
# optional: delete wrong-sized local parts first
set SCRUB_LOCAL_CHUNKS=1   # Windows PowerShell: $env:SCRUB_LOCAL_CHUNKS="1"
node scripts/downloadBackupChunks.mjs
# resume after failure from part 3:
node scripts/downloadBackupChunks.mjs 3
```

**Single file:** `node scripts/downloadFileSsh.mjs HOST USER PASS <remotePath> <localPath> [port]`

Optional env: `SFTP_RETRIES=10` `SFTP_RETRY_MS=5000` `SSH_PORT=22`.

## Recombine on Windows (CMD)

From the folder that contains all `part-*` files:

```bat
cd /d C:\Users\you\Qwertymates\backups\chunks
copy /b pre-morongwa-cutover-20260401_105119.part-00 + pre-morongwa-cutover-20260401_105119.part-01 + pre-morongwa-cutover-20260401_105119.part-02 + pre-morongwa-cutover-20260401_105119.part-03 + pre-morongwa-cutover-20260401_105119.part-04 + pre-morongwa-cutover-20260401_105119.part-05 + pre-morongwa-cutover-20260401_105119.part-06 + pre-morongwa-cutover-20260401_105119.part-07 + pre-morongwa-cutover-20260401_105119.part-08 ..\pre-morongwa-cutover-20260401_105119.tar.gz
```

Use the exact `part-*` filenames if different (e.g. only eight parts if naming changed). Verify total size matches the sum of parts, then test:

`tar -tzf pre-morongwa-cutover-20260401_105119.tar.gz | more`

## After a verified good local copy

Only then, on the server, remove the huge files to free space (adjust paths if different):

```bash
rm -f /home/zweppe/backups/pre-morongwa-cutover-20260401_105119.tar.gz
rm -rf /home/zweppe/backups/chunks
# Optional: remove the extracted backup tree — only if you are sure you no longer need it on disk
# rm -rf /home/zweppe/backups/pre-morongwa-cutover-20260401_105119
```

Keep at least one off-server copy before deleting the only server copy.

## Media integrity scan & missing list

Script: `backend/scripts/mediaIntegrityScan.mjs` (reads `MONGO_URI` or `MONGODB_URI` from `backend/.env`).

Run **inside the API container** (or on host with same `uploads/` layout as production):

```bash
cd /app   # or morongwa-live/backend
node scripts/mediaIntegrityScan.mjs
```

Outputs counts and writes missing paths to `media-integrity-missing.txt` in the current working directory (e.g. bind-mounted `backend/` on the host).

Pull that file locally:

```bash
scp USER@HOST:/home/zweppe/morongwa-live/backend/media-integrity-missing.txt .
```

Use the list to bulk-copy from `cleanup-20260401` / legacy archives into `backend/uploads`, then re-run the scan until `missing: 0`.
