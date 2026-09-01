#!/usr/bin/env node
/**
 * CPU-aware task queue for Qwertymates dev machine (Windows-first, cross-platform).
 *
 *   node scripts/cpuAwareTaskQueue.mjs status
 *   node scripts/cpuAwareTaskQueue.mjs enqueue --type deploy --priority 10 -- npm run deploy:production
 *   node scripts/cpuAwareTaskQueue.mjs run            # process queue until empty
 *   node scripts/cpuAwareTaskQueue.mjs run --daemon   # keep polling for new jobs
 *   node scripts/cpuAwareTaskQueue.mjs pause
 *   node scripts/cpuAwareTaskQueue.mjs resume
 *   node scripts/cpuAwareTaskQueue.mjs clear-finished
 *
 * State: backend/exports/cpu-task-queue-state.json
 * Queue: backend/exports/cpu-task-queue.json
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import {
  THRESHOLDS,
  classifyHeavyJob,
  getCpuSnapshot,
  resumeReady,
  shouldBlockNewHeavyWork,
  sleep,
} from "./lib/cpuWorkload.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, "..");
const EXPORTS_DIR = path.join(BACKEND_ROOT, "exports");
const QUEUE_PATH = path.join(EXPORTS_DIR, "cpu-task-queue.json");
const STATE_PATH = path.join(EXPORTS_DIR, "cpu-task-queue-state.json");

function ensureExports() {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureExports();
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function defaultQueue() {
  return { version: 1, jobs: [] };
}

function defaultState() {
  return {
    paused: false,
    running: null,
    cpuBelowResumeSinceMs: null,
    updatedAt: new Date().toISOString(),
  };
}

function loadQueue() {
  return readJson(QUEUE_PATH, defaultQueue());
}

function saveQueue(q) {
  writeJson(QUEUE_PATH, q);
}

function loadState() {
  return { ...defaultState(), ...readJson(STATE_PATH, defaultState()) };
}

function saveState(state) {
  writeJson(STATE_PATH, { ...state, updatedAt: new Date().toISOString() });
}

function parseArgs(argv) {
  const args = [...argv];
  const cmd = args.shift() || "status";
  /** @type {Record<string, string>} */
  const flags = {};
  while (args[0]?.startsWith("--") && args[0] !== "--") {
    const raw = args.shift();
    const eq = raw.indexOf("=");
    if (eq > 2) {
      flags[raw.slice(2, eq)] = raw.slice(eq + 1);
    } else {
      const key = raw.slice(2);
      if (args[0] && !args[0].startsWith("--")) flags[key] = args.shift();
      else flags[key] = "true";
    }
  }
  if (args[0] === "--") args.shift();
  return { cmd, flags, rest: args };
}

function inferJobType(command) {
  return classifyHeavyJob(command) || "generic";
}

function formatStatus() {
  const snap = getCpuSnapshot();
  const queue = loadQueue();
  const state = loadState();
  const pending = queue.jobs.filter((j) => j.status === "pending");
  const block = shouldBlockNewHeavyWork(snap);
  const resume = resumeReady(snap.cpuPercent, state.cpuBelowResumeSinceMs);
  const canStartHeavy = !block && (snap.cpuPercent < THRESHOLDS.resumeCpuPercent || resume.ready);

  console.log("CPU workload queue — status");
  console.log(`  platform:           ${snap.platform}`);
  console.log(`  system CPU:         ${snap.cpuPercent}%`);
  console.log(`  heavy node jobs:    ${snap.heavyNodeCount} (max ${THRESHOLDS.maxHeavyNodeJobs})`);
  console.log(`  block new work:     ${block ? "YES" : "no"} (>= ${THRESHOLDS.startBlockCpuPercent}% CPU or too many node jobs)`);
  console.log(`  can start heavy:    ${canStartHeavy ? "YES" : "no"}`);
  if (snap.cpuPercent < THRESHOLDS.resumeCpuPercent && !resume.ready && pending.length) {
    const since = state.cpuBelowResumeSinceMs ?? Date.now();
    const elapsed = Math.floor((Date.now() - since) / 1000);
    console.log(`  resume stability:   ${elapsed}s / ${THRESHOLDS.resumeStableMs / 1000}s below ${THRESHOLDS.resumeCpuPercent}%`);
  }
  console.log(`  queue paused:       ${state.paused ? "YES" : "no"}`);
  console.log(`  queue depth:        ${pending.length} pending / ${queue.jobs.length} total`);
  if (state.running) {
    console.log(`  running job:        ${state.running.id} pid=${state.running.pid}`);
    console.log(`                      ${state.running.command}`);
  } else {
    console.log("  running job:        (none)");
  }
  if (snap.heavyProcesses.length) {
    console.log("  heavy processes:");
    for (const p of snap.heavyProcesses.slice(0, 12)) {
      console.log(`    pid=${p.pid} kind=${p.kind}`);
    }
  }
  if (pending.length) {
    console.log("  next queued:");
    for (const j of pending.slice(0, 5)) {
      console.log(`    [${j.id.slice(0, 8)}] type=${j.type} ${j.command}`);
    }
  }
  console.log(`  thresholds: start-block ${THRESHOLDS.startBlockCpuPercent}%, pause ${THRESHOLDS.pauseCpuPercent}%, resume ${THRESHOLDS.resumeCpuPercent}%`);
  console.log(`  state file: ${STATE_PATH}`);
  console.log(`  queue file: ${QUEUE_PATH}`);
}

