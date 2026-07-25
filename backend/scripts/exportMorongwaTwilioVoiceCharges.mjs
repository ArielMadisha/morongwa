/**
 * Build morongwa-twilio-voice-charges.json from latest auto-sync export.
 * Run: npm run voice:export-charges
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const latestPath = path.join(__dirname, "../exports/twilio-voice-pricing-latest.json");
const outPath = path.join(__dirname, "../exports/morongwa-twilio-voice-charges.json");

if (!fs.existsSync(latestPath)) {
  console.error("Missing", latestPath, "— run npm run voice:sync-pricing first");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(latestPath, "utf8"));
fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
console.log(`Copied latest sync → ${outPath} (${data.generatedAt})`);
