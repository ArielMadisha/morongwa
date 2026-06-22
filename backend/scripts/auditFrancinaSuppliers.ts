import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDB } from "../src/data/db";
import User from "../src/data/models/User";
import Store from "../src/data/models/Store";
import Supplier from "../src/data/models/Supplier";
import Product from "../src/data/models/Product";

async function main() {
  await connectDB();
  const user = await User.findOne({ username: /^francinahmadisha$/i }).lean();
  if (!user) {
    console.log("User not found");
    process.exit(1);
  }
  console.log("User:", user._id, user.name, user.username, user.canOwnMultipleStores);

  const stores = await Store.find({ userId: user._id }).lean();
  console.log("\nStores:");
  for (const s of stores) {
    const sup = s.supplierId ? await Supplier.findById(s.supplierId).lean() : null;
    const n = s.supplierId ? await Product.countDocuments({ supplierId: s.supplierId }) : 0;
    console.log({
      id: s._id,
      name: s.name,
      type: s.type,
      country: s.country,
      countryCode: s.countryCode,
      supplierId: s.supplierId,
      supplierName: sup?.storeName,
      supplierLinkedStore: sup?.linkedStoreId,
      products: n,
    });
  }

  const suppliers = await Supplier.find({ userId: user._id }).lean();
  console.log("\nSupplier profiles:");
  for (const sup of suppliers) {
    const n = await Product.countDocuments({ supplierId: sup._id });
    console.log({
      id: sup._id,
      storeName: sup.storeName,
      status: sup.status,
      linkedStoreId: sup.linkedStoreId,
      products: n,
    });
  }

  const approved = await Supplier.find({ userId: user._id, status: "approved" }).lean();
  console.log("\nApproved count:", approved.length);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
