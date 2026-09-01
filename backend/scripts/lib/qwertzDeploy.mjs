/**
 * Shared helpers for Qwertz production deploy + env sync.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

export const QWERTZ_KEYS = ["QWERTZ_API_URL", "QWERTZ_API_KEY"];

/** Default: sibling Cursor project Qwertz next to morongwa monorepo. */
export function resolveLocalQwertzRoot(repoRoot) {
  const fromEnv = (process.env.QWERTZ_LOCAL_DIR || "").trim();
  if (fromEnv && fs.existsSync(fromEnv)) return path.resolve(fromEnv);
  const sibling = path.resolve(repoRoot, "..", "Qwertz");
  if (fs.existsSync(sibling)) return sibling;
  const cursor = path.resolve("C:/Users/Dell/.cursor/projects/Qwertz");
  if (fs.existsSync(cursor)) return cursor;
  throw new Error(
    "Qwertz source not found. Set QWERTZ_LOCAL_DIR to the Qwertz repo root (with package.json)."
  );
}

export function resolveRemoteQwertzRoot(cfg) {
  const explicit = (cfg.QWERTZ_REMOTE_DIR || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const live = (cfg.MORONGWA_LIVE_DIR || "").trim().replace(/\/$/, "");
  if (live) return `${path.dirname(live)}/qwertz`;
  return "/home/zweppe/qwertz";
}

/** Morongwa API container reaches Qwertz via Docker DNS on shared-network. */
export function defaultQwertzApiUrl(cfg) {
  const name = (cfg.QWERTZ_DOCKER_NAME || "qwertz-api").trim() || "qwertz-api";
  const port = (cfg.QWERTZ_PORT || "4100").trim() || "4100";
  return `http://${name}:${port}`;
}

export function ensureQwertzApiKey(localKv) {
  let key = String(localKv.QWERTZ_API_KEY || "").trim();
  if (!key) key = crypto.randomBytes(32).toString("hex");
  return key;
}

export function buildQwertzEnvUpdates(localKv, cfg) {
  const apiKey = ensureQwertzApiKey(localKv);
  const apiUrl = String(localKv.QWERTZ_API_URL || "").trim() || defaultQwertzApiUrl(cfg);
  return {
    QWERTZ_API_URL: apiUrl.replace(/\/$/, ""),
    QWERTZ_API_KEY: apiKey,
  };
}

export function buildQwertzServiceEnv(updates, cfg) {
  const port = (cfg.QWERTZ_PORT || "4100").trim() || "4100";
  const uploadDir = (cfg.QWERTZ_UPLOAD_DIR || "/app/uploads").trim() || "/app/uploads";
  const publicBase = String(cfg.QWERTZ_PUBLIC_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, "");
  return {
    PORT: port,
    NODE_ENV: "production",
    QWERTZ_API_KEY: updates.QWERTZ_API_KEY,
    QWERTZ_UPLOAD_DIR: uploadDir,
    QWERTZ_PUBLIC_BASE_URL: publicBase,
  };
}

export function upsertLocalEnvFile(envPath, updates) {
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const keys = new Set(Object.keys(updates));
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && keys.has(m[1])) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push(`${m[1]}=${updates[m[1]]}`);
      continue;
    }
    out.push(line);
  }
  for (const k of keys) {
    if (!seen.has(k)) out.push(`${k}=${updates[k]}`);
  }
  fs.writeFileSync(envPath, out.join("\n") + (out.length ? "\n" : ""), "utf8");
}
