/**
 * One-off / refresh: read Botswana PUBLIC PRIMARY SCHOOLS.pdf and write
 * frontend/lib/bwPrimarySchoolPhones.json (local digits only, no +267).
 *
 * Usage (PowerShell):
 *   node scripts/extractBwPrimarySchoolPhones.mjs "C:\path\PUBLIC PRIMARY SCHOOLS.pdf"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoFrontend = path.join(__dirname, '..');
const outJson = path.join(repoFrontend, 'lib', 'bwPrimarySchoolPhones.json');

const defaultPdf =
  process.env.BW_PRIMARY_SCHOOLS_PDF ||
  'C:/Users/Dell/AppData/Roaming/Cursor/User/workspaceStorage/8cbbb33495ce43c096bb0498540fe740/pdfs/248b4689-5387-450f-be31-6fa0c923c4d9/PUBLIC PRIMARY SCHOOLS.pdf';

const pdfPath = path.resolve(process.argv[2] || defaultPdf);

function normalizeKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[’']/g, "'")
    .replace(/\s*-\s*/g, '-')
    .replace(/[^a-z0-9\s'-]/g, '')
    .trim();
}

function schoolFromBefore(before) {
  const b = before.trim();
  if (!b) return '';
  const m = b.match(/^(.*?)\s+(Box|Bag|Via|B\d+)\b/i);
  if (m) return m[1].trim();
  const tokens = b.split(/\s+/);
  if (tokens.length <= 4) return b;
  return tokens.slice(0, 4).join(' ');
}

function parseRows(text) {
  /** @type {Map<string, string>} */
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('--')) continue;
    if (/^NO\s+SCHOOL/i.test(line)) continue;
    if (/^PRIMARY\s+SCHOOLS/i.test(line)) continue;
    const m = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!m) continue;
    const rowBody = m[2].trim();
    const mr = rowBody.match(/(\d{6,9})\s+([A-Za-z][A-Za-z\s-]+)\s*$/);
    if (!mr) continue;
    const phone = mr[1];
    const before = rowBody.slice(0, mr.index).trim();
    if (!before) continue;
    const schoolRaw = schoolFromBefore(before);
    if (!schoolRaw) continue;

    const key = normalizeKey(schoolRaw);
    if (!key) continue;
    if (!map.has(key)) map.set(key, phone);
  }
  return map;
}

async function main() {
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF not found:', pdfPath);
    process.exit(1);
  }
  const buf = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buf });
  const { text } = await parser.getText();
  const map = parseRows(text);
  const obj = Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(obj, null, 0) + '\n', 'utf8');
  console.log('Wrote', outJson, 'entries:', Object.keys(obj).length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
