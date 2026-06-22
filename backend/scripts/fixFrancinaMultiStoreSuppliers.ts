/**
 * @francinahmadisha: Cheap Cheap Store (ZA) + The P100 Store (BW) as separate supplier profiles.
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDB } from "../src/data/db";
import User from "../src/data/models/User";
import Store from "../src/data/models/Store";
import Supplier from "../src/data/models/Supplier";
import Product from "../src/data/models/Product";
import { linkSupplierStore } from "../src/utils/ensureSupplierForStore";
import { ensureSupplierIndexes } from "../src/utils/ensureSupplierIndexes";
import { resolveStoreCountry } from "../src/config/storeCountries";

async function main() {
  await connectDB();
  await ensureSupplierIndexes();

  const user = await User.findOne({ username: /^francinahmadisha$/i });
  if (!user) {
    console.error("User francinahmadisha not found");
    process.exit(1);
  }
  await User.updateOne({ _id: user._id }, { $set: { canOwnMultipleStores: true } });

  const cheapStore = await Store.findOne({
    userId: user._id,
    $or: [{ name: /cheap fashion/i }, { name: /cheap cheap/i }],
    type: "supplier",
  });
  const p100Store = await Store.findOne({ userId: user._id, name: /p100/i, type: "supplier" });
  const mahalaStore = await Store.findOne({ userId: user._id, name: /mahala/i, type: "supplier" });

  if (cheapStore) {
    cheapStore.name = "Cheap Cheap Store";
    const za = resolveStoreCountry("ZA");
    if (za) {
      cheapStore.country = za.country;
      cheapStore.countryCode = za.countryCode;
    }
    await cheapStore.save();
    const { supplier } = await linkSupplierStore(cheapStore);
    supplier.storeName = "Cheap Cheap Store";
    await supplier.save();
    const n = await Product.countDocuments({ supplierId: supplier._id });
    console.log(`Cheap Cheap Store: supplier ${supplier._id}, products=${n}`);
  }

  if (p100Store) {
    const bw = resolveStoreCountry("BW");
    if (bw) {
      p100Store.country = bw.country;
      p100Store.countryCode = bw.countryCode;
    }
    await p100Store.save();
    const { supplier } = await linkSupplierStore(p100Store);
    const n = await Product.countDocuments({ supplierId: supplier._id });
    console.log(`The P100 Store: supplier ${supplier._id}, products=${n}`);
  }

  if (mahalaStore) {
    const za = resolveStoreCountry("ZA");
    if (za && !mahalaStore.countryCode) {
      mahalaStore.country = za.country;
      mahalaStore.countryCode = za.countryCode;
      await mahalaStore.save();
    }
    const { supplier } = await linkSupplierStore(mahalaStore);
    console.log(`Mahala Fashion: supplier ${supplier._id} (separate profile)`);
  }

  const profiles = await Supplier.find({ userId: user._id, status: "approved" }).lean();
  console.log("\nApproved supplier profiles:");
  for (const p of profiles) {
    const n = await Product.countDocuments({ supplierId: p._id });
    console.log(`  ${p.storeName} (${p._id}) products=${n}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
