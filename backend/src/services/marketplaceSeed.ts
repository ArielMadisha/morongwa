import mongoose from "mongoose";
import User from "../data/models/User";
import Supplier from "../data/models/Supplier";
import Product from "../data/models/Product";
import { logger } from "./monitoring";

const SAMPLE_PRODUCTS = [
  { title: "Organic Honey 500g", slug: "organic-honey-500g", price: 89.99, category: "Food", tags: ["organic", "local"] },
  { title: "Handwoven Basket Large", slug: "handwoven-basket-large", price: 249, category: "Home", tags: ["craft", "local"] },
  { title: "Rooibos Tea Pack 20", slug: "rooibos-tea-pack-20", price: 65, category: "Food", tags: ["tea", "south-african"] },
  { title: "Wire Art Sculpture", slug: "wire-art-sculpture", price: 180, category: "Art", tags: ["craft", "decor"] },
  { title: "Beaded Necklace Set", slug: "beaded-necklace-set", price: 120, category: "Fashion", tags: ["handmade", "accessories"] },
  { title: "Biltong 200g", slug: "biltong-200g", price: 95, category: "Food", tags: ["snacks", "local"] },
  { title: "Recycled Paper Notebook", slug: "recycled-paper-notebook", price: 45, category: "Stationery", tags: ["eco", "gifts"] },
  { title: "Test Product A", slug: "test-product-a", price: 29.99, category: "Test", tags: ["test"] },
  { title: "Test Product B", slug: "test-product-b", price: 49.99, category: "Test", tags: ["test"] },
  { title: "Test Product C", slug: "test-product-c", price: 79.99, category: "Test", tags: ["test"] },
  { title: "Test Product D", slug: "test-product-d", price: 119.99, category: "Test", tags: ["test"] },
  { title: "Test Product E", slug: "test-product-e", price: 199.99, category: "Test", tags: ["test"] },
];

export async function ensureDefaultProducts(): Promise<void> {
  const count = await Product.countDocuments();
  if (count > 0) {
    return;
  }

  let supplier = await Supplier.findOne({ status: "approved" }).lean();
  if (!supplier) {
    const adminUser = await User.findOne({ role: "admin" }).select("_id").lean();
    if (!adminUser) {
      logger.warn("No admin user found; skipping marketplace product seed.");
      return;
    }
    await Supplier.create({
      userId: adminUser._id,
      status: "approved",
      type: "company",
      storeName: "Morongwa Demo Store",
      contactEmail: "demo@morongwa.com",
      contactPhone: "+27000000000",
      verificationFeeWaived: true,
    });
    supplier = await Supplier.findOne({ status: "approved" }).lean();
    if (!supplier) return;
    logger.info("Created demo supplier for marketplace seed.");
  }

  const supplierId = supplier._id as mongoose.Types.ObjectId;
  for (const p of SAMPLE_PRODUCTS) {
    const existing = await Product.findOne({ slug: p.slug });
    if (!existing) {
      await Product.create({
        supplierId,
        title: p.title,
        slug: p.slug,
        description: `${p.title} – available on Morongwa Marketplace.`,
        images: [],
        price: p.price,
        currency: "ZAR",
        stock: 50,
        allowResell: true,
        commissionPct: 5,
        categories: [p.category],
        tags: p.tags,
        ratingAvg: 4.5,
        ratingCount: 0,
        active: true,
      });
      logger.info(`Seeded product: ${p.slug}`);
    }
  }
}
