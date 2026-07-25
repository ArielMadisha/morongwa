/**
 * Deactivate broken/placeholder wall adverts so Hammanskraal warehouse carousel wins.
 * Usage: npx tsx scripts/deactivateBrokenWallAdverts.ts
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Advert from "../src/data/models/Advert";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);

  const broken = await Advert.updateMany(
    {
      active: true,
      $or: [
        { title: /^buy local$/i },
        { advertiserName: /^buy local$/i },
        { imageUrl: /placehold\.co/i },
        { imageUrl: /172\.236\.181\.129/ },
        { imageUrl: /^https?:\/\/[^/]+\/marketplace\/?$/i },
        { title: /Shop Local on QwertyHub/i },
        { title: /Handwoven Baskets/i },
      ],
    },
    { $set: { active: false } }
  );

  // Ensure Hammanskraal warehouse advert is active and ordered first
  const warehouse = await Advert.updateMany(
    {
      $or: [
        { title: /Hammanskraal warehouse/i },
        { advertiserName: /Hammanskraal warehouse/i },
      ],
    },
    { $set: { active: true, order: -10, slot: "random" } }
  );

  const remaining = await Advert.find({ active: true })
    .select("title advertiserName imageUrl order carouselCards")
    .lean();

  console.log(
    JSON.stringify(
      {
        deactivated: broken.modifiedCount,
        warehouseActivated: warehouse.modifiedCount,
        remainingActive: remaining.map((a) => ({
          id: String(a._id),
          title: a.title,
          advertiserName: a.advertiserName,
          order: a.order,
          cards: Array.isArray(a.carouselCards) ? a.carouselCards.length : 0,
          imageUrl: String(a.imageUrl || "").slice(0, 60),
        })),
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
