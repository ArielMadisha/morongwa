# CPU workload balancing (Qwertymates dev machine)

Owner policy for the Windows dev laptop used with Cursor agents. Prevents CPU meltdown from parallel deploys, EAS builds, Facebook multipage jobs, and duplicate node processes.

**Cursor rule:** `.cursor/rules/cpu-workload-balancing.mdc` (`alwaysApply: true`)

## Incident context

~22 node processes at 100% CPU — caused by duplicate EAS iOS builds, parallel deploys, a 47h Facebook multipage job with an expired token, and browser load. Cleanup killed stale PIDs but agents respawned new heavy jobs.

## Thresholds

Defined in `backend/scripts/lib/cpuWorkload.mjs`:

| Setting | Default | Meaning |
|---------|---------|---------|
| `startBlockCpuPercent` | **85%** | Do not start new heavy work |
| `maxHeavyNodeJobs` | **8** | Block new starts when this many heavy node processes run |
| `pauseCpuPercent` | **95%** | Pause/stop lowest-priority heavy jobs |
| `resumeCpuPercent` | **70%** | CPU must drop below this to resume queue |
| `resumeStableMs` | **30s** | Must stay below resume threshold this long |
| `pollIntervalMs` | **20s** | Queue runner wait between CPU checks |

### Windows CPU measurement

Uses PowerShell `Get-Counter '\Processor(_Total)\% Processor Time'` (two samples ~400ms apart). Fallback: `wmic cpu get loadpercentage`.

On Linux/macOS: `os.loadavg()` scaled by CPU count (estimate).

### Heavy job detection

Command-line patterns (node processes):

- `facebook-multipage` — `backfillFacebookMarketplaceMultiPage`
- `deploy` — `deployProduction.mjs`, `publishFrontendRemote`, etc.
- `eas` — `eas-cli`, `build:android:production`, etc.
- `frontend-build` — `next build`
- `ffmpeg`, `facebook-tv`

## Commands (from `backend/`)

```bash
# Status — run before any heavy job
npm run ops:cpu-status

# Enqueue (preferred over direct run when CPU is busy or another heavy job may run)
npm run ops:cpu-queue-enqueue -- npm run deploy:production
npm run ops:cpu-queue-enqueue -- npm run facebook:marketplace-multipage
npm run ops:cpu-queue-enqueue --cwd ../mobile -- npm run release:android:play

# Process one queued job (waits for CPU headroom)
npm run ops:cpu-queue-run

# Daemon — keep polling queue (optional background on owner PC)
npm run ops:cpu-queue-run:daemon

npm run ops:cpu-queue-pause
npm run ops:cpu-queue-resume
npm run ops:cpu-queue-clear-finished

# Conservative duplicate cleanup
npm run ops:stop-stale-heavy-processes
npm run ops:stop-stale-heavy-processes -- --dry-run
```

Direct CLI:

```bash
node scripts/cpuAwareTaskQueue.mjs status
node scripts/cpuAwareTaskQueue.mjs enqueue --type deploy -- npm run deploy:production
node scripts/cpuAwareTaskQueue.mjs run --daemon
```

## State files (gitignored)

| File | Purpose |
|------|---------|
| `backend/exports/cpu-task-queue.json` | Pending/running/completed jobs |
| `backend/exports/cpu-task-queue-state.json` | `paused`, current `running` job, resume timer |

## Agent workflow

1. **Monitor** — `npm run ops:cpu-status`
2. **Serialize** — one of deploy / EAS / FB multipage / full frontend rebuild per PC
3. **Enqueue** if CPU ≥ 85% or ≥ 8 heavy node jobs
4. **Cleanup** if CPU ≥ 95% — `ops:stop-stale-heavy-processes` (FB multipage duplicates first)
5. **Resume** — when CPU < 70% for 30s, `ops:cpu-queue-run`

## Heavy scripts — enqueue instead of direct run

| Task | Direct (avoid when busy) | Queued |
|------|--------------------------|--------|
| Production deploy | `npm run deploy:production` | `npm run ops:cpu-queue-enqueue -- npm run deploy:production` |
| FB marketplace multipage | `npm run facebook:marketplace-multipage` | `npm run ops:cpu-queue-enqueue -- npm run facebook:marketplace-multipage` |
| EAS Android (Qwertymates) | `cd mobile && npm run release:android:play` | `npm run ops:cpu-queue-enqueue --cwd ../mobile -- npm run release:android:play` |
| EAS iOS | `cd mobile && npm run build:ios:production` | `npm run ops:cpu-queue-enqueue --cwd ../mobile -- npm run build:ios:production` |
| Frontend rebuild | `cd ../frontend && npm run build` | `npm run ops:cpu-queue-enqueue --cwd ../frontend -- npm run build` |

## Facebook multipage rules

- Verify token before enqueue (valid `EAA…` in env)
- **One instance max** — stale cleanup keeps newest PID only
- Stop immediately on expired-token errors; fix token before re-queue

## Stale process cleanup

`stopStaleHeavyProcesses.mjs` kills **only**:

- Duplicate `facebook:marketplace-multipage` (keep 0 or 1)
- Duplicate `deploy` or `eas` (keep newest PID)

**Never kills:** Cursor, Docker Desktop, SSH sessions, system processes, or unrecognized PIDs.

## Optional background queue runner

Register a Windows scheduled task or run in a separate terminal:

```powershell
cd backend
npm run ops:cpu-queue-run:daemon
```

The daemon polls every ~20s, starts the next job when CPU allows, and respects `pause`.

## Limits

- Queue runs jobs **sequentially** on the local machine
- Does not throttle **remote** production servers (deploy still SSHs to server — only local CPU is gated)
- CPU metrics are best-effort; when in doubt, enqueue and wait
