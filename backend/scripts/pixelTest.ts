import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Product from "../src/data/models/Product";
import { buildProductColorOptions, detectColorsFromImages } from "../src/services/productColorDetection";
const images = [
  "/uploads/1781929988190-307933470-WhatsApp_Image_2026-06-19_at_17.37.47.jpeg",
  "/uploads/1781929988375-883391758-WhatsApp_Image_2026-06-19_at_17.37.48.jpeg",
  "/uploads/1781929988574-150350039-WhatsApp_Image_2026-06-19_at_17.37.49_(1).jpeg",
  "/uploads/1781929988764-49066041-WhatsApp_Image_2026-06-19_at_17.37.49.jpeg",
  "/uploads/1781929988934-646282263-WhatsApp_Image_2026-06-19_at_17.37.50.jpeg",
];

async function main() {
  const hardcoded = await detectColorsFromImages(images);
  console.log("hardcoded", hardcoded);

  await mongoose.connect(process.env.MONGO_URI!);
  const p = await Product.findById("6a36180619dc8ed2cf45ccb5").lean();
  const dbImages = (p as any).images as string[];
  console.log("same?", JSON.stringify(dbImages) === JSON.stringify(images));
  const detected = await detectColorsFromImages(dbImages);
  console.log("detected", detected);
  const built = await buildProductColorOptions({ images: dbImages, externalData: (p as any).externalData });
  console.log("built", built);
  await mongoose.disconnect();
}

main().catch(console.error);
