/**
 * Batch-import local school photo folders into profileGalleryUrls (+ avatar if missing).
 * Fuzzy name match, optional auto-create school users, all images per folder.
 *
 * From backend/:
 *   npm run import:school-galleries-batch -- --dry-run
 *   npm run import:school-galleries-batch
 *   npm run import:school-galleries-batch -- --root="D:\Schools" --country=ZA
 *   npm run import:school-galleries-batch -- --no-create-missing
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/data/models/User";
import { looksLikeSchoolInstitutionName } from "../src/utils/schoolProfileDetection";
import {
  folderAliasAccountKeys,
  isKnownSchoolAccountName,
  schoolAccountMatchKey,
} from "../src/utils/knownSchoolAliases";
import {
  cleanFolderLabel,
  matchKey,
  schoolDedupeKey,
  keysConflict,
  rankSchoolMatches,
  pickBestRankedMatch,
  isImportableSchoolFolder,
  normName,
} from "./lib/schoolNameMatching";
import { moderateMedia, moderationResultShouldRemove } from "../src/services/contentModeration";
import { mimeFromPath } from "../src/utils/uploadFilePath";
import { listSchoolGalleryImageFiles, listSchoolGallerySourceFolders, resolveSchoolGalleryFolderPath } from "./lib/schoolGalleryFiles";
import { publishSchoolGalleryFeedUpdates } from "../src/services/schoolGalleryFeed";
import { isUndeployedSchoolProfileAvatar, uploadPublicPathExists } from "../src/utils/schoolProfileMedia";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const APPEND = args.includes("--append");
const SET_AVATAR = !args.includes("--no-avatar");
const CREATE_MISSING = !args.includes("--no-create-missing");

function argValue(prefix: string): string | undefined {
  const bare = prefix.endsWith("=") ? prefix.slice(0, -1) : prefix;
  const hit = args.find((a) => a === bare || a.startsWith(prefix));
  if (!hit) return undefined;
  if (hit.startsWith(prefix) && hit.length > prefix.length) {
    return hit.slice(prefix.length).trim();
  }
  const i = args.indexOf(hit);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

const ROOT = (
  argValue("--root=") ||
  process.env.SCHOOL_GALLERY_IMPORT_ROOT ||
  "D:\\Schools"
).trim();
const COUNTRY = (argValue("--country=") || "ZA").trim().toUpperCase();
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  ZA: "ZAR",
  BW: "BWP",
  LS: "LSL",
  ZM: "ZMW",
  ZW: "ZWL",
  NA: "NAD",
};
const PREFERRED_CURRENCY = CURRENCY_BY_COUNTRY[COUNTRY] || "ZAR";
const USERNAME_PREFIX = (argValue("--username-prefix=") || "zagal").trim().toLowerCase();
const EMAIL_DOMAIN = (
  process.env.SCHOOL_IMPORT_EMAIL_DOMAIN ||
  process.env.BW_SCHOOL_IMPORT_EMAIL_DOMAIN ||
  "legacy-user.com"
)
  .trim()
  .toLowerCase();

const LIMIT_RAW = argValue("--limit=");
const LIMIT = LIMIT_RAW ? Math.max(1, parseInt(LIMIT_RAW, 10) || 0) : undefined;
const OFFSET_RAW = argValue("--offset=");
const OFFSET = OFFSET_RAW ? Math.max(0, parseInt(OFFSET_RAW, 10) || 0) : 0;
const MAX_GALLERY_RAW = argValue("--max-gallery=");
const MAX_GALLERY = MAX_GALLERY_RAW ? Math.max(1, parseInt(MAX_GALLERY_RAW, 10) || 0) : 0;
const ONLY_FOLDERS = (argValue("--only=") || "")
  .split("|")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const TARGET_USER_ID = (argValue("--target-user-id=") || "").trim();
const SINGLE_FOLDER = (
  argValue("--folder=") ||
  process.env.SCHOOL_GALLERY_IMPORT_FOLDER ||
  ""
).trim();

function listImageFiles(dir: string): string[] {
  return listSchoolGalleryImageFiles(dir, { maxFiles: MAX_GALLERY > 0 ? MAX_GALLERY : 80 });
}

type SchoolUser = {
  _id: mongoose.Types.ObjectId;
  name: string;
  username?: string;
  avatar?: string;
  profileGalleryUrls?: string[];
  isSchoolAccount?: boolean;
  email?: string;
  importedFromLegacy?: boolean;
  countryCode?: string;
};

const SCHOOL_USER_SELECT =
  "name username avatar profileGalleryUrls isSchoolAccount email importedFromLegacy countryCode";

function isLegacyNumericSchoolUsername(username?: string | null): boolean {
  const u = String(username || "").trim();
  return /^\d{6,}$/.test(u);
}

function isGalleryImportUsername(username?: string | null): boolean {
  const u = String(username || "").trim().toLowerCase();
  return u.startsWith(USERNAME_PREFIX) && /^zagal[a-f0-9]+$/.test(u);
}

/** School gallery matching pool — avoid `{ countryCode: ZA }` (loads every SA user, very slow). */
function schoolCandidateQuery() {
  return {
    $or: [
      { isSchoolAccount: true },
      { importedFromLegacy: true },
      { username: /^\d{6,}$/ },
      { username: new RegExp(`^${USERNAME_PREFIX}[a-f0-9]+$`, "i") },
    ],
    name: { $exists: true, $ne: "" },
  };
}

