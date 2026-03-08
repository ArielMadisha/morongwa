import Advert from "../data/models/Advert";
import Product from "../data/models/Product";
import { logger } from "./monitoring";

export async function ensureSampleAdvert(): Promise<void> {
  const count = await Advert.countDocuments();
  if (count > 0) return;

  // Placeholder image - can be replaced with real assets
  const placeholderImage = "https://placehold.co/400x400/0ea5e9/white?text=New+Product";

  // Sample promo advert (bottom slot - e.g. new product)
  const product = await Product.findOne({ active: true }).select("_id slug").lean();
  const productSlug = product ? (product as any).slug : null;
  const linkUrl = productSlug
    ? `/marketplace/product/${(product as any)._id}`
    : "/marketplace";

  await Advert.create({
    title: "New Arrival: Handwoven Baskets",
    imageUrl: placeholderImage,
    linkUrl,
    slot: "promo",
    productId: product?._id,
    active: true,
    order: 0,
  });

  // Sample random advert (top square - rotates with others)
  await Advert.create({
    title: "Shop Local on QwertyHub",
    imageUrl: "https://placehold.co/280x280/0ea5e9/white?text=QwertyHub",
    linkUrl: "/marketplace",
    slot: "random",
    active: true,
    order: 0,
  });

  logger.info("Created sample adverts (random + promo slots).");
}
