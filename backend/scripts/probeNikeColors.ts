import dotenv from "dotenv";
dotenv.config();
import { detectColorsFromImages } from "../src/services/productColorDetection";

const images = [
  "/uploads/1781873600334-267240311-WhatsApp_Image_2026-06-18_at_10.40.14.jpeg",
  "/uploads/1781873600335-848567733-WhatsApp_Image_2026-06-18_at_10.40.13.jpeg",
  "/uploads/1781873600426-760603353-WhatsApp_Image_2026-06-18_at_10.40.12.jpeg",
  "/uploads/1781873601515-19489780-WhatsApp_Image_2026-06-18_at_10.40.11.jpeg",
];

async function main() {
  for (let i = 0; i < images.length; i++) {
    const one = await detectColorsFromImages([images[i]]);
    console.log(`image ${i}:`, one.map((c) => c.name).join(", ") || "(none)");
  }
  const all = await detectColorsFromImages(images);
  console.log("\nall:", all.map((c) => `${c.name}@${c.imageIndex}`).join(", "));
}

main();
