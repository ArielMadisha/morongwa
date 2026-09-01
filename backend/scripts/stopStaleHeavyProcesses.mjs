#!/usr/bin/env node
/**
 * Conservative cleanup of duplicate heavy dev-machine processes.
 * Keeps at most one instance per heavy job kind (facebook-multipage, deploy, eas).
 * Never kills Cursor, Docker Desktop, SSH, or unknown PIDs.
 *
 *   node scripts/stopStaleHeavyProcesses.mjs
 *   node scripts/stopStaleHeavyProcesses.mjs --dry-run
 */
import {
  STALE_KILL_PRIORITY,
  classifyHeavyJob,
  getCpuSnapshot,
  isProtectedProcess,
  killProcessTree,
  listNodeProcesses,
} from "./lib/cpuWorkload.mjs";

const dryRun = process.argv.includes("--dry-run");

/** @type {Map<string, Array<{ pid: number; cmd: string }>>} */
function groupHeavyByKind() {
  const groups = new Map();
  for (const p of listNodeProcesses()) {
    if (isProtectedProcess(p.cmd)) continue;
    const kind = classifyHeavyJob(p.cmd);
    if (!kind) continue;
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(p);
  }
  return groups;
}

function pickVictims(groups) {
  /** @type {Array<{ pid: number; kind: string; cmd: string; reason: string }>} */
  const victims = [];

  for (const [kind, procs] of groups) {
    if (kind === "facebook-multipage") {
      // Keep 0 or 1 — kill all but the newest PID when >1
      if (procs.length <= 1) continue;
      const sorted = [...procs].sort((a, b) => b.pid - a.pid);
      for (const p of sorted.slice(1)) {
        victims.push({
          pid: p.pid,
          kind,
          cmd: p.cmd,
          reason: `duplicate ${kind} (${procs.length} running, keep newest pid ${sorted[0].pid})`,
        });
      }
      continue;
    }

    if (kind === "deploy" || kind === "eas") {
      if (procs.length <= 1) continue;
      const sorted = [...procs].sort((a, b) => b.pid - a.pid);
      for (const p of sorted.slice(1)) {
        victims.push({
          pid: p.pid,
          kind,
          cmd: p.cmd,
          reason: `duplicate ${kind} (${procs.length} running, keep newest pid ${sorted[0].pid})`,
        });
      }
    }
  }

  return victims.sort(
    (a, b) => (STALE_KILL_PRIORITY[a.kind] ?? 99) - (STALE_KILL_PRIORITY[b.kind] ?? 99),
  );
}

function main() {
  const snap = getCpuSnapshot();
  console.log(`CPU ${snap.cpuPercent}% | heavy node jobs: ${snap.heavyNodeCount}`);
  if (dryRun) console.log("(dry-run — no processes will be killed)\n");

  const groups = groupHeavyByKind();
  const victims = pickVictims(groups);

  if (!victims.length) {
    console.log("No duplicate heavy processes to stop.");
    return;
  }

  for (const v of victims) {
    console.log(`${dryRun ? "[dry-run] would kill" : "killing"} pid=${v.pid} (${v.kind}): ${v.reason}`);
    console.log(`  cmd: ${v.cmd.slice(0, 200)}`);
    if (!dryRun) {
      const r = killProcessTree(v.pid, true);
      if (!r.ok) console.warn(`  taskkill failed: ${r.stderr || "unknown"}`);
    }
  }

  console.log(`\nDone. ${victims.length} duplicate process(es) ${dryRun ? "identified" : "terminated"}.`);
  console.log("Protected: Cursor IDE, Docker Desktop, SSH, system processes, unknown PIDs.");
}

main();
