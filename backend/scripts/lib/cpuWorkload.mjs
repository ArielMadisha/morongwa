#!/usr/bin/env node
/**
 * Cross-platform CPU + heavy-process metrics for dev-machine workload balancing.
 * Windows: PowerShell Get-Counter + Get-CimInstance command lines.
 * Unix: os.loadavg scaled estimate + ps.
 */
import os from "os";
import { execSync, spawnSync } from "child_process";

/** @typedef {{ cpuPercent: number; heavyNodeCount: number; heavyProcesses: Array<{ pid: number; kind: string; cmd: string }>; platform: string }} CpuSnapshot */

export const THRESHOLDS = {
  /** Do not start new heavy work above this system CPU % */
  startBlockCpuPercent: 85,
  /** Pause/stop lowest-priority running heavy jobs above this */
  pauseCpuPercent: 95,
  /** Resume queued work when CPU stays below this for resumeStableMs */
  resumeCpuPercent: 70,
  /** Milliseconds CPU must stay below resumeCpuPercent before starting next job */
  resumeStableMs: 30_000,
  /** Poll interval while waiting for CPU to drop (ms) */
  pollIntervalMs: 20_000,
  /** Max concurrent heavy node jobs before blocking new starts */
  maxHeavyNodeJobs: 8,
};

/** Substrings that identify heavy local node workloads (command line). */
export const HEAVY_JOB_PATTERNS = [
  { kind: "facebook-multipage", re: /backfillFacebookMarketplaceMultiPage|facebook:marketplace-multipage/i },
  { kind: "deploy", re: /deployProduction\.mjs|deploy:production|pushBackendFullRemote|publishFrontendRemote/i },
  { kind: "eas", re: /eas-cli|eas build|build:android:production|build:ios:production|release:android:play/i },
  { kind: "frontend-build", re: /next build|frontend[/\\].*npm run build/i },
  { kind: "ffmpeg", re: /\bffmpeg\b/i },
  { kind: "facebook-tv", re: /runFacebookTvIngest|facebook-tv:ingest/i },
];

/** Never terminate these (case-insensitive substring on command line or image name). */
export const PROTECTED_PROCESS_MARKERS = [
  "cursor",
  "code.exe",
  "docker desktop",
  "com.docker",
  "ssh ",
  "system",
  "csrss",
  "lsass",
  "services.exe",
  "winlogon",
  "explorer.exe",
];

const isWin = process.platform === "win32";

function runQuiet(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15_000,
      windowsHide: true,
      ...opts,
    }).trim();
  } catch {
    return "";
  }
}

/**
 * @returns {number} 0–100 system CPU utilization (best effort).
 */
