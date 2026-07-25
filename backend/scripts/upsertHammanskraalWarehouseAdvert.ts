/**
 * Upsert a wall-feed advert for Qwertymates Hammanskraal warehouse.
 * Builds Alibaba-style carouselCards from live warehouse products.
 *
 * Usage: npx tsx scripts/upsertHammanskraalWarehouseAdvert.ts
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Advert from "../src/data/models/Advert";
import Product from "../src/data/models/Product";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const TITLE_KEY = "Qwertymates - Hammanskraal warehouse";

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  const products = await Product.find({
    warehouseFreeLocalCity: /hammanskraal/i,
    active: { $ne: false },
    images: { $exists: true, $ne: [] },
  })
    .select("title images colors price discountPrice currency")
    .sort({ createdAt: -1 })
    .limit(24)
    .lean();

  const seenImages = new Set<string>();
  const carouselCards: Array<{
    imageUrl: string;
    title: string;
    description: string;
    linkUrl: string;
  }> = [];

  for (const p of products) {
    const images = (Array.isArray(p.images) ? p.images : [])
      .map((u: unknown) => String(u || "").trim())
      .filter(Boolean);
    if (!images.length) continue;
    const baseTitle = String(p.title || "Warehouse product").slice(0, 120);
    const colors = Array.isArray((p as { colors?: unknown }).colors)
      ? ((p as { colors: Array<{ name?: string; imageIndex?: number }> }).colors || [])
      : [];
    const push = (imageUrl: string, title: string) => {
      const key = imageUrl.toLowerCase();
      if (seenImages.has(key)) return;
      seenImages.add(key);
      carouselCards.push({
        imageUrl,
        title: title.slice(0, 120),
        description: "Free delivery in Hammanskraal",
        linkUrl: `/marketplace/product/${p._id}`,
      });
    };
    if (colors.length) {
      for (const c of colors) {
        const idx = Number.isFinite(Number(c?.imageIndex)) ? Math.max(0, Number(c.imageIndex)) : 0;
        const imageUrl = images[idx] || images[0];
        const colorName = String(c?.name || "").trim();
        push(imageUrl, colorName ? `${baseTitle} — ${colorName}` : baseTitle);
      }
    }
    for (const imageUrl of images) {
      push(imageUrl, baseTitle);
    }
    if (carouselCards.length >= 24) break;
  }

  if (!carouselCards.length) {
    throw new Error("No Hammanskraal warehouse products with images found");
  }

  const payload = {
    title: TITLE_KEY,
    imageUrl: carouselCards[0].imageUrl,
    linkUrl: "/marketplace?q=Hammanskraal",
    advertiserName: TITLE_KEY,
    advertiserAvatar: "/qwertymates-q-mark-official.png",
    caption:
      "Enjoy free delivery within Hammanskraal on eligible items. Fresh stock from our local warehouse.",
    description: "Free delivery in Hammanskraal",
    ctaLabel: "Shop now",
    slot: "random" as const,
    active: true,
    order: 0,
    carouselCards,
    videoUrl: "",
  };

  const existing = await Advert.findOne({
    $or: [{ title: TITLE_KEY }, { advertiserName: TITLE_KEY }],
  });

  if (existing) {
    await Advert.updateOne({ _id: existing._id }, { $set: payload });
    console.log(`Updated advert ${existing._id} with ${carouselCards.length} carousel cards`);
  } else {
    const created = await Advert.create(payload);
    console.log(`Created advert ${created._id} with ${carouselCards.length} carousel cards`);
  }

  const old = await Advert.updateMany(
    {
      title: /Handwoven Baskets/i,
      imageUrl: /placehold\.co/i,
      active: true,
    },
    { $set: { active: false } }
  );
  if (old.modifiedCount) {
    console.log(`Deactivated ${old.modifiedCount} placeholder Handwoven Baskets advert(s)`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
