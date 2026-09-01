#!/usr/bin/env node
/** Fix Bunnie Bakers area/address for WA store list: Name - Area - Address */
import "dotenv/config";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const stores = mongoose.connection.db.collection("stores");
  const store = await stores.findOne({ name: /bunnie bakers/i });
  if (!store) {
    console.error("Bunnie Bakers store not found");
    process.exit(1);
  }
  const patch = {
    area: "Soshanguve",
    address: "26402 Tilo Street Extension 6",
    updatedAt: new Date(),
  };
  console.log(
    JSON.stringify(
      {
        dryRun: !APPLY,
        storeId: String(store._id),
        before: { area: store.area, address: store.address },
        after: patch,
        waLine: `1. Bunnie Bakers - ${patch.area} - ${patch.address}`,
      },
      null,
      2
    )
  );
  if (!APPLY) {
    console.log("Re-run with --apply");
    await mongoose.disconnect();
    return;
  }
  await stores.updateOne({ _id: store._id }, { $set: patch });
  console.log("Updated");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