function rowFromUser(u: Record<string, unknown>): SchoolUser | null {
  const name = String(u.name || "").trim();
  if (!name) return null;
  if (
    !looksLikeSchoolInstitutionName(name) &&
    !isImportableSchoolFolder(name) &&
    !isKnownSchoolAccountName(name) &&
    !(u as { isSchoolAccount?: boolean }).isSchoolAccount
  ) {
    return null;
  }
  return {
    _id: u._id as mongoose.Types.ObjectId,
    name,
    username: u.username as string | undefined,
    avatar: u.avatar as string | undefined,
    profileGalleryUrls: (u.profileGalleryUrls as string[]) || [],
    isSchoolAccount: !!u.isSchoolAccount,
    email: u.email as string | undefined,
    importedFromLegacy: !!u.importedFromLegacy,
    countryCode: u.countryCode as string | undefined,
  };
}

/** Prefer legacy numeric-id school rows over gallery-import duplicates when names tie. */
function preferSchoolUser(a: SchoolUser, b: SchoolUser): SchoolUser {
  const aLegacy = isLegacyNumericSchoolUsername(a.username);
  const bLegacy = isLegacyNumericSchoolUsername(b.username);
  if (aLegacy && !bLegacy) return a;
  if (bLegacy && !aLegacy) return b;
  const aGal = isGalleryImportUsername(a.username);
  const bGal = isGalleryImportUsername(b.username);
  if (!aGal && bGal) return a;
  if (aGal && !bGal) return b;
  const aGallery = (a.profileGalleryUrls || []).length;
  const bGallery = (b.profileGalleryUrls || []).length;
  if (aGallery !== bGallery) return aGallery >= bGallery ? a : b;
  return a;
}

function pickBestUserMatch(matches: SchoolUser[], folderLabel: string): SchoolUser | null {
  if (!matches.length) return null;
  const aliasKeys = new Set(folderAliasAccountKeys(folderLabel));
  const ranked = rankSchoolMatches(
    folderLabel,
    matches.map((m) => ({ _id: String(m._id), name: m.name }))
  );
  if (aliasKeys.size) {
    for (const m of matches) {
      const mk = schoolAccountMatchKey(m.name);
      if (aliasKeys.has(mk)) {
        ranked.unshift({
          userId: String(m._id),
          name: m.name,
          score: 0.98,
          method: "exact_key",
        });
      }
    }
    ranked.sort((a, b) => b.score - a.score);
  }
  const best = pickBestRankedMatch(folderLabel, ranked);
  if (!best) return null;
  const tied = matches.filter((m) => {
    const r = ranked.find((x) => x.userId === String(m._id));
    return r && best.score - r.score < 0.02;
  });
  const pool = tied.length ? tied : matches.filter((m) => String(m._id) === best.userId);
  return pool.reduce(preferSchoolUser);
}

