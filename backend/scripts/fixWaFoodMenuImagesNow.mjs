/**
 * Fix WhatsApp food menu images:
 * 1) Upload flat JPEG assets (same pattern as marketplace product photos)
 * 2) Point food product.images at those JPEGs in Mongo
 * 3) Hotfix waFlow.ts + rebuild API
 * 4) Live Twilio media probe + poll status
 *
 * From backend/: node scripts/fixWaFoodMenuImagesNow.mjs
 * Optional: --phone=2781... --skip-twilio
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import twilio from "twilio";
import { mergeDeployConfig, sshConnect, execSsh } from "./lib/deploySsh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
const repoRoot = path.join(backendRoot, "..");

const args = new Set(process.argv.slice(2));
const phoneArg = [...args].find((a) => a.startsWith("--phone="));
const testPhoneDigits = String(
  phoneArg ? phoneArg.split("=")[1] : process.env.WA_FOOD_TEST_PHONE || "27815826899"
).replace(/\D/g, "");
const skipTwilio = args.has("--skip-twilio");

const IMAGE_MAP = [
  {
    local: "wa-food-calibas-1.jpg",
    remoteName: "wa-food-calibas-1.jpg",
    legacyPaths: ["/uploads/food/calibas-kota-1.png", "/uploads/food/calibas-kota-1.jpg"],
  },
  {
    local: "wa-food-calibas-2.jpg",
    remoteName: "wa-food-calibas-2.jpg",
    legacyPaths: ["/uploads/food/calibas-kota-2.png", "/uploads/food/calibas-kota-2.jpg"],
  },
  {
    local: "wa-food-calibas-3.jpg",
    remoteName: "wa-food-calibas-3.jpg",
    legacyPaths: ["/uploads/food/calibas-kota-3.png", "/uploads/food/calibas-kota-3.jpg"],
  },
  {
    local: "wa-food-calibas-4.jpg",
    remoteName: "wa-food-calibas-4.jpg",
    legacyPaths: ["/uploads/food/calibas-kota-4.png", "/uploads/food/calibas-kota-4.jpg"],
  },
  {
    local: "wa-food-mmoja-lerato.jpg",
    remoteName: "wa-food-mmoja-lerato.jpg",
    legacyPaths: ["/uploads/food/mmoja-lerato-kota.png", "/uploads/food/mmoja-lerato-kota.jpg"],
  },
];

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (e) => (e ? reject(e) : resolve()));
    });
  });
}

function resolveRemoteBackendRoot(cfg) {
  const explicit = (cfg.MORONGWA_BACKEND_HOST_PATH || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  return "/home/zweppe/morongwa-live/backend";
}

async function updateMongoImages() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI missing in backend/.env");
  await mongoose.connect(uri);
  const col = mongoose.connection.collection("products");
  const updates = [];
  for (const row of IMAGE_MAP) {
    const newPath = `/uploads/${row.remoteName}`;
    for (const legacy of row.legacyPaths) {
      const r = await col.updateMany(
        { images: legacy },
        { $set: { "images.$[img]": newPath } },
        { arrayFilters: [{ img: legacy }] }
      );
      if (r.modifiedCount) updates.push({ legacy, newPath, modified: r.modifiedCount });
      for (const abs of [`https://www.qwertymates.com${legacy}`, `https://api.qwertymates.com${legacy}`]) {
        const r2 = await col.updateMany(
          { images: abs },
          { $set: { "images.$[img]": newPath } },
          { arrayFilters: [{ img: abs }] }
        );
        if (r2.modifiedCount) updates.push({ legacy: abs, newPath, modified: r2.modifiedCount });
      }
    }
  }
  const foodFix = await col.updateMany(
    {
      active: true,
      images: { $elemMatch: { $regex: "/uploads/food/.*\\.(png|jpg)$", $options: "i" } },
    },
    [
      {
        $set: {
          images: {
            $map: {
              input: "$images",
              as: "img",
              in: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $regexMatch: { input: "$$img", regex: "calibas-kota-1\\.(png|jpg)$", options: "i" },
                      },
                      then: "/uploads/wa-food-calibas-1.jpg",
                    },
                    {
                      case: {
                        $regexMatch: { input: "$$img", regex: "calibas-kota-2\\.(png|jpg)$", options: "i" },
                      },
                      then: "/uploads/wa-food-calibas-2.jpg",
                    },
                    {
                      case: {
                        $regexMatch: { input: "$$img", regex: "calibas-kota-3\\.(png|jpg)$", options: "i" },
                      },
                      then: "/uploads/wa-food-calibas-3.jpg",
                    },
                    {
                      case: {
                        $regexMatch: { input: "$$img", regex: "calibas-kota-4\\.(png|jpg)$", options: "i" },
                      },
                      then: "/uploads/wa-food-calibas-4.jpg",
                    },
                    {
                      case: {
                        $regexMatch: {
                          input: "$$img",
                          regex: "mmoja-lerato-kota\\.(png|jpg)$",
                          options: "i",
                        },
                      },
                      then: "/uploads/wa-food-mmoja-lerato.jpg",
                    },
                  ],
                  default: "$$img",
                },
              },
            },
          },
        },
      },
    ]
  );
  const sample = await col
    .find({ supplierId: new mongoose.Types.ObjectId("6a6264d138377d1da374bcac") })
    .project({ title: 1, images: 1 })
    .limit(8)
    .toArray();
  await mongoose.disconnect();
  return { updates, foodFixModified: foodFix.modifiedCount, sample };
}

async function twilioProbe(mediaUrl, caption) {
  const sid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_WA_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_WA_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_WA_FROM || "";
  if (!sid || !token || !from) return { skipped: true, reason: "missing Twilio env" };
  const client = twilio(sid, token);
  const fromWa = from.startsWith("whatsapp:") ? from : `whatsapp:${from.replace(/^\+?/, "+")}`;
  const to = `whatsapp:+${testPhoneDigits}`;
  const msg = await client.messages.create({
    from: fromWa,
    to,
    mediaUrl: [mediaUrl],
    body: caption,
  });
  await new Promise((r) => setTimeout(r, 10000));
  const status = await client.messages(msg.sid).fetch();
  return {
    sid: msg.sid,
    mediaUrl,
    status: status.status,
    errorCode: status.errorCode,
    errorMessage: status.errorMessage,
  };
}

async function main() {
  const cfg = mergeDeployConfig(repoRoot);
  const remoteBackendRoot = resolveRemoteBackendRoot(cfg);
  const conn = await sshConnect(cfg, repoRoot);

  console.log("==> Upload flat food JPEGs to remote uploads/");
  await execSsh(conn, `mkdir -p "${remoteBackendRoot}/uploads/food"`);
  for (const row of IMAGE_MAP) {
    const local = path.join(backendRoot, "uploads", row.local);
    if (!fs.existsSync(local)) throw new Error(`Missing ${local}`);
    await sftpPut(conn, local, `${remoteBackendRoot}/uploads/${row.remoteName}`);
    console.log("uploaded", row.remoteName);
  }
  for (const name of [
    "calibas-kota-1.jpg",
    "calibas-kota-2.jpg",
    "calibas-kota-3.jpg",
    "calibas-kota-4.jpg",
    "mmoja-lerato-kota.jpg",
  ]) {
    const local = path.join(backendRoot, "uploads", "food", name);
    if (fs.existsSync(local)) {
      await sftpPut(conn, local, `${remoteBackendRoot}/uploads/food/${name}`);
      console.log("uploaded food/", name);
    }
  }

  console.log("==> Hotfix waFlow.ts + waFoodGroceryOrder.ts");
  await sftpPut(conn, path.join(backendRoot, "src", "routes", "waFlow.ts"), `${remoteBackendRoot}/src/routes/waFlow.ts`);
  await sftpPut(
    conn,
    path.join(backendRoot, "src", "services", "waFoodGroceryOrder.ts"),
    `${remoteBackendRoot}/src/services/waFoodGroceryOrder.ts`
  );
  await execSsh(
    conn,
    "docker exec morongwa-api-test bash -lc 'cd /app && npm run build' && docker restart morongwa-api-test"
  );
  conn.end();

  console.log("==> Update Mongo food product images → flat JPEG paths");
  const mongo = await updateMongoImages();
  console.log(JSON.stringify(mongo, null, 2));

  if (!skipTwilio) {
    console.log("==> Twilio media probe to", testPhoneDigits);
    const foodResult = await twilioProbe(
      "https://www.qwertymates.com/uploads/wa-food-calibas-1.jpg",
      "📦 Food JPEG probe (Test Shop style)\n💰 ZAR 24.00\n🏷️ code: testfood1\n\nBuy / Add to cart:\nhttps://wa.me/27815826899?text=CART%20ADD%20testfood1%201"
    );
    console.log("food probe:", JSON.stringify(foodResult, null, 2));
  }

  console.log("==> Done. On WhatsApp: 8 → 1 → 3. Expect photo cards, no Welcome bounce.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
