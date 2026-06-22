import { detectColorsFromImages } from "../src/services/productColorDetection";

const images = [
  "/uploads/1781929988190-307933470-WhatsApp_Image_2026-06-19_at_17.37.47.jpeg",
  "/uploads/1781929988375-883391758-WhatsApp_Image_2026-06-19_at_17.37.48.jpeg",
  "/uploads/1781929988574-150350039-WhatsApp_Image_2026-06-19_at_17.37.49_(1).jpeg",
  "/uploads/1781929988764-49066041-WhatsApp_Image_2026-06-19_at_17.37.49.jpeg",
  "/uploads/1781929988934-646282263-WhatsApp_Image_2026-06-19_at_17.37.50.jpeg",
];

async function main() {
  for (const img of images) {
    const c = await detectColorsFromImages([img]);
    console.log(img.slice(-40), "->", c.map((x) => x.name).join(", ") || "NONE");
  }
  console.log("all", await detectColorsFromImages(images));
}

main().catch(console.error);
