/**
 * QwertyPodcasts processing layer.
 *
 * Phase 1 (implemented here):
 *   - Duration probe via ffprobe (best effort).
 *   - Audio transcode to adaptive bitrates + an HLS audio manifest via ffmpeg,
 *     following the same "spawn a local ffmpeg" pattern used by tvChannelRestreamWorker.
 *     When ffmpeg is unavailable the episode stays playable from its original file
 *     and transcodeState becomes "skipped".
 *   - Text moderation of title/description/tags.
 *
 * Deferred (hooks below, see DOCS/QwertyPodcasts/ARCHITECTURE.md):
 *   - AskMacGyver speech-to-text transcripts.
 *   - Audio content moderation (only text is screened today).
 *   - DRM-protected offline downloads and server-side dynamic ad stitching.
 *
 * Env:
 *   PODCAST_FFMPEG_BIN      ffmpeg binary (default "ffmpeg")
 *   PODCAST_FFPROBE_BIN     ffprobe binary (default "ffprobe")
 *   PODCAST_TRANSCODE=0     disable transcoding entirely
 *   PODCAST_TRANSCRIPTS=1   enable the AskMacGyver transcript hook
 */

import path from "path";
import fs from "fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "./monitoring";
import PodcastEpisode from "../data/models/PodcastEpisode";
import { PODCAST_UPLOAD_DIR, podcastPublicUrl } from "../middleware/podcastUpload";

const execFileAsync = promisify(execFile);

/** Adaptive ladder for spoken-word audio. */
export const PODCAST_BITRATES = [64, 128] as const;

function ffmpegBin() {
  return process.env.PODCAST_FFMPEG_BIN || "ffmpeg";
}

function ffprobeBin() {
  return process.env.PODCAST_FFPROBE_BIN || "ffprobe";
}

function transcodeEnabled() {
  return process.env.PODCAST_TRANSCODE !== "0";
}

export async function probeDurationSeconds(filePath: string): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync(
      ffprobeBin(),
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { timeout: 30_000 }
    );
    const seconds = Number(String(stdout).trim());
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : undefined;
  } catch {
    return undefined;
  }
}

/** Basic keyword screen for episode metadata. Audio-content moderation is deferred. */
const BLOCKED_TEXT_PATTERNS = [
  /\bchild\s*porn\b/i,
  /\bcsam\b/i,
  /\brape\s*(video|clip)\b/i,
  /\bterror(ist)?\s*recruit/i,
];

export function moderateEpisodeText(input: { title?: string; description?: string; tags?: string[] }): {
  state: "approved" | "flagged";
  reason?: string;
} {
  const blob = [input.title, input.description, ...(input.tags || [])].filter(Boolean).join(" \n ");
  const hit = BLOCKED_TEXT_PATTERNS.find((re) => re.test(blob));
  if (hit) return { state: "flagged", reason: "Episode metadata matched a prohibited-content filter." };
  return { state: "approved" };
}

async function transcodeRendition(sourcePath: string, baseName: string, bitrateKbps: number) {
  const outName = `${baseName}-${bitrateKbps}k.m4a`;
  const outPath = path.join(PODCAST_UPLOAD_DIR, outName);
  await execFileAsync(
    ffmpegBin(),
    ["-y", "-i", sourcePath, "-vn", "-c:a", "aac", "-b:a", `${bitrateKbps}k`, "-ar", "44100", "-ac", "2", outPath],
    { timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 }
  );
  return { bitrateKbps, url: podcastPublicUrl(outName), codec: "aac" };
}

/**
 * Write a master HLS manifest pointing at per-bitrate media playlists.
 * ffmpeg produces the media playlists; this only stitches the variant list.
 */
async function buildHls(sourcePath: string, baseName: string): Promise<string | undefined> {
  const variants: { bitrateKbps: number; playlist: string }[] = [];
  for (const bitrateKbps of PODCAST_BITRATES) {
    const playlistName = `${baseName}-${bitrateKbps}k.m3u8`;
    const playlistPath = path.join(PODCAST_UPLOAD_DIR, playlistName);
    await execFileAsync(
      ffmpegBin(),
      [
        "-y",
        "-i",
        sourcePath,
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        `${bitrateKbps}k`,
        "-ar",
        "44100",
        "-ac",
        "2",
        "-f",
        "hls",
        "-hls_time",
        "10",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        path.join(PODCAST_UPLOAD_DIR, `${baseName}-${bitrateKbps}k-%03d.ts`),
        playlistPath,
      ],
      { timeout: 20 * 60_000, maxBuffer: 16 * 1024 * 1024 }
    );
    variants.push({ bitrateKbps, playlist: playlistName });
  }
  if (!variants.length) return undefined;
  const masterName = `${baseName}.m3u8`;
  const master = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    ...variants.flatMap((v) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${v.bitrateKbps * 1000},CODECS="mp4a.40.2"`,
      v.playlist,
    ]),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(PODCAST_UPLOAD_DIR, masterName), master, "utf8");
  return podcastPublicUrl(masterName);
}

/**
 * Fire-and-forget processing after an episode is created. Failures never break upload:
 * the original audio URL remains playable.
 */
export function processEpisodeInBackground(episodeId: string, sourceFilePath: string): void {
  void (async () => {
    try {
      const duration = await probeDurationSeconds(sourceFilePath);
      if (duration) {
        await PodcastEpisode.updateOne({ _id: episodeId }, { $set: { durationSeconds: duration } });
      }

      if (!transcodeEnabled()) {
        await PodcastEpisode.updateOne({ _id: episodeId }, { $set: { transcodeState: "skipped" } });
        return;
      }

      await PodcastEpisode.updateOne({ _id: episodeId }, { $set: { transcodeState: "processing" } });
      const baseName = path.basename(sourceFilePath, path.extname(sourceFilePath));

      const renditions: { bitrateKbps: number; url: string; codec?: string }[] = [];
      for (const bitrateKbps of PODCAST_BITRATES) {
        renditions.push(await transcodeRendition(sourceFilePath, baseName, bitrateKbps));
      }
      const hlsUrl = await buildHls(sourceFilePath, baseName);

      await PodcastEpisode.updateOne(
        { _id: episodeId },
        { $set: { renditions, hlsUrl, transcodeState: "ready" } }
      );
      logger.info("[podcasts] episode transcoded", { episodeId, renditions: renditions.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const missingFfmpeg = /ENOENT|not recognized|not found/i.test(message);
      await PodcastEpisode.updateOne(
        { _id: episodeId },
        {
          $set: {
            transcodeState: missingFfmpeg ? "skipped" : "failed",
            transcodeError: message.slice(0, 500),
          },
        }
      ).catch(() => undefined);
      if (missingFfmpeg) {
        logger.warn("[podcasts] ffmpeg unavailable — serving original audio", { episodeId });
      } else {
        logger.error("[podcasts] transcode failed", { episodeId, error: message });
      }
    }
  })();
}

/**
 * Deferred hook: AskMacGyver speech-to-text. Enabled with PODCAST_TRANSCRIPTS=1 once a
 * transcription endpoint is wired into the MacGyver service.
 */
export async function requestTranscript(episodeId: string): Promise<"queued" | "disabled"> {
  if (process.env.PODCAST_TRANSCRIPTS !== "1") {
    await PodcastEpisode.updateOne({ _id: episodeId }, { $set: { transcriptState: "skipped" } }).catch(
      () => undefined
    );
    return "disabled";
  }
  await PodcastEpisode.updateOne({ _id: episodeId }, { $set: { transcriptState: "pending" } }).catch(
    () => undefined
  );
  return "queued";
}
