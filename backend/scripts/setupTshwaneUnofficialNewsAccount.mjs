#!/usr/bin/env node
/**
 * Rebrand @hddxboxfqqqsiuzmhbqtabpo → Tshwane Unofficial News (@tshwaneunofficialnews).
 *
 *   node scripts/setupTshwaneUnofficialNewsAccount.mjs --apply
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");

const SOURCE_USERNAME = "hddxboxfqqqsiuzmhbqtabpo";
const NEW_NAME = "Tshwane Unofficial News";
const NEW_USERNAME = "tshwaneunofficialnews";
const NEW_PASSWORD = "11111111";

const POST_TEXT = `To understand Soshangane, Mzilikazi, and Shaka, it helps to realize that they were all products of the same turbulent era: the rise and collapse of powerful Nguni states in southeastern Africa during the early 1800s. Although they eventually became rulers of separate kingdoms, their stories began in the same political world.
During the late 18th and early 19th century, the region between present day Kwazulu Natal and southern Mozambique was dominated by several competing chiefdoms. Among the most powerful was the Ndwandwe kingdom under Zwide kaLanga. At the same time the small Zulu chiefdoms was rising under Shaka kaSenzangakhona. Both Soshangane and Mzilikazi were originally connected to the Ndwandwe sphere, while Shaka emerged from the rival Zulu sphere.
Soshangane (1780 - 1858)
Born into the Nxumalo branch of the Ndwandwe people. He was one of Zwide's leading military commanders and helped build the Ndwandwe confederacy. When the Ndwandwe state collapsed, Soshangane did not submit to Shaka. Instead, led a large group northward through present day Eswatini and into Mozambique. There he conquered numerous local communities and established the Gaza kingdom, one of the most powerful states in southeastern Africa. At its height Gaza stretched from the Limpopo River towards the Zambezi River.
Shaka kaSenzangakhona (1787 - 1828)
Born the son of chief Senzangakhona and Nandi. As a young man he served under Mthethwa ruler Dingiswayo and developed his military skills there. After Dingiswayo was killed by Zwide's forces, Shaka inherited leadership of the Zulu and eventually united many neighboring chiefdoms into a powerful military kingdom. Shaka transformed warfare through tighter discipline, centralised military organisation and aggressive expansion. Between 1818 and 1820 he defeated the much larger Ndwandwe kingdom causing it's collapse and sending many of its generals and followers northward. That victory directly shaped the futures of both Soshangane and Mzilikazi.
Mzilikazi kaMashobane (1790 - 1868)
Born the son of Mashobane, chief of the Khumalo clan, a relatively small Nguni chiefdom. The Khumalo were not among the most powerful groups in the region. Unlike Soshangane, Mzilikazi initially became one of Shaka's most trusted commanders after the destruction of the Khumalo chiefdom. He learned Zulu military organisation directly under Shaka and rose rapidly in status. Eventually, relations broke down when Mzilikazi kept cattle captured during a raid instead of handing them over to Shaka. This escalated into a full blown rebellion. Shaka sent armies against him, but Mzilikazi escaped northward.
Mzilikazi's Great Trek became one of the most remarkable migrations in Southern African history. He moved from KZN into the highveld, across parts of present day Gauteng, North West, and Free State then into Zimbabwe. Along the way he built the Matabele kingdom and incorporating many different people into new nation. Eventually his capital was established near modern day Bulawayo, Zimbabwe.
These three men became founders of three most influential 19th century states
1. Zulu kingdom 
2. Gaza kingdom in Mozambique 
3. Matabele kingdom in Zimbabwe.
Ironically, although they became rulers of separate nations, app three emerged from the same network of Nguni chiefdoms. Their descendants today are found among the Zulu, Shangaan, Gaza-Nguni, and Ndebele people across South Africa, Mozambique, Zimbabwe, Zambia, Malawi, and Tanzania`;

const args = process.argv.slice(2);
const apply = args.includes("--apply");

function argValue(prefix) {
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : "";
}

const avatarFile = argValue("--avatar=") || process.env.AVATAR_FILE || "tun-avatar-1782164000000.png";
const tvFile = argValue("--tv=") || process.env.TV_FILE || "tv-tun-nguni-leaders-1782164000000.png";
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

  const taken = await users.findOne({ username: NEW_USERNAME, _id: { $ne: source._id } });
  if (taken) {
    console.error(`Username @${NEW_USERNAME} already taken`);
    process.exit(1);
  }

  const existingPost = await tvposts.findOne({ creatorId: source._id, mediaUrls: tvMediaPath });

  console.log(
    JSON.stringify(
      {
        userId: String(source._id),
        from: { name: source.name, username: source.username },
        to: { name: NEW_NAME, username: NEW_USERNAME, avatar: avatarPath },
        postMedia: tvMediaPath,
        dryRun: !apply,
      },
      null,
      2
    )
  );

  if (!apply) {
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
      hashtags: ["TshwaneUnofficialNews", "Shaka", "Mzilikazi", "Soshangane", "NguniHistory"],
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
