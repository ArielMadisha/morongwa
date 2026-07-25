#!/usr/bin/env node
/**
 * Update local FACEBOOK_* tokens from CLI arg, then optionally sync remote.
 *
 *   node scripts/applyFacebookTokenFromArg.mjs --token=EAA... --sync-remote
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const envPath = path.join(backendRoot, ".env");

const args = process.argv.slice(2);
const syncRemote = args.includes("--sync-remote");
const tokenArg = args.find((a) => a.startsWith("--token="));
const token = (tokenArg ? tokenArg.slice("--token=".length) : "").trim();

if (!token || token.length < 40) {
  console.error("Pass --token=EAA... (min 40 chars)");
  process.exit(1);
}

function upsertEnv(raw, key, val) {
  const line = `${key}=${val}`;
  if (new RegExp(`^${key}=`, "m").test(raw)) {
    return raw.replace(new RegExp(`^${key}=.*$`, "m"), line);
  }
  return raw.replace(/\s*$/, "\n") + line + "\n";
}

async function main() {
  let raw = fs.readFileSync(envPath, "utf8");
  raw = upsertEnv(raw, "FACEBOOK_PAGE_ACCESS_TOKEN", token);
  fs.writeFileSync(envPath, raw);
  console.log(`Updated FACEBOOK_PAGE_ACCESS_TOKEN (len=${token.length})`);

  const me = await axios.get("https://graph.facebook.com/v21.0/me", {
    params: { access_token: token, fields: "id,name" },
    timeout: 20000,
    validateStatus: () => true,
  });
  console.log("me", me.status, me.data?.name || JSON.stringify(me.data).slice(0, 200));

  const dbg = await axios.get("https://graph.facebook.com/v21.0/debug_token", {
    params: { input_token: token, access_token: token },
    timeout: 20000,
    validateStatus: () => true,
  });
  const d = dbg.data?.data || {};
  console.log("valid", d.is_valid, "scopes", (d.scopes || []).join(","));

  const accounts = await axios.get("https://graph.facebook.com/v21.0/me/accounts", {
    params: { access_token: token, fields: "id,name,access_token" },
    timeout: 20000,
    validateStatus: () => true,
  });
  const list = Array.isArray(accounts.data?.data) ? accounts.data.data : [];
  console.log("pages", list.map((a) => `${a.name}:${a.id}`).join(" | ") || JSON.stringify(accounts.data).slice(0, 200));

  const q = list.find((a) => String(a.name || "").toLowerCase() === "qwertymates");
  if (!q?.access_token) {
    console.error("Qwertymates page token not found under /me/accounts");
    process.exit(1);
  }

  raw = fs.readFileSync(envPath, "utf8");
  raw = upsertEnv(raw, "FACEBOOK_QWERTYMATES_PAGE_ID", q.id);
  raw = upsertEnv(raw, "FACEBOOK_QWERTYMATES_PAGE_ACCESS_TOKEN", q.access_token);
  fs.writeFileSync(envPath, raw);
  console.log(`Stored Qwertymates page token (len=${q.access_token.length}, id=${q.id})`);

  if (syncRemote) {
    const r = spawnSync(process.execPath, ["scripts/remoteSyncFacebookPageTokenAndPageId.mjs"], {
      cwd: backendRoot,
      stdio: "inherit",
      env: process.env,
    });
    if (r.status !== 0) process.exit(r.status || 1);
  } else {
    console.log("Local only. Re-run with --sync-remote to patch production.");
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
