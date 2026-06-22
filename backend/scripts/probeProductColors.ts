/**
 * Debug garment color detection for one product.
 * Usage: npx tsx scripts/probeProductColors.ts --id=6a36180619dc8ed2cf45ccb5
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import { detectColorsFromImages, buildProductColorOptions } from "../src/services/productColorDetection";

async function main() {
  const id = process.argv.find((a) => a.startsWith("--id="))?.split("=")[1]?.trim();
  if (!id) throw new Error("Pass --id=<productId>");

  await mongoose.connect(process.env.MONGO_URI!);
  const p = await Product.findById(id).select("images externalData colors title").lean();
  if (!p) throw new Error("Product not found");

  const images = (p as any).images as string[];
  console.log("title:", (p as any).title);
  console.log("stored:", (p as any).colors?.map((c: any) => c.name).join(", "));

  const perImage: unknown[] = [];
  for (let i = 0; i < images.length; i++) {
    const one = await detectColorsFromImages([images[i]]);
    perImage.push({ index: i, colors: one.map((c) => c.name) });
  }
  console.log("\nPer-image:", JSON.stringify(perImage, null, 2));

  const all = await detectColorsFromImages(images);
  console.log("\nCombined:", all.map((c) => c.name).join(", "));

  const built = await buildProductColorOptions({
    images,
    externalData: (p as any).externalData,
  });
  console.log("Built:", built.map((c) => c.name).join(", "));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
