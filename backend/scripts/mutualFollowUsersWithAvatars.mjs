/**
 * ONE-SHOT data exercise (not wired to cron/deploy/registration).
 *
 * Make all users who currently have a non-empty profile avatar mutually follow
 * each other (A→B and B→A). Idempotent via unique (followerId, followingId).
 *
 * Usage (from backend/):
 *   node scripts/mutualFollowUsersWithAvatars.mjs --dry-run
 *   node scripts/mutualFollowUsersWithAvatars.mjs
 *
 * Env: MONGO_URI from backend/.env
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DRY = process.argv.includes("--dry-run");
const INSERT_BATCH = Math.max(
  100,
  parseInt(
    (process.argv.find((a) => a.startsWith("--batch=")) || "--batch=2500").slice("--batch=".length),
    10
  ) || 2500
);

/** Non-empty avatar string (real photo or stock). */
const AVATAR_FILTER = {
  avatar: { $exists: true, $type: "string", $regex: /\S/ },
};

function maskUri(uri) {
  try {
    const u = new URL(uri);
    if (u.password) u.password = "***";
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "(unparseable MONGO_URI)";
  }
}

async function insertBatch(followsCol, docs) {
  if (!docs.length) return { inserted: 0, duplicated: 0, errors: 0 };
  try {
    const result = await followsCol.insertMany(docs, { ordered: false });
    return { inserted: result.insertedCount ?? docs.length, duplicated: 0, errors: 0 };
  } catch (err) {
    // ordered:false throws on any write error; dig into writeErrors / result
    const writeErrors = Array.isArray(err?.writeErrors) ? err.writeErrors : [];
    const inserted =
      typeof err?.result?.nInserted === "number"
        ? err.result.nInserted
        : typeof err?.insertedCount === "number"
          ? err.insertedCount
          : Math.max(0, docs.length - writeErrors.length);
    let duplicated = 0;
    let errors = 0;
    for (const we of writeErrors) {
      if (we.code === 11000) duplicated += 1;
      else {
        errors += 1;
        if (errors <= 5) {
          console.error(`  write error code=${we.code}: ${we.errmsg || we.message}`);
        }
      }
    }
    // Some drivers put duplicate info only on err.code when single failure
    if (!writeErrors.length && err?.code === 11000) {
      duplicated = docs.length;
      return { inserted: 0, duplicated, errors: 0 };
    }
    return { inserted, duplicated, errors };
  }
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error("MONGO_URI not set in backend/.env");

  console.log(`Mode: ${DRY ? "DRY-RUN" : "LIVE"}`);
  console.log(`Mongo: ${maskUri(mongoUri)}`);
  console.log(`Insert batch size: ${INSERT_BATCH}`);

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  console.log(`Connected DB: ${db.databaseName}`);

  const usersCol = db.collection("users");
  const followsCol = db.collection("follows");

  const candidates = await usersCol
    .find(AVATAR_FILTER, { projection: { _id: 1, username: 1, avatar: 1, isSchoolAccount: 1 } })
    .toArray();

  // Defensive trim filter (regex already excludes pure whitespace)
  const ids = [];
  let stockish = 0;
  let schoolish = 0;
  for (const u of candidates) {
    const av = String(u.avatar || "").trim();
    if (!av) continue;
    ids.push(u._id);
    if (/\/uploads\/avatars\/stock\//i.test(av)) stockish += 1;
    if (u.isSchoolAccount) schoolish += 1;
  }

  const n = ids.length;
  const potentialEdges = n * Math.max(0, n - 1);
  console.log(`Candidates with non-empty avatar: ${n}`);
  console.log(`  of which stock-path avatars: ${stockish}`);
  console.log(`  of which isSchoolAccount: ${schoolish}`);
  console.log(`Potential directed edges (N*(N-1)): ${potentialEdges}`);

  if (n < 2) {
    console.log("Fewer than 2 candidates — nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // Existing follows among candidates only (both endpoints in set)
  console.log("Loading existing follows among candidates…");
  const existingCursor = followsCol.find(
    { followerId: { $in: ids }, followingId: { $in: ids } },
    { projection: { followerId: 1, followingId: 1 } }
  );
  const existingKeys = new Set();
  for await (const f of existingCursor) {
    existingKeys.add(`${String(f.followerId)}>${String(f.followingId)}`);
  }
  console.log(`Existing follow edges among candidates: ${existingKeys.size}`);

  let alreadyExisted = 0;
  let toCreate = 0;
  let created = 0;
  let duplicatedOnWrite = 0;
  let errors = 0;
  let batch = [];
  let pairsScanned = 0;
  const now = new Date();

  const flush = async () => {
    if (!batch.length) return;
    if (DRY) {
      toCreate += batch.length;
      batch = [];
      return;
    }
    const r = await insertBatch(followsCol, batch);
    created += r.inserted;
    duplicatedOnWrite += r.duplicated;
    errors += r.errors;
    toCreate += batch.length; // intended inserts in this flush
    batch = [];
  };

  console.log(DRY ? "Scanning pairs (dry-run)…" : "Creating missing follow edges…");
  for (let i = 0; i < n; i++) {
    const a = ids[i];
    const aStr = String(a);
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = ids[j];
      const key = `${aStr}>${String(b)}`;
      pairsScanned += 1;
      if (existingKeys.has(key)) {
        alreadyExisted += 1;
        continue;
      }
      batch.push({
        followerId: a,
        followingId: b,
        status: "accepted",
        createdAt: now,
        updatedAt: now,
      });
      // Avoid re-counting same key if we somehow revisit
      existingKeys.add(key);
      if (batch.length >= INSERT_BATCH) {
        await flush();
        if (!DRY && (created + duplicatedOnWrite) % (INSERT_BATCH * 4) < INSERT_BATCH) {
          console.log(
            `  progress: scanned=${pairsScanned}/${potentialEdges} created=${created} dup=${duplicatedOnWrite} err=${errors}`
          );
        }
      }
    }
    if (DRY && (i + 1) % 100 === 0) {
      console.log(`  dry progress: users ${i + 1}/${n}, wouldCreate≈${toCreate + batch.length}`);
    }
  }
  await flush();

  const summary = {
    mode: DRY ? "dry-run" : "live",
    db: db.databaseName,
    candidates: n,
    stockAvatars: stockish,
    schoolAccounts: schoolish,
    potentialEdges,
    alreadyExisted,
    wouldCreateOrCreated: DRY ? toCreate : created,
    created,
    duplicatedOnWrite,
    errors,
    note: "One-shot script only — not scheduled, not in deploy.",
  };

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  await mongoose.disconnect();
  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
