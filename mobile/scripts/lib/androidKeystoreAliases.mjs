import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Avoid `${undefined}` in logs when spawnSync omits stdio. */
export function stdioText(result) {
  const o = result.stdout != null ? String(result.stdout) : "";
  const e = result.stderr != null ? String(result.stderr) : "";
  const bits = [o.trimEnd(), e.trimEnd()].filter(Boolean);
  let t = bits.join("\n").trim();
  if (!t && result.error) t = result.error.message || String(result.error);
  return t;
}

export function runKeytool(keytoolPath, args) {
  // Only use shell for bare `keytool` on PATH. A resolved path like
  // C:\Program Files\Java\...\keytool.exe must NOT use shell:true or cmd splits on spaces.
  const bareKeytool =
    process.platform === "win32" &&
    (keytoolPath === "keytool" || keytoolPath.toLowerCase() === "keytool.exe");
  return spawnSync(keytoolPath, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...(bareKeytool ? { shell: true } : {}),
  });
}

export function findKeytool() {
  const home = process.env.JAVA_HOME;
  if (home) {
    const win = path.join(home, "bin", "keytool.exe");
    if (fs.existsSync(win)) return win;
    const unix = path.join(home, "bin", "keytool");
    if (fs.existsSync(unix)) return unix;
  }
  if (process.platform === "win32") {
    const r = spawnSync("where", ["keytool"], { encoding: "utf8", shell: true });
    if (r.status === 0 && r.stdout?.trim()) return "keytool";
  } else {
    const r = spawnSync("command", ["-v", "keytool"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout?.trim()) return r.stdout.trim().split("\n")[0];
  }
  return "keytool";
}

function listVerbose(keystorePath, storePass) {
  const keytool = findKeytool();
  const result = runKeytool(keytool, [
    "-list",
    "-v",
    "-keystore",
    keystorePath,
    "-storepass",
    storePass,
  ]);
  const text = stdioText(result);
  if (result.status !== 0) {
    return {
      ok: false,
      text: text || `keytool exited with code ${result.status ?? "unknown"}`,
      aliases: [],
    };
  }
  const aliases = [...text.matchAll(/^Alias name:\s*(.+)$/gm)].map((m) => m[1].trim());
  return { ok: true, text, aliases };
}

function listShort(keystorePath, storePass) {
  const keytool = findKeytool();
  const result = runKeytool(keytool, ["-list", "-keystore", keystorePath, "-storepass", storePass]);
  const text = stdioText(result);
  if (result.status !== 0) return [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.includes("PrivateKeyEntry")) continue;
    const i = t.indexOf(",");
    if (i <= 0) continue;
    const name = t.slice(0, i).trim();
    if (name) out.push(name);
  }
  return [...new Set(out)];
}

/** @returns {{ ok: boolean, text: string, aliases: string[] }} */
export function listKeystoreAliases(keystorePath, storePass) {
  const v = listVerbose(keystorePath, storePass);
  if (!v.ok) return v;
  if (v.aliases.length) return v;
  const short = listShort(keystorePath, storePass);
  return { ok: true, text: v.text, aliases: short };
}
