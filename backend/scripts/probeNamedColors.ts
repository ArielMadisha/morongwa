import { nearestNamedColor, detectColorsFromImages } from "../src/services/productColorDetection";

async function main() {
  const samples: Array<[number, number, number]> = [
    [65, 64, 17],
    [70, 71, 27],
    [89, 86, 28],
    [3, 19, 85],
    [97, 17, 20],
    [221, 143, 67],
  ];
  for (const [r, g, b] of samples) {
    console.log(`rgb(${r},${g},${b}) -> ${nearestNamedColor(r, g, b).name}`);
  }
  console.log("\nfull detect:", (await detectColorsFromImages([
    "/uploads/1781929821345-135327112-WhatsApp_Image_2026-06-19_at_17.40.49.jpeg",
  ])).map((c) => c.name).join(", "));
}

main();
