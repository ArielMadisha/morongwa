import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "node:child_process";
import { logger } from "./monitoring";
import { getChannelNowPayload } from "./tvChannelRuntime";

function uploadsRootDir(): string {
  const candidates = [
    path.join(process.cwd(), "uploads"),
    path.join(__dirname, "..", "..", "uploads"),
    path.join(__dirname, "..", "..", "..", "uploads"),
  ];
  return (
    candidates.find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    }) ?? candidates[0]
  );
}

function resolveLocalVideoPath(videoUrl: string): string | null {
  const v = String(videoUrl || "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return null;
  const rel = v.startsWith("/") ? v.slice(1) : v;
  const root = uploadsRootDir();
  const inner = rel.startsWith("uploads/") ? rel.slice("uploads/".length) : rel;
  const abs = path.normalize(path.join(root, inner));
  try {
    if (fs.existsSync(abs)) return abs;
  } catch {
    /* ignore */
  }
  return null;
}

let timer: ReturnType<typeof setInterval> | null = null;
let child: ChildProcess | null = null;
let spawnWallMs = 0;
let spawnPositionMs = 0;
let lastProgramKey = "";

function killChild(reason: string) {
  if (!child) return;
  logger.info(`[tv-channel-restream] stopping ffmpeg (${reason})`);
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  child = null;
}

function startFfmpeg(localPath: string, positionMs: number, rtmpUrl: string) {
  killChild("restart");
  const ss = Math.max(0, positionMs / 1000);
  const args = [
    "-hide_banner",
    "-loglevel",
    process.env.TV_CHANNEL_FFMPEG_LOGLEVEL || "warning",
    "-ss",
    String(ss),
    "-re",
    "-i",
    localPath,
    "-c",
    "copy",
    "-f",
    "flv",
    rtmpUrl,
  ];
  const proc = spawn(process.env.TV_CHANNEL_FFMPEG_BIN || "ffmpeg", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child = proc;
  proc.stderr?.on("data", (chunk: Buffer) => {
    const line = String(chunk || "").trim();
    if (line) logger.warn(`[tv-channel-restream] ${line}`);
  });
  proc.on("exit", (code, signal) => {
    if (child === proc) child = null;
    if (code !== 0 && code !== null) {
      logger.warn(`[tv-channel-restream] ffmpeg exited code=${code} signal=${signal ?? ""}`);
    }
  });
  proc.on("error", (err) => {
    logger.error("[tv-channel-restream] ffmpeg spawn error:", err);
  });
  logger.info(`[tv-channel-restream] started ffmpeg -ss ${ss}s → RTMP`);
}

/**
 * Optional: restream the current linear channel asset to RTMP (e.g. nginx-rtmp → HLS).
 * Enable with TV_CHANNEL_FFMPEG_RTMP_URL. Polls playout state and restarts on programme change / drift.
 */
export function startTvChannelRestreamWorker(): void {
  const rtmpUrl = String(process.env.TV_CHANNEL_FFMPEG_RTMP_URL || "").trim();
  if (!rtmpUrl) {
    logger.info("[tv-channel-restream] disabled (set TV_CHANNEL_FFMPEG_RTMP_URL to enable)");
    return;
  }
  if (timer) return;

  const pollMs = Math.max(500, Number(process.env.TV_CHANNEL_FFMPEG_POLL_MS) || 2000);
  const driftMs = Math.max(500, Number(process.env.TV_CHANNEL_FFMPEG_RESYNC_DRIFT_MS) || 4000);
  const periodicMs = Math.max(0, Number(process.env.TV_CHANNEL_FFMPEG_RESYNC_PERIOD_MS) || 120000);

  const tick = async () => {
    try {
      const payload = await getChannelNowPayload();
      if (payload.isPaused || !payload.current || typeof payload.current.videoUrl !== "string") {
        killChild("paused or no current");
        lastProgramKey = "";
        spawnWallMs = 0;
        return;
      }
      const videoUrl = payload.current.videoUrl as string;
      const localPath = resolveLocalVideoPath(videoUrl);
      if (!localPath) {
        logger.warn(`[tv-channel-restream] cannot map to local file: ${videoUrl}`);
        killChild("no local file");
        return;
      }

      const pid = String((payload.current as { _id?: unknown })._id ?? "");
      const programKey = `${pid}|${videoUrl}`;
      const serverWallMs = Date.parse(payload.serverTime) || Date.now();
      const pos = Number(payload.positionMs) || 0;

      let needRestart = !child || programKey !== lastProgramKey;
      if (!needRestart && spawnWallMs > 0) {
        const expected = spawnPositionMs + (Date.now() - spawnWallMs);
        if (Math.abs(pos - expected) > driftMs) needRestart = true;
      }
      if (!needRestart && periodicMs > 0 && spawnWallMs > 0 && Date.now() - spawnWallMs > periodicMs) {
        needRestart = true;
      }

      if (needRestart) {
        lastProgramKey = programKey;
        spawnWallMs = Date.now();
        spawnPositionMs = pos;
        startFfmpeg(localPath, pos, rtmpUrl);
      }
    } catch (e) {
      logger.error("[tv-channel-restream] tick error:", e);
    }
  };

  void tick();
  timer = setInterval(() => void tick(), pollMs);
  logger.info(`[tv-channel-restream] worker running (poll ${pollMs}ms)`);
}

export function stopTvChannelRestreamWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  killChild("shutdown");
  lastProgramKey = "";
  spawnWallMs = 0;
}
