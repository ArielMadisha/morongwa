import dotenv from "dotenv";
import path from "path";
import axios from "axios";
import mongoose from "mongoose";
import User from "../src/data/models/User";
import TVPost from "../src/data/models/TVPost";
import SocialNewsBotPost from "../src/data/models/SocialNewsBotPost";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

type BotConfig = {
  key: string;
  botUsername?: string;
  botUserId?: string;
  sourcePageIds: string[];
  weekdays: Weekday[];
  keywords: string[];
  hashtags: string[];
  maxPostsPerRun: number;
};

type FacebookPost = {
  id: string;
  message?: string;
  permalink_url?: string;
  created_time?: string;
};

const args = process.argv.slice(2);
const IGNORE_DAY = args.includes("--ignore-day");
const DRY_RUN = args.includes("--dry-run");

function parseWeekday(d: Date, tz: string): Weekday {
  const label = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(d).toLowerCase();
  if (label.startsWith("mon")) return "mon";
  if (label.startsWith("tue")) return "tue";
  if (label.startsWith("wed")) return "wed";
  if (label.startsWith("thu")) return "thu";
  if (label.startsWith("fri")) return "fri";
  if (label.startsWith("sat")) return "sat";
  return "sun";
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function truncate(text: string, max = 280): string {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function normalizeTags(tags: string[]): string[] {
  return uniq(
    tags
      .map((t) => String(t || "").trim().replace(/^#/, ""))
      .filter(Boolean)
      .map((t) => t.replace(/[^A-Za-z0-9_]/g, ""))
      .filter(Boolean)
  ).slice(0, 12);
}

function defaultBots(allSourcePages: string[]): BotConfig[] {
  return [
    {
      key: "business-news",
      botUsername: "fbnewsbusiness",
      sourcePageIds: allSourcePages,
      weekdays: ["mon", "wed", "fri"],
      keywords: ["business", "market", "finance", "economy", "startup"],
      hashtags: ["BusinessNews", "QwertyBusiness", "FacebookNewsBot"],
      maxPostsPerRun: 2,
    },
    {
      key: "sports-news",
      botUsername: "fbnewssports",
      sourcePageIds: allSourcePages,
      weekdays: ["tue", "fri"],
      keywords: ["sports", "football", "soccer", "rugby", "cricket", "nba", "fifa"],
      hashtags: ["SportsNews", "QwertySports", "FacebookNewsBot"],
      maxPostsPerRun: 2,
    },
    {
      key: "general-news",
      botUsername: "fbnewsgeneral",
      sourcePageIds: allSourcePages,
      weekdays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
      keywords: ["news", "breaking", "world", "africa", "community", "education"],
      hashtags: ["News", "QwertyNews", "FacebookNewsBot"],
      maxPostsPerRun: 2,
    },
  ];
}

function loadBots(): BotConfig[] {
  const sharedPages = String(process.env.FB_SOURCE_PAGE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const raw = String(process.env.FB_NEWS_BOTS_JSON || "").trim();
  if (!raw) return defaultBots(sharedPages);
  const parsed = JSON.parse(raw) as BotConfig[];
  return parsed.map((b) => ({
    ...b,
    sourcePageIds: uniq((b.sourcePageIds || []).map((s) => String(s).trim()).filter(Boolean)),
    weekdays: (b.weekdays || []).map((d) => String(d).toLowerCase() as Weekday),
    keywords: uniq((b.keywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean)),
    hashtags: normalizeTags(b.hashtags || []),
    maxPostsPerRun: Math.max(1, Number(b.maxPostsPerRun || 2)),
  }));
}

async function fetchFacebookPosts(pageId: string, accessToken: string, limit: number): Promise<FacebookPost[]> {
  const url = `https://graph.facebook.com/v23.0/${encodeURIComponent(pageId)}/posts`;
  const res = await axios.get(url, {
    params: {
      fields: "id,message,permalink_url,created_time",
      limit,
      access_token: accessToken,
    },
    timeout: 20_000,
  });
  const data = res.data?.data;
  return Array.isArray(data) ? data : [];
}

function messageMatchesKeywords(message: string, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const lower = message.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

async function resolveBotUser(bot: BotConfig) {
  if (bot.botUserId && mongoose.Types.ObjectId.isValid(bot.botUserId)) {
    const hit = await User.findById(bot.botUserId).select("_id username name").lean();
    if (hit) return hit;
  }
  if (bot.botUsername) {
    const hit = await User.findOne({ username: String(bot.botUsername).toLowerCase() })
      .select("_id username name")
      .lean();
    if (hit) return hit;
  }
  return null;
}

async function run() {
  const mongoUri = process.env.MONGO_URI;
  const accessToken = String(process.env.FB_GRAPH_ACCESS_TOKEN || "").trim();
  const tz = String(process.env.FB_BOT_TIMEZONE || "Africa/Johannesburg").trim();
  if (!mongoUri) throw new Error("MONGO_URI missing");
  if (!accessToken) throw new Error("FB_GRAPH_ACCESS_TOKEN missing");

  const bots = loadBots();
  if (!bots.length) {
    console.log("No bots configured");
    return;
  }

  await mongoose.connect(mongoUri);
  const today = parseWeekday(new Date(), tz);
  console.log(`Today (${tz}): ${today}${DRY_RUN ? " [DRY RUN]" : ""}`);

  for (const bot of bots) {
    if (!IGNORE_DAY && !bot.weekdays.includes(today)) {
      console.log(`SKIP ${bot.key}: not scheduled today`);
      continue;
    }
    if (!bot.sourcePageIds.length) {
      console.log(`SKIP ${bot.key}: no sourcePageIds configured`);
      continue;
    }
    const botUser = await resolveBotUser(bot);
    if (!botUser) {
      console.log(`SKIP ${bot.key}: bot user not found (${bot.botUsername || bot.botUserId || "unset"})`);
      continue;
    }

    const harvested: Array<{ sourcePageId: string; post: FacebookPost }> = [];
    for (const pageId of bot.sourcePageIds) {
      try {
        const posts = await fetchFacebookPosts(pageId, accessToken, 8);
        for (const post of posts) harvested.push({ sourcePageId: pageId, post });
      } catch (err: any) {
        console.warn(`WARN ${bot.key}: failed fetching page ${pageId}: ${err?.message || err}`);
      }
    }

    const filtered = harvested
      .filter((x) => x.post?.id)
      .filter((x) => messageMatchesKeywords(String(x.post.message || ""), bot.keywords))
      .sort((a, b) => new Date(String(b.post.created_time || 0)).getTime() - new Date(String(a.post.created_time || 0)).getTime());

    let created = 0;
    for (const row of filtered) {
      if (created >= bot.maxPostsPerRun) break;
      const externalPostId = String(row.post.id);
      const exists = await SocialNewsBotPost.findOne({ source: "facebook", externalPostId }).select("_id").lean();
      if (exists) continue;

      const body = truncate(String(row.post.message || "").trim(), 1200);
      if (!body) continue;
      const permalink = String(row.post.permalink_url || "").trim();
      const hashtags = normalizeTags(bot.hashtags);
      const heading = truncate(body.split("\n")[0], 140) || "Facebook update";
      const subject = permalink ? truncate(`Source: ${permalink}`, 200) : undefined;

      console.log(`POST ${bot.key}: ${externalPostId} -> @${botUser.username || botUser.name}`);
      if (DRY_RUN) {
        created += 1;
        continue;
      }

      const tvPost = await TVPost.create({
        creatorId: botUser._id,
        type: "text",
        mediaUrls: [],
        heading,
        caption: body,
        subject,
        hashtags,
        status: "approved",
        hasWatermark: true,
      });
      await SocialNewsBotPost.create({
        source: "facebook",
        botKey: bot.key,
        externalPostId,
        sourcePageId: row.sourcePageId,
        creatorId: botUser._id,
        postedTvPostId: tvPost._id,
      });
      created += 1;
    }
    console.log(`DONE ${bot.key}: created=${created}`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