function enqueueJob(flags, rest) {
  if (!rest.length) {
    console.error("Usage: cpuAwareTaskQueue.mjs enqueue [--type deploy] [--cwd backend] [--priority 50] -- <command...>");
    process.exit(1);
  }
  const command = rest.join(" ");
  const queue = loadQueue();
  const job = {
    id: randomUUID(),
    command,
    cwd: flags.cwd ? path.resolve(flags.cwd) : BACKEND_ROOT,
    type: flags.type || inferJobType(command),
    priority: Number(flags.priority ?? 50),
    status: "pending",
    enqueuedAt: new Date().toISOString(),
  };
  queue.jobs.push(job);
  saveQueue(queue);
  console.log(`Enqueued ${job.id} type=${job.type}`);
  console.log(`  ${command}`);
  console.log("Run: npm run ops:cpu-queue-run");
}

function clearFinished() {
  const queue = loadQueue();
  const before = queue.jobs.length;
  queue.jobs = queue.jobs.filter((j) => j.status === "pending" || j.status === "running");
  saveQueue(queue);
  console.log(`Removed ${before - queue.jobs.length} finished job(s).`);
}

function setPaused(paused) {
  const state = loadState();
  state.paused = paused;
  saveState(state);
  console.log(paused ? "Queue paused." : "Queue resumed.");
}

/**
 * @param {import('./lib/cpuWorkload.mjs').CpuSnapshot} snap
 * @param {ReturnType<typeof loadState>} state
 */
function updateResumeTracker(snap, state) {
  const r = resumeReady(snap.cpuPercent, state.cpuBelowResumeSinceMs);
  state.cpuBelowResumeSinceMs = r.belowSinceMs;
  return r.ready;
}

/**
 * @param {{ id: string; command: string; cwd: string }} job
 */
function runJob(job) {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const child = spawn(job.command, {
      cwd: job.cwd,
      shell: true,
      stdio: "inherit",
      env: process.env,
      windowsHide: false,
    });
    const state = loadState();
    state.running = {
      id: job.id,
      pid: child.pid ?? null,
      command: job.command,
      startedAt: new Date().toISOString(),
    };
    saveState(state);

    child.on("close", (code) => {
      const st = loadState();
      st.running = null;
      st.cpuBelowResumeSinceMs = null;
      saveState(st);
      resolve(code ?? 1);
    });
  });
}

async function processQueue(options = {}) {
  const { daemon = false } = options;
  ensureExports();

  while (true) {
    const state = loadState();
    if (state.paused) {
      console.log("Queue is paused. Use: npm run ops:cpu-queue-resume");
      if (!daemon) break;
      await sleep(THRESHOLDS.pollIntervalMs);
      continue;
    }

    if (state.running) {
      console.log(`Job already running: ${state.running.id}. Wait or check status.`);
      if (!daemon) break;
      await sleep(THRESHOLDS.pollIntervalMs);
      continue;
    }

    const queue = loadQueue();
    const pending = queue.jobs
      .filter((j) => j.status === "pending")
      .sort((a, b) => a.priority - b.priority || a.enqueuedAt.localeCompare(b.enqueuedAt));

    if (!pending.length) {
      if (!daemon) {
        console.log("Queue empty.");
        break;
      }
      await sleep(THRESHOLDS.pollIntervalMs);
      continue;
    }

    const snap = getCpuSnapshot();
    const st = loadState();
    const ready = updateResumeTracker(snap, st);
    saveState(st);

    if (shouldBlockNewHeavyWork(snap) || !ready) {
      console.log(
        `Waiting for CPU headroom (CPU ${snap.cpuPercent}%, heavy nodes ${snap.heavyNodeCount}, resume ready=${ready})…`,
      );
      await sleep(THRESHOLDS.pollIntervalMs);
      continue;
    }

    const job = pending[0];
    job.status = "running";
    job.startedAt = new Date().toISOString();
    saveQueue(queue);

    console.log(`Starting queued job ${job.id} (${job.type}): ${job.command}`);
    const code = await runJob(job);

    const q2 = loadQueue();
    const j = q2.jobs.find((x) => x.id === job.id);
    if (j) {
      j.status = code === 0 ? "completed" : "failed";
      j.exitCode = code;
      j.finishedAt = new Date().toISOString();
    }
    saveQueue(q2);
    console.log(`Job ${job.id} finished exit=${code}`);

    if (!daemon) break;
    await sleep(5000);
  }
}

async function main() {
  const { cmd, flags, rest } = parseArgs(process.argv.slice(2));

  switch (cmd) {
    case "status":
      formatStatus();
      break;
    case "enqueue":
      enqueueJob(flags, rest);
      break;
    case "pause":
      setPaused(true);
      break;
    case "resume":
      setPaused(false);
      break;
    case "clear-finished":
      clearFinished();
      break;
    case "run":
      await processQueue({ daemon: flags.daemon === "true" || process.argv.includes("--daemon") });
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error("Commands: status | enqueue | run [--daemon] | pause | resume | clear-finished");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