function listImportUsername(prefix: string, displayName: string): string {
  const key = schoolDedupeKey(displayName);
  const h = crypto.createHash("sha256").update(`${prefix}:${key}:${matchKey(displayName)}`).digest("hex").slice(0, 12);
  return `${prefix}${h}`;
}

async function uniqueEmail(localBase: string): Promise<string> {
  const local = localBase.toLowerCase().replace(/[^a-z0-9._+-]/g, "").slice(0, 60) || "school";
  let candidate = `${local}@${EMAIL_DOMAIN}`;
  let n = 0;
  while (await User.findOne({ email: candidate }).select("_id").lean()) {
    n += 1;
    candidate = `${local}+${n}@${EMAIL_DOMAIN}`;
  }
  return candidate;
}

function findExistingByDedupeInRows(displayName: string, rows: SchoolUser[]): SchoolUser | null {
  const key = schoolDedupeKey(displayName);
  if (!key) return null;
  let best: SchoolUser | null = null;
  for (const row of rows) {
    const uk = schoolDedupeKey(row.name);
    if (uk === key || keysConflict(uk, key)) {
      best = best ? preferSchoolUser(best, row) : row;
    }
  }
  return best;
}

async function createSchoolUser(displayName: string, allRows: SchoolUser[]): Promise<SchoolUser> {
  const name = normName(displayName);
  const existing = findExistingByDedupeInRows(name, allRows);
  if (existing) return existing;

  const username = listImportUsername(USERNAME_PREFIX, name);
  const hit = await User.findOne({ username }).select(SCHOOL_USER_SELECT).lean();
  if (hit) {
    const row = rowFromUser(hit as Record<string, unknown>);
    if (row) return row;
  }

  const email = await uniqueEmail(`gal-${username}`);
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex") + username + name, 10);

  const doc = await User.create({
    name,
    username,
    email,
    passwordHash,
    role: ["client"],
    countryCode: COUNTRY,
    preferredCurrency: PREFERRED_CURRENCY,
    isVerified: false,
    active: true,
    suspended: false,
    locked: false,
    isSchoolAccount: true,
    importedFromLegacy: false,
  });

  console.log(`Created school account: ${name} (${username})`);
  return {
    _id: doc._id as mongoose.Types.ObjectId,
    name,
    profileGalleryUrls: [],
    isSchoolAccount: true,
    email,
  };
}

