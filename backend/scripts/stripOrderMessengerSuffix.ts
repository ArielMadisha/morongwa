import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import DirectMessage from "../src/data/models/DirectMessage";
import ProductEnquiryMessage from "../src/data/models/ProductEnquiryMessage";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SUFFIX = " Open Messages → Product enquiries for details.";

async function main() {
  const mongoUri = String(process.env.MONGO_URI || "").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing");
  await mongoose.connect(mongoUri);
  try {
    const dms = await DirectMessage.find({ content: /Product enquiries for details/i })
      .select("_id content")
      .lean();
    let direct = 0;
    for (const dm of dms) {
      const c = String((dm as { content?: string }).content || "");
      const next = c.split(SUFFIX).join("").replace(SUFFIX.trim(), "");
      if (next === c) continue;
      await DirectMessage.updateOne({ _id: dm._id }, { $set: { content: next } });
      direct += 1;
    }

    const ems = await ProductEnquiryMessage.find({ content: /Product enquiries for details/i })
      .select("_id content")
      .lean();
    let enquiry = 0;
    for (const em of ems) {
      const c = String((em as { content?: string }).content || "");
      const next = c.split(SUFFIX).join("");
      if (next === c) continue;
      await ProductEnquiryMessage.updateOne({ _id: em._id }, { $set: { content: next } });
      enquiry += 1;
    }

    console.log(`Updated direct messages: ${direct}, product enquiry messages: ${enquiry}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
