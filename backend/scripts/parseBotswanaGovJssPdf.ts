/**
 * One-off / refresh: extract school names from the official Gov BW PDF into JSON.
 *
 * Source (Government of Botswana): https://gov.bw/sites/default/files/2020-03/Government%20Junior%20Secondary%20Schools.pdf
 * (Same listing as often mirrored on Scribd.)
 *
 * From backend/:
 *   npx ts-node-dev --transpile-only --exit-child scripts/parseBotswanaGovJssPdf.ts
 *   npx ts-node-dev --transpile-only --exit-child scripts/parseBotswanaGovJssPdf.ts --pdf=exports/MyCopy.pdf
 *
 * Writes: ../src/data/botswanaGovJssSchoolNames.json
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import pdf from "pdf-parse";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
function argValue(prefix: string): string | undefined {
  const hit = args.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  const rest = hit.slice(prefix.length).trim();
  if (rest) return rest;
  const i = args.indexOf(hit);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const PDF_PATH = path.resolve(
  __dirname,
  "..",
  argValue("--pdf=") || "exports/Gov-JSS-Botswana.pdf"
);
const OUT_JSON = path.resolve(__dirname, "../src/data/botswanaGovJssSchoolNames.json");

export function parseCjssNamesFromGovPdfText(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*\d+\.\s+(.+?)\s+CJSS\b(?:\s|$)/i);
    if (!m) continue;
    const core = m[1].replace(/\s+/g, " ").trim();
    if (core.length < 2) continue;
    names.push(/\bcjss\b/i.test(core) ? core : `${core} CJSS`);
  }
  return names;
}

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`PDF not found: ${PDF_PATH}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(PDF_PATH);
  const data = await pdf(buf);
  const names = parseCjssNamesFromGovPdfText(data.text);
  const unique = [...new Set(names.map((n) => n.toLowerCase()))].map((low) => names.find((n) => n.toLowerCase() === low)!);

  const payload = {
    sourceUrl: "https://gov.bw/sites/default/files/2020-03/Government%20Junior%20Secondary%20Schools.pdf",
    extractedAt: new Date().toISOString(),
    count: unique.length,
    names: unique,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${unique.length} names → ${OUT_JSON}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