export function getSystemCpuPercent() {
  if (isWin) {
    const ps = [
      "$c1 = (Get-Counter '\\Processor(_Total)\\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue",
      "Start-Sleep -Milliseconds 400",
      "$c2 = (Get-Counter '\\Processor(_Total)\\% Processor Time' -ErrorAction SilentlyContinue).CounterSamples.CookedValue",
      "if ($null -ne $c2) { [math]::Round([double]$c2, 1) } elseif ($null -ne $c1) { [math]::Round([double]$c1, 1) } else { -1 }",
    ].join("; ");
    const out = runQuiet(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
    const n = parseFloat(out);
    if (Number.isFinite(n) && n >= 0) return Math.min(100, n);
    const wmic = runQuiet("wmic cpu get loadpercentage /value");
    const m = wmic.match(/LoadPercentage=(\d+)/i);
    if (m) return Math.min(100, parseInt(m[1], 10));
  }

  const load = os.loadavg()[0] ?? 0;
  const cores = Math.max(1, os.cpus().length);
  return Math.min(100, Math.round((load / cores) * 100));
}

/**
 * @returns {Array<{ pid: number; cmd: string }>}
 */
export function listNodeProcesses() {
  if (isWin) {
    const ps = [
      "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" -ErrorAction SilentlyContinue",
      "| Select-Object ProcessId, CommandLine",
      "| ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }",
    ].join(" ");
    const out = runQuiet(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`);
    return out
      .split(/\r?\n/)
      .map((line) => {
        const tab = line.indexOf("\t");
        if (tab < 0) return null;
        const pid = parseInt(line.slice(0, tab), 10);
        const cmd = line.slice(tab + 1).trim();
        if (!Number.isFinite(pid)) return null;
        return { pid, cmd };
      })
      .filter(Boolean);
  }

  const out = runQuiet("ps -ax -o pid=,command= 2>/dev/null | grep -i node || true");
  return out
    .split(/\r?\n/)
    .map((line) => {
      const m = line.trim().match(/^(\d+)\s+(.*)$/);
      if (!m) return null;
      return { pid: parseInt(m[1], 10), cmd: m[2] };
    })
    .filter(Boolean);
}

/**
 * @param {string} cmd
 * @returns {string | null}
 */
export function classifyHeavyJob(cmd) {
  const s = String(cmd || "");
  for (const { kind, re } of HEAVY_JOB_PATTERNS) {
    if (re.test(s)) return kind;
  }
  return null;
}

/**
 * @returns {CpuSnapshot}
 */
export function getCpuSnapshot() {
  const cpuPercent = getSystemCpuPercent();
  const nodeProcs = listNodeProcesses();
  /** @type {CpuSnapshot["heavyProcesses"]} */
  const heavyProcesses = [];
  for (const p of nodeProcs) {
    const kind = classifyHeavyJob(p.cmd);
    if (kind) heavyProcesses.push({ pid: p.pid, kind, cmd: p.cmd.slice(0, 240) });
  }
  return {
    cpuPercent,
    heavyNodeCount: heavyProcesses.length,
    heavyProcesses,
    platform: process.platform,
  };
}

/**
 * @param {CpuSnapshot} snap
 */
export function shouldBlockNewHeavyWork(snap) {
  return (
    snap.cpuPercent >= THRESHOLDS.startBlockCpuPercent ||
    snap.heavyNodeCount >= THRESHOLDS.maxHeavyNodeJobs
  );
}

/**
 * @param {CpuSnapshot} snap
 */
export function shouldPauseRunningHeavyWork(snap) {
  return snap.cpuPercent >= THRESHOLDS.pauseCpuPercent;
}

/**
 * @param {number} cpuPercent
 * @param {number | null} belowSinceMs epoch ms when CPU first dropped below resume threshold
 * @returns {{ ready: boolean; belowSinceMs: number | null }}
 */
export function resumeReady(cpuPercent, belowSinceMs) {
  const now = Date.now();
  if (cpuPercent >= THRESHOLDS.resumeCpuPercent) {
    return { ready: false, belowSinceMs: null };
  }
  const since = belowSinceMs ?? now;
  const ready = now - since >= THRESHOLDS.resumeStableMs;
  return { ready, belowSinceMs: since };
}

/**
 * @param {string} cmd
 */
export function isProtectedProcess(cmd) {
  const lower = String(cmd || "").toLowerCase();
  return PROTECTED_PROCESS_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

/** Priority for stale cleanup — lower number = kill first when duplicates exist. */
export const STALE_KILL_PRIORITY = {
  "facebook-multipage": 1,
  deploy: 2,
  eas: 2,
  "frontend-build": 3,
  ffmpeg: 3,
  "facebook-tv": 4,
};

/**
 * @param {number} pid
 * @param {boolean} [force]
 */
export function killProcessTree(pid, force = false) {
  if (!Number.isFinite(pid) || pid <= 0) return { ok: false, error: "invalid pid" };
  if (isWin) {
    const r = spawnSync("taskkill", force ? ["/PID", String(pid), "/T", "/F"] : ["/PID", String(pid), "/T"], {
      encoding: "utf8",
      windowsHide: true,
    });
    return { ok: (r.status ?? 1) === 0, stderr: String(r.stderr || "") };
  }
  process.kill(pid, force ? "SIGKILL" : "SIGTERM");
  return { ok: true };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
