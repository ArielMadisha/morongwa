#!/usr/bin/env node
/**
 * Rebrand @rontest → Some Amazing Facts (@someamazingfacts), set avatar/password, first TV post.
 *
 *   node scripts/setupSomeAmazingFactsAccount.mjs --dry-run
 *   node scripts/setupSomeAmazingFactsAccount.mjs --apply
 *
 * Env: AVATAR_FILE, TV_FILE (basenames under uploads/profiles and uploads/tv)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");

const SOURCE_USERNAME = "rontest";
const NEW_NAME = "Some Amazing Facts";
const NEW_USERNAME = "someamazingfacts";
const NEW_PASSWORD = "11111111";

const POST_TEXT = `Voyager 1 was launched in 1977 with a simple mission — fly past Jupiter and Saturn, send back some photos, and that would be it.
Nobody told it to stop.
On November 18, 2026, this spacecraft will hit a milestone no human-made object has ever reached in the entire history of our species. It will be exactly one light-day from Earth — 16 billion miles away. So far that a radio signal, traveling at the speed of light, takes a full 24 hours just to reach it. If NASA sends a "good morning" on Monday, Voyager won't hear it until Tuesday. And NASA won't get the reply until Wednesday.
Think about that. A two-day conversation. With a machine we built in the 1970s.
Here's what makes this even more remarkable. Voyager 1 is dying. NASA shut down one of its last remaining science instruments just this April — a sensor that had been running nonstop since the day it launched, nearly half a century ago. The spacecraft now runs on roughly the power of a dim light bulb. Engineers are attempting a last-resort fix they've nicknamed "the Big Bang" — a risky all-at-once overhaul — just to keep it alive long enough to see its 50th birthday in 2027.
And still it flies. At 38,000 miles per hour, deeper into interstellar space, with no destination and no plans to return.
Here is the number that should stop you cold. Voyager 1 has spent 49 years traveling one light-day. The nearest star to our Sun is 4.2 light-years away. That means after nearly five decades of non-stop travel, Voyager has covered just 0.0027% of the distance to our closest stellar neighbor.
Space is not big. Big is not even the right word.
Strapped to its side is a golden record — a disc containing music, greetings in 55 languages, and the sounds of Earth — placed there by Carl Sagan, just in case someone out there ever finds it, millions or billions of years from now.
The loneliest object humanity has ever created, carrying the best of what we are, sailing into a silence we will never hear the end of`;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply;

function argValue(prefix) {
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : "";
}

const avatarFile =
  argValue("--avatar=") ||
  process.env.AVATAR_FILE ||
  "someamazingfacts-avatar-1782162997149.png";
const tvFile =
  argValue("--tv=") || process.env.TV_FILE || "tv-someamazingfacts-voyager1-1782162997149.png";

const avatarPath = `/uploads/profiles/${avatarFile}`;
const tvMediaPath = `/uploads/tv/${tvFile}`;

async function main() {
  const mongo = process.env.MONGO_URI;
  if (!mongo) {
    console.error("MONGO_URI not set");
    process.exit(1);
  }

  const avatarLocal = path.join(backendRoot, "uploads/profiles", avatarFile);
  const tvLocal = path.join(backendRoot, "uploads/tv", tvFile);
  if (!fs.existsSync(avatarLocal) || !fs.existsSync(tvLocal)) {
    console.error("Missing local upload files:", { avatarLocal, tvLocal });
    process.exit(1);
  }

  await mongoose.connect(mongo);
  const users = mongoose.connection.db.collection("users");
  const tvposts = mongoose.connection.db.collection("tvposts");

  const source = await users.findOne({ username: SOURCE_USERNAME });
  if (!source) {
    console.error(`User @${SOURCE_USERNAME} not found`);
    process.exit(1);
  }

  const taken = await users.findOne({
    username: NEW_USERNAME,
    _id: { $ne: source._id },
  });
  if (taken) {
    console.error(`Username @${NEW_USERNAME} already taken by ${taken._id}`);
    process.exit(1);
  }

  const existingPost = await tvposts.findOne({
    creatorId: source._id,
    mediaUrls: tvMediaPath,
  });

  const plan = {
    userId: String(source._id),
    from: { name: source.name, username: source.username },
    to: {
      name: NEW_NAME,
      username: NEW_USERNAME,
      avatar: avatarPath,
      password: "(set to requested value)",
    },
    post: {
      type: "image",
      mediaUrls: [tvMediaPath],
      captionPreview: POST_TEXT.slice(0, 120) + "…",
      hashtags: ["Voyager1", "NASA", "Space", "SomeAmazingFacts"],
      genre: "history",
      skip: !!existingPost,
    },
    dryRun,
  };

  console.log(JSON.stringify(plan, null, 2));

  if (dryRun) {
    console.log("Re-run with --apply to execute.");
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
  await users.updateOne(
    { _id: source._id },
    {
      $set: {
        name: NEW_NAME,
        username: NEW_USERNAME,
        avatar: avatarPath,
        passwordHash,
        active: true,
        suspended: false,
        locked: false,
        isVerified: true,
        updatedAt: new Date(),
      },
    }
  );

  if (!existingPost) {
    await tvposts.insertOne({
      creatorId: source._id,
      type: "image",
      mediaUrls: [tvMediaPath],
      caption: POST_TEXT,
      hashtags: ["Voyager1", "NASA", "Space", "SomeAmazingFacts"],
      genre: "history",
      hasWatermark: true,
      status: "approved",
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  console.log(
    JSON.stringify({
      ok: true,
      profileUrl: `https://www.qwertymates.com/user/${source._id}`,
      username: NEW_USERNAME,
      postCreated: !existingPost,
    })
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("ERR", e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
