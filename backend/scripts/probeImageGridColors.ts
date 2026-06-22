/**
 * Deep debug: per-grid-cell RGB + named color for one image.
 * Usage: npx tsx scripts/probeImageGridColors.ts --url=/uploads/...
 */
import dotenv from "dotenv";
dotenv.config();
import sharp from "sharp";
import fs from "fs";
import { resolveLocalUploadFilePath, encodeUploadsPublicPath } from "../src/utils/uploadFilePath";

async function loadBuf(path: string): Promise<Buffer | null> {
  const local = resolveLocalUploadFilePath(path);
  if (local) {
    try {
      return fs.readFileSync(local);
    } catch {
      /* remote */
    }
  }
  const origin = "https://www.qwertymates.com";
  const url = `${origin}${encodeUploadsPublicPath(path)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const path =
    process.argv.find((a) => a.startsWith("--url="))?.split("=")[1]?.trim() ||
    "/uploads/1781929821345-135327112-WhatsApp_Image_2026-06-19_at_17.40.49.jpeg";

  const mod = await import("../src/services/productColorDetection");
  const buf = await loadBuf(path);
  if (!buf) throw new Error("load failed");

  const meta = await sharp(buf).metadata();
  const width = meta.width || 800;
  const height = meta.height || 800;
  console.log("size", width, height);

  const grid = 4;
  const grid3x2 = { cols: 3, rows: 2 };
  const layouts = [
    { name: "4x4", cols: grid, rows: grid },
    { name: "3x2", cols: grid3x2.cols, rows: grid3x2.rows },
  ];

  for (const layout of layouts) {
    console.log(`\n=== ${layout.name} ===`);
    for (let gy = 0; gy < layout.rows; gy++) {
      for (let gx = 0; gx < layout.cols; gx++) {
        const cellW = Math.floor(width / layout.cols);
        const cellH = Math.floor(height / layout.rows);
        const insetX = Math.floor(cellW * 0.18);
        const insetY = Math.floor(cellH * 0.15);
        const left = gx * cellW + insetX;
        const top = gy * cellH + insetY;
        const cropW = Math.floor(cellW * 0.64);
        const cropH = Math.floor(cellH * 0.7);

        const { data, info } = await sharp(buf)
          .removeAlpha()
          .extract({ left, top, width: cropW, height: cropH })
          .resize(32, 32, { fit: "fill" })
          .raw()
          .toBuffer({ resolveWithObject: true });

        const buckets = new Map<string, { r: number; g: number; b: number; w: number }>();
        for (let i = 0; i < data.length; i += info.channels) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const key = `${Math.round(r / 24) * 24},${Math.round(g / 24) * 24},${Math.round(b / 24) * 24}`;
          const prev = buckets.get(key);
          if (prev) {
            prev.r = (prev.r + r) / 2;
            prev.g = (prev.g + g) / 2;
            prev.b = (prev.b + b) / 2;
            prev.w++;
          } else buckets.set(key, { r, g, b, w: 1 });
        }
        const top3 = [...buckets.values()].sort((a, b) => b.w - a.w).slice(0, 2);
        console.log(
          `cell[${gx},${gy}]`,
          top3.map((t) => `rgb(${Math.round(t.r)},${Math.round(t.g)},${Math.round(t.b)}) w=${t.w}`).join(" | ")
        );
      }
    }
  }
}

main().catch(console.error);
