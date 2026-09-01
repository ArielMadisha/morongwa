/**
 * Prepare the App Store / Play Store review demo account so App Review never
 * lands on an empty wallet screen.
 *
 * Idempotent: tops the wallet up to a floor amount and leaves existing
 * transaction history untouched.
 *
 * Usage (from backend/):
 *   node scripts/prepareAppReviewDemoAccount.mjs [--username=testuseracme] [--floor=750] [--dry-run]
 */
import "dotenv/config";
import mongoose from "mongoose";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const DRY = args.includes("--dry-run");
const USERNAME = String(getArg("username", "testuseracme")).toLowerCase();
const FLOOR = Number(getArg("floor", "750"));

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI missing in backend/.env");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
const db = mongoose.connection.db;

const user = await db.collection("users").findOne({ username: USERNAME });
if (!user) {
  console.error(`No user with username=${USERNAME}`);
  await mongoose.disconnect();
  process.exit(2);
}

console.log(
  "USER",
  JSON.stringify({
    id: String(user._id),
    username: user.username,
    email: user.email,
    phone: user.phone,
    active: user.active,
    suspended: user.suspended,
    locked: user.locked,
    isVerified: user.isVerified,
    emailVerified: user.emailVerified
  })
);

const blockers = [];
if (user.active === false) blockers.push("active=false");
if (user.suspended) blockers.push("suspended=true");
if (user.locked) blockers.push("locked=true");
if (blockers.length) {
  console.log("BLOCKERS", blockers.join(", "));
  if (!DRY) {
    await db
      .collection("users")
      .updateOne(
        { _id: user._id },
        { $set: { active: true, suspended: false, locked: false, isVerified: true, updatedAt: new Date() } }
      );
    console.log("CLEARED account blockers");
  }
}

let wallet = await db.collection("wallets").findOne({ user: user._id });
if (!wallet) {
  console.log("No wallet document — creating");
  if (!DRY) {
    const now = new Date();
    const insert = await db
      .collection("wallets")
      .insertOne({ user: user._id, balance: 0, transactions: [], createdAt: now, updatedAt: now });
    wallet = await db.collection("wallets").findOne({ _id: insert.insertedId });
  }
}

const current = Number(wallet?.balance || 0);
console.log("WALLET balance before:", current, "transactions:", (wallet?.transactions || []).length);

if (current >= FLOOR) {
  console.log(`Balance already >= floor ${FLOOR}; nothing to do.`);
} else if (DRY) {
  console.log(`DRY RUN — would credit ${FLOOR - current} to reach ${FLOOR}`);
} else {
  const topUp = Number((FLOOR - current).toFixed(2));
  await db.collection("wallets").updateOne(
    { _id: wallet._id },
    {
      $set: { balance: FLOOR, updatedAt: new Date() },
      $push: {
        transactions: {
          _id: new mongoose.Types.ObjectId(),
          type: "credit",
          amount: topUp,
          reference: `APP-REVIEW-DEMO-TOPUP-${new Date().toISOString().slice(0, 10)}`,
          createdAt: new Date()
        }
      }
    }
  );
  console.log(`CREDITED ${topUp} → balance ${FLOOR}`);
}

const after = await db.collection("wallets").findOne({ user: user._id });
console.log(
  "WALLET after:",
  JSON.stringify({ balance: after?.balance, transactions: (after?.transactions || []).length })
);

await mongoose.disconnect();
