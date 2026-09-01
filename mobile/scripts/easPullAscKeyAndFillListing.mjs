/**
 * Pull ASC API key (including .p8) from EAS servers using local Expo session,
 * then run listing fill. Never prints key material.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(__dirname, "..");
const STATE = path.join(process.env.USERPROFILE || "", ".expo", "state.json");
const OUT_P8 = path.join(MOBILE, "credentials", "AuthKey_ASC.p8");
const PROJECT_ID = "686960ed-6d34-446e-9872-eeafe4dfe5f1";
const ACCOUNT = "qwertymates";
const BUNDLE = "com.qwertymates.app";

const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const sessionSecret = state?.auth?.sessionSecret;
if (!sessionSecret) {
  console.error("No Expo session in ~/.expo/state.json — run: npx eas-cli whoami");
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "expo-session": sessionSecret
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors?.length) {
    const err = new Error(json.errors.map((e) => e.message).join("; "));
    err.body = json.errors;
    throw err;
  }
  return json.data;
}

async function main() {
  const data = await gql(
    `
    query($accountName: String!) {
      account {
        byName(accountName: $accountName) {
          id
          name
          appStoreConnectApiKeysPaginated(first: 20) {
            edges {
              node {
                id
                keyIdentifier
                issuerIdentifier
                name
              }
            }
          }
        }
      }
    }
  `,
    { accountName: ACCOUNT }
  );

  const keys = (data.account.byName.appStoreConnectApiKeysPaginated.edges || []).map(
    (e) => e.node
  );

  console.log(
    "ASC keys on EAS:",
    keys.map((k) => ({ id: k.id, keyId: k.keyIdentifier, name: k.name }))
  );
  if (!keys.length) {
    console.error("No ASC API keys on EAS account.");
    process.exit(1);
  }
  const preferred =
    keys.find((k) => k.keyIdentifier === "2SAQZ4V7X9") || keys[0];

  const full = await gql(
    `
    query($id: ID!) {
      appStoreConnectApiKey {
        byId(id: $id) {
          id
          issuerIdentifier
          keyIdentifier
          keyP8
        }
      }
    }
  `,
    { id: preferred.id }
  );

  const key = full.appStoreConnectApiKey.byId;
  if (!key?.keyP8 || !key?.issuerIdentifier) {
    console.error("EAS did not return keyP8/issuer — insufficient permissions?");
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_P8), { recursive: true });
  fs.writeFileSync(OUT_P8, key.keyP8, { encoding: "utf8", mode: 0o600 });
  // ensure gitignore
  const gi = path.join(MOBILE, "credentials", ".gitignore");
  if (!fs.existsSync(gi)) {
    fs.writeFileSync(gi, "*.p8\nAuthKey_*.p8\n*.jks\n");
  } else if (!fs.readFileSync(gi, "utf8").includes("*.p8")) {
    fs.appendFileSync(gi, "\n*.p8\nAuthKey_*.p8\n");
  }

  console.log("Wrote ASC private key to credentials/AuthKey_ASC.p8 (gitignored)");
  console.log("Key ID:", key.keyIdentifier);
  console.log("Issuer: present");

  process.env.ASC_ISSUER_ID = key.issuerIdentifier;
  process.env.ASC_KEY_ID = key.keyIdentifier;
  process.env.ASC_PRIVATE_KEY_PATH = OUT_P8;

  const r = spawnSync(
    process.execPath,
    [
      path.join(MOBILE, "scripts", "ascFillListing.mjs"),
      ...process.argv.slice(2)
    ],
    { cwd: MOBILE, env: process.env, stdio: "inherit" }
  );
  process.exit(r.status ?? 1);
}

main().catch((e) => {
  console.error(e.message);
  if (e.body) console.error(JSON.stringify(e.body, null, 2).slice(0, 1500));
  process.exit(1);
});
