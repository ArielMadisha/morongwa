#!/usr/bin/env node
import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const USER_ID = "69cd1cb5703cf9d7f5bb6f41";

await mongoose.connect(process.env.MONGO_URI);
const u = await mongoose.connection.db.collection("users").findOne({
  _id: new mongoose.Types.ObjectId(USER_ID),
});
console.log({
  id: USER_ID,
  name: u?.name,
  username: u?.username,
  isSchool: u?.isSchoolAccount,
  galleryCount: (u?.profileGalleryUrls || []).length,
  gallery: (u?.profileGalleryUrls || []).slice(0, 12),
});

const localDir = path.join(ROOT, "uploads", "school-gallery", USER_ID);
console.log("localDir exists", fs.existsSync(localDir));
if (fs.existsSync(localDir)) {
  console.log(
    "local files",
    fs.readdirSync(localDir).slice(0, 20)
  );
}
await mongoose.disconnect();
