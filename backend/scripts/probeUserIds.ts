import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import User from "../src/data/models/User";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGO_URI!);
  for (const id of ["69d4c476574fc61dbbeee3a0", "69d4bd1642ec816dcc09e708", "69cd1cc2703cf9d7f5bbb47d"]) {
    const u = await User.findById(id).select("username name").lean();
    console.log(id, u);
  }
  await mongoose.disconnect();
}
main();
