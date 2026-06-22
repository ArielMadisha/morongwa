/** Unset discountPrice where it was saved as 0 (shows as free on storefront). */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import Product from "../src/data/models/Product";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  const res = await Product.updateMany({ discountPrice: 0 }, { $unset: { discountPrice: "" } });
  console.log(`Unset discountPrice=0 on ${res.modifiedCount} product(s)`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