function registerUserInIndexes(
  row: SchoolUser,
  byKey: Map<string, SchoolUser[]>,
  byExactUpper: Map<string, SchoolUser[]>,
  allRows: SchoolUser[]
) {
  const key = matchKey(row.name);
  if (key) {
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }
  const upper = cleanFolderLabel(row.name).toUpperCase();
  if (!byExactUpper.has(upper)) byExactUpper.set(upper, []);
  byExactUpper.get(upper)!.push(row);
  allRows.push(row);
}

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI not set in backend/.env");
    process.exit(1);
  }
  if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
    console.error(`Root not found: ${ROOT}`);
    process.exit(1);
  }

  const folders = SINGLE_FOLDER
    ? (() => {
        const hit = resolveSchoolGalleryFolderPath(ROOT, SINGLE_FOLDER);
        return hit ? [hit] : [];
      })()
    : listSchoolGallerySourceFolders(ROOT);

  const slice = SINGLE_FOLDER ? folders : folders.slice(OFFSET, LIMIT ? OFFSET + LIMIT : undefined);
  console.log(`Root: ${ROOT}`);
  console.log(`Country: ${COUNTRY} | create missing: ${CREATE_MISSING}`);
  console.log(`Max gallery per folder: ${MAX_GALLERY || "all images"}`);
  if (SINGLE_FOLDER) {
    console.log(`Folder: ${SINGLE_FOLDER}${slice.length ? "" : " (not found under root)"}`);
  } else {
    console.log(`Folders: ${slice.length} (offset ${OFFSET}${LIMIT ? `, limit ${LIMIT}` : ""})`);
  }
  if (DRY) console.log("DRY RUN — no files or DB writes");

  await mongoose.connect(mongoUri);

  const candidates = await User.find(schoolCandidateQuery()).select(SCHOOL_USER_SELECT).lean();
  console.log(`Loaded ${candidates.length} school match candidates from MongoDB`);

  const byKey = new Map<string, SchoolUser[]>();
  const byExactUpper = new Map<string, SchoolUser[]>();
  const allRows: SchoolUser[] = [];

  for (const u of candidates) {
    const row = rowFromUser(u as Record<string, unknown>);
    if (!row) continue;
    registerUserInIndexes(row, byKey, byExactUpper, allRows);
  }

  const uploadsRoot = path.resolve(__dirname, "../uploads");
  const report: Array<Record<string, unknown>> = [];

  let imported = 0;
  let createdUsers = 0;
  let skippedNoImages = 0;
  let skippedNoMatch = 0;
  let skippedAmbiguous = 0;
  let skippedNotSchool = 0;

  for (const folder of slice) {
    const folderName = path.basename(folder);
    if (ONLY_FOLDERS.length && !ONLY_FOLDERS.includes(folderName.toLowerCase())) continue;
    const label = cleanFolderLabel(folderName);
    const images = listImageFiles(folder);
    const entry: Record<string, unknown> = { folder: folderName, images: images.length };

    const forceFolder =
      ONLY_FOLDERS.length > 0 && ONLY_FOLDERS.includes(folderName.toLowerCase());
    const importable =
      forceFolder ||
      looksLikeSchoolInstitutionName(label) ||
      isImportableSchoolFolder(label) ||
      (CREATE_MISSING && !/^A-?BLOCK$/i.test(label));
    if (!importable) {
      skippedNotSchool++;
      entry.status = "skip_not_school_name";
      report.push(entry);
      continue;
    }

    if (!images.length) {
      skippedNoImages++;
      entry.status = "skip_no_images";
      report.push(entry);
      continue;
    }

    let user: SchoolUser | undefined;

    if (TARGET_USER_ID && mongoose.Types.ObjectId.isValid(TARGET_USER_ID)) {
      const forced = await User.findById(TARGET_USER_ID).select(SCHOOL_USER_SELECT).lean();
      const row = forced ? rowFromUser(forced as Record<string, unknown>) : null;
      if (row) {
        user = row;
        entry.matchMethod = "target_user_id";
      } else {
        entry.status = "invalid_target_user_id";
        report.push(entry);
        continue;
      }
    }

    const key = matchKey(label);
    let matches = byKey.get(key) || [];
    if (!matches.length) {
      matches = byExactUpper.get(label.toUpperCase()) || [];
    }

    const dedupeHit = findExistingByDedupeInRows(label, allRows);
    if (dedupeHit) {
      matches = [dedupeHit, ...matches.filter((m) => String(m._id) !== String(dedupeHit._id))];
      entry.matchMethod = "dedupe_key";
    }

    if (!matches.length) {
      const ranked = rankSchoolMatches(label, allRows.map((r) => ({ _id: String(r._id), name: r.name })));
      const best = pickBestRankedMatch(label, ranked);
      if (best) {
        const hit = allRows.find((r) => String(r._id) === best.userId);
        if (hit) matches = [hit];
        entry.matchMethod = best.method;
        entry.matchScore = best.score;
      }
    }

    if (!user) user = pickBestUserMatch(matches, label);

    if (!user && CREATE_MISSING) {
      if (DRY) {
        entry.status = "would_create_user";
        entry.displayName = label;
        report.push(entry);
        console.log(`[dry-run] CREATE: ${folderName}`);
        imported++;
        continue;
      }
      user = await createSchoolUser(label, allRows);
      createdUsers++;
      entry.createdUser = true;
      registerUserInIndexes(user, byKey, byExactUpper, allRows);
    }

    if (!user) {
      if (matches.length > 1) {
        skippedAmbiguous++;
        entry.status = "ambiguous";
        entry.matches = matches.slice(0, 5).map((m) => ({ id: String(m._id), name: m.name }));
      } else {
        skippedNoMatch++;
        entry.status = "no_match";
      }
      report.push(entry);
      continue;
    }

    if (matches.length > 1) entry.resolvedFrom = matches.length;
    const uid = String(user._id);
    entry.userId = uid;
    entry.userName = user.name;

    const toCopy = MAX_GALLERY > 0 ? images.slice(0, MAX_GALLERY) : images;
    const destDir = path.join(uploadsRoot, "school-gallery", uid);
    const newPaths: string[] = [];

    for (const src of toCopy) {
      const mod = await moderateMedia(src, mimeFromPath(src));
      if (moderationResultShouldRemove(mod)) {
        entry.skippedUnsafe = ((entry.skippedUnsafe as number) || 0) + 1;
        console.warn(`SKIP unsafe: ${folderName} / ${path.basename(src)} — ${mod.reason || "blocked"}`);
        continue;
      }
      const ext = path.extname(src).toLowerCase() || ".jpg";
      const base = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
      const dest = path.join(destDir, base);
      const publicPath = `/uploads/school-gallery/${uid}/${base}`;
      if (DRY) {
        console.log(`[dry-run] ${folderName} -> ${user.name} (${uid})  ${path.basename(src)}`);
      } else {
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, dest);
        newPaths.push(publicPath);
      }
    }

    const merged = DRY
      ? toCopy.map(() => "/uploads/school-gallery/preview.jpg")
      : APPEND
        ? [...new Set([...(user.profileGalleryUrls || []), ...newPaths])]
        : newPaths;

    const updates: Record<string, unknown> = {
      profileGalleryUrls: merged,
      isSchoolAccount: true,
      countryCode: user.countryCode || COUNTRY,
    };
    const avatarMissing =
      !user.avatar ||
      isUndeployedSchoolProfileAvatar(user.avatar) ||
      (user.avatar && !uploadPublicPathExists(String(user.avatar), uploadsRoot));
    if (SET_AVATAR && merged.length && avatarMissing) {
      const firstSynced = merged.find((p) => p.includes(`/school-gallery/${uid}/`)) || merged[0];
      updates.avatar = firstSynced;
    }
    if (isLegacyNumericSchoolUsername(user.username)) {
      updates.isSchoolAccount = true;
    }

    const previousAvatar = user.avatar;
    if (!DRY) {
      await User.updateOne({ _id: user._id }, { $set: updates });
      user.profileGalleryUrls = merged as string[];
      if (updates.avatar) user.avatar = merged[0];

      try {
        const feed = await publishSchoolGalleryFeedUpdates({
          userId: user._id,
          schoolName: user.name,
          newMediaPaths: newPaths,
          avatarPath: (updates.avatar as string) || user.avatar,
          previousAvatar,
        });
        entry.tvPostsCreated = feed.tvPostsCreated;
        entry.avatarStatusUpdate = feed.avatarFeed;
      } catch (feedErr) {
        console.warn(`Feed/status update failed for ${folderName}:`, (feedErr as Error)?.message || feedErr);
      }
    }

    imported++;
    entry.status = DRY ? "dry_run_ok" : "imported";
    entry.galleryCount = merged.length;
    entry.photosCopied = toCopy.length;
    entry.setAvatar = !!(updates.avatar && !DRY);
    report.push(entry);
    console.log(
      `${DRY ? "[dry-run] " : ""}OK: ${folderName} -> ${user.name} (${toCopy.length} photos, gallery ${merged.length})`
    );
  }

  const reportPath = path.resolve(
    __dirname,
    "../exports",
    `school-gallery-batch-import-${Date.now()}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        root: ROOT,
        country: COUNTRY,
        dryRun: DRY,
        append: APPEND,
        createMissing: CREATE_MISSING,
        maxGallery: MAX_GALLERY || null,
        offset: OFFSET,
        limit: LIMIT,
        imported,
        createdUsers,
        skippedNoImages,
        skippedNoMatch,
        skippedAmbiguous,
        skippedNotSchool,
        entries: report,
      },
      null,
      2
    )
  );

  console.log("\n--- Summary ---");
  console.log("Imported:", imported);
  console.log("School accounts created:", createdUsers);
  console.log("No images:", skippedNoImages);
  console.log("No match (no create):", skippedNoMatch);
  console.log("Ambiguous:", skippedAmbiguous);
  console.log("Skipped (not school-like):", skippedNotSchool);
  console.log("Report:", reportPath);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
