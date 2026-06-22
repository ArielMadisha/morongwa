import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const circledNames = ["cejvwfcgvbpdzvkuxb", "yokqwbwihepxprcdmzmi", "wwfixjdrqqgapdggnmy"];

await mongoose.connect(process.env.MONGO_URI);
const users = mongoose.connection.db.collection("users");

const circled = await users
  .find({ name: { $in: circledNames } })
  .project({ name: 1, username: 1, email: 1, phone: 1, createdAt: 1 })
  .sort({ name: 1 })
  .toArray();

const fsfsd = await users
  .find({ name: { $regex: "^fsfsd fsfsdf$", $options: "i" } })
  .project({ name: 1, username: 1, email: 1, phone: 1, createdAt: 1 })
  .sort({ createdAt: 1 })
  .toArray();

const lines = [
  "# Suspicious / junk user accounts",
  "",
  "Generated from production MongoDB on **2026-06-22**.",
  "",
  "These accounts show up in **Qwerty Users** suggestions with random-looking display names or duplicate junk names. Likely spam / bot registrations.",
  "",
  "---",
  "",
  "## Circled on wall (weird display names)",
  "",
  "These three were highlighted in the Qwerty Users sidebar (display name = random string).",
  "",
  "| Display name | @username | User ID | Email | Created |",
  "|---|---|---|---|---|",
];

for (const u of circled) {
  lines.push(
    `| ${u.name} | @${u.username} | \`${u._id}\` | ${u.email ?? "—"} | ${u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "—"} |`
  );
}

lines.push(
  "",
  "---",
  "",
  `## "fsfsd fsfsdf" accounts (${fsfsd.length} total)`,
  "",
  "All accounts share the same display name **fsfsd fsfsdf** but different auto-generated usernames. Bulk-created around **2025-03-22** (mostly +998 Uzbekistan numbers).",
  "",
  "| # | @username | User ID | Email | Phone | Created |",
  "|---:|---|---|---|---|---|"
);

fsfsd.forEach((u, i) => {
  lines.push(
    `| ${i + 1} | @${u.username} | \`${u._id}\` | ${u.email ?? "—"} | ${u.phone ?? "—"} | ${u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "—"} |`
  );
});

lines.push(
  "",
  "---",
  "",
  "## Profile URLs (circled)",
  ""
);

for (const u of circled) {
  lines.push(`- [${u.name}](https://www.qwertymates.com/user/${u._id}) — @${u.username}`);
}

lines.push("", "## Re-query", "", "From `backend/`:", "", "```bash", "node scripts/listSuspiciousUsers.mjs", "```", "");

const outPath = path.join(__dirname, "../../DOCS/SUSPICIOUS_USER_ACCOUNTS.md");
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Wrote ${outPath} (${circled.length} circled, ${fsfsd.length} fsfsd)`);

await mongoose.disconnect();
