import { encodeUploadsPublicPath } from "../src/utils/uploadFilePath";

const url = "/uploads/1781929988190-307933470-WhatsApp_Image_2026-06-19_at_17.37.47.jpeg";

async function main() {
  const fetchUrl = "https://www.qwertymates.com" + encodeUploadsPublicPath(url);
  console.log("fetch", fetchUrl);
  const res = await fetch(fetchUrl);
  console.log("status", res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("buf", buf.length);

  const mod = await import("../src/services/productColorDetection");
  const { detectColorsFromImages } = mod;
  const colors = await detectColorsFromImages([url]);
  console.log("colors", colors);
}

main().catch(console.error);
