import mongoose from "mongoose";
import TVPost from "../data/models/TVPost";
import User from "../data/models/User";
import { AppError } from "../middleware/errorHandler";
import { resolveAiNewsPostMedia, resolveSportsAiNewsPostMedia } from "./aiNewsImage";
import { isCompleteAiNewsContent, isIncompleteAiNewsPost } from "./aiNewsQuality";
import { isLowValueSportsHeadline } from "./sportsClubMedia";

export type AiNewsCategory = "tech" | "sports" | "entertainment" | "motoring";

type GeneratedNews = {
  title: string;
  summary: string;
  caption: string;
  hashtags: string[];
};

type LiveNewsItem = {
  source: string;
  title: string;
  summary: string;
  url: string;
  publishedAt?: string;
  imageUrl?: string;
};

export const TECH_TOPICS = [
  "AI tools improving small business productivity in Africa",
  "Mobile payment innovation trends in South Africa",
  "Cybersecurity best practices for everyday users",
  "How cloud services are helping startups scale",
  "The rise of e-commerce logistics technology",
  "Responsible use of generative AI in schools and workplaces",
  "Affordable smartphone innovations and digital access",
  "Digital entrepreneurship opportunities for young creators",
];

export const SPORTS_TOPICS = [
  "Premier League title race latest developments",
  "UEFA Champions League knockout stage updates",
  "PSL and South African football weekly highlights",
  "Rugby Championship and Springboks performance watch",
  "Cricket international series and tournament updates",
  "NBA and global basketball headline updates",
  "Formula 1 race weekend and standings analysis",
  "Athletics and Olympic sport preparation updates",
];

export const ENTERTAINMENT_TOPICS = [
  "New film releases and streaming highlights this week",
  "Global music releases and chart movements",
  "Celebrity interviews, festivals, and event highlights",
  "Entertainment industry business and box office updates",
  "Award season updates and notable nominations",
  "African entertainment and creative industry highlights",
];

export const MOTORING_TOPICS = [
  "Passenger vehicle launch updates and market trends",
  "Truck and commercial fleet logistics innovation",
  "Electric vehicle battery, charging, and affordability updates",
  "Motorbike and scooter market trends and safety updates",
  "Automotive manufacturing and supply chain developments",
  "Road safety, mobility policy, and transport infrastructure updates",
];

function pickTopicForDate(date = new Date(), category: AiNewsCategory = "tech"): string {
  const daySeed = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  const topics =
    category === "sports"
      ? SPORTS_TOPICS
      : category === "entertainment"
      ? ENTERTAINMENT_TOPICS
      : category === "motoring"
      ? MOTORING_TOPICS
      : TECH_TOPICS;
  return topics[daySeed % topics.length];
}

function buildPrompt(topic: string, category: AiNewsCategory = "tech"): string {
  const categoryHint =
    category === "sports"
      ? "sports"
      : category === "entertainment"
      ? "entertainment (films, music, celebrities, events)"
      : category === "motoring"
      ? "automotive and mobility (trucks, passenger vehicles, bikes, road transport)"
      : "technology and business innovation";
  return [
    "Write a factual, neutral, concise news-style update.",
    "Return JSON only with keys: title, summary, caption, hashtags.",
    "Rules:",
    "- title: 8-14 words",
    "- summary: 120-180 words, no markdown",
    "- caption: one short sentence suitable for social feed",
    "- hashtags: array of 3-6 strings without # prefix",
    "- avoid sensational claims and fabricated numbers",
    `- keep the story in the ${categoryHint} domain`,
    `Topic: ${topic}`,
  ].join("\n");
}

function xmlDecode(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .trim();
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractFeedImageUrl(block: string, descriptionRaw: string): string | undefined {
  const enclosureTag = block.match(/<enclosure[^>]*>/i)?.[0] || "";
  if (/type=["']image\//i.test(enclosureTag)) {
    const u = enclosureTag.match(/url=["']([^"']+)["']/i)?.[1];
    if (u) return u.trim();
  }
  const mediaThumb = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1];
  if (mediaThumb) return mediaThumb.trim();
  const mediaContent = block.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[0] || "";
  if (/medium=["']image["']/i.test(mediaContent) || /type=["']image\//i.test(mediaContent)) {
    const u = mediaContent.match(/url=["']([^"']+)["']/i)?.[1];
    if (u) return u.trim();
  }
  const imgInDesc = descriptionRaw.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  if (imgInDesc) return imgInDesc.trim();
  return undefined;
}

function parseRssItems(xml: string): LiveNewsItem[] {
  const rows: LiveNewsItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const title = xmlDecode((block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
    const link = xmlDecode((block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim());
    const descriptionRaw = xmlDecode((block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "").trim());
    const pubDate = xmlDecode((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim());
    const source = xmlDecode((block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "").trim());
    const summary = stripHtml(descriptionRaw);
    if (!title || !link) continue;
    rows.push({
      source: source || "Unknown source",
      title,
      summary,
      url: link,
      publishedAt: pubDate || undefined,
      imageUrl: extractFeedImageUrl(block, descriptionRaw),
    });
  }
  return rows;
}

function parseAtomEntries(xml: string): LiveNewsItem[] {
  const rows: LiveNewsItem[] = [];
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of entryBlocks) {
    const title = xmlDecode((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
    const link =
      xmlDecode((block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] || "").trim()) ||
      xmlDecode((block.match(/<id>([\s\S]*?)<\/id>/i)?.[1] || "").trim());
    const summaryRaw =
      xmlDecode((block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || "").trim()) ||
      xmlDecode((block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] || "").trim());
    const source = xmlDecode((block.match(/<source[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>[\s\S]*?<\/source>/i)?.[1] || "").trim());
    const publishedAt =
      xmlDecode((block.match(/<published>([\s\S]*?)<\/published>/i)?.[1] || "").trim()) ||
      xmlDecode((block.match(/<updated>([\s\S]*?)<\/updated>/i)?.[1] || "").trim());
    if (!title || !link) continue;
    rows.push({
      source: source || "Unknown source",
      title,
      summary: stripHtml(summaryRaw),
      url: link,
      publishedAt: publishedAt || undefined,
      imageUrl: extractFeedImageUrl(block, summaryRaw),
    });
  }
  return rows;
}

function getRssFeeds(category: AiNewsCategory = "tech"): string[] {
  const envKey =
    category === "sports"
      ? "AI_SPORTS_RSS_FEEDS"
      : category === "entertainment"
      ? "AI_ENTERTAINMENT_RSS_FEEDS"
      : category === "motoring"
      ? "AI_MOTORING_RSS_FEEDS"
      : "AI_NEWS_RSS_FEEDS";
  const raw = String(process.env[envKey] || "").trim();
  if (raw) {
    return raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (category === "sports") {
    return [
      "https://news.google.com/rss/search?q=sports%20breaking%20news%20when%3A2h&hl=en-US&gl=US&ceid=US:en",
      "https://news.google.com/rss/search?q=football%20soccer%20when%3A2h&hl=en-GB&gl=GB&ceid=GB:en",
      "https://news.google.com/rss/search?q=rugby%20south%20africa%20when%3A6h&hl=en-ZA&gl=ZA&ceid=ZA:en",
      "https://news.google.com/rss/search?q=cricket%20international%20when%3A6h&hl=en-IN&gl=IN&ceid=IN:en",
      "https://www.espn.com/espn/rss/news",
      "https://www.skysports.com/rss/12040",
      "http://feeds.bbci.co.uk/sport/rss.xml?edition=uk",
    ];
  }
  if (category === "entertainment") {
    return [
      "https://news.google.com/rss/search?q=entertainment%20news%20when%3A6h&hl=en-US&gl=US&ceid=US:en",
      "https://news.google.com/rss/search?q=new%20movies%20streaming%20when%3A1d&hl=en-US&gl=US&ceid=US:en",
      "https://news.google.com/rss/search?q=new%20music%20releases%20when%3A1d&hl=en-US&gl=US&ceid=US:en",
      "https://news.google.com/rss/search?q=celebrity%20news%20when%3A1d&hl=en-US&gl=US&ceid=US:en",
      "https://www.billboard.com/feed/",
      "https://www.hollywoodreporter.com/feed/",
      "https://www.rollingstone.com/music/music-news/feed/",
      "https://pitchfork.com/rss/news/",
    ];
  }
  if (category === "motoring") {
    return [
      "https://news.google.com/rss/search?q=automotive%20industry%20news%20when%3A1d&hl=en-US&gl=US&ceid=US:en",
      "https://news.google.com/rss/search?q=truck%20industry%20logistics%20when%3A2d&hl=en-US&gl=US&ceid=US:en",
      "https://news.google.com/rss/search?q=passenger%20vehicle%20launch%20when%3A2d&hl=en-US&gl=US&ceid=US:en",
      "https://news.google.com/rss/search?q=electric%20vehicle%20charging%20when%3A2d&hl=en-US&gl=US&ceid=US:en",
      "https://news.google.com/rss/search?q=motorcycle%20industry%20when%3A2d&hl=en-US&gl=US&ceid=US:en",
      "https://www.autocar.co.uk/rss",
      "https://www.motorcyclenews.com/news/feed/",
      "https://www.thedrive.com/rss",
    ];
  }
  return [
    // Realtime global + regional queries (fresh rolling updates)
    "https://news.google.com/rss/search?q=breaking%20news%20when%3A1h&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=Africa%20news%20when%3A2h&hl=en-ZA&gl=ZA&ceid=ZA:en",
    "https://news.google.com/rss/search?q=South%20Africa%20business%20when%3A2h&hl=en-ZA&gl=ZA&ceid=ZA:en",
    "https://news.google.com/rss/search?q=technology%20AI%20startups%20when%3A2h&hl=en-US&gl=US&ceid=US:en",
    // Trusted publisher feeds
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://techcrunch.com/feed/",
    "https://www.theverge.com/rss/index.xml",
    "http://feeds.bbci.co.uk/news/world/rss.xml",
    "http://feeds.bbci.co.uk/news/technology/rss.xml",
  ];
}

async function fetchLiveNewsCandidates(
  topic?: string,
  category: AiNewsCategory = "tech"
): Promise<LiveNewsItem[]> {
  const feeds = getRssFeeds(category);
  if (topic?.trim()) {
    const q = encodeURIComponent(`${topic.trim()} when:2d`);
    feeds.unshift(`https://news.google.com/rss/search?q=${q}&hl=en-ZA&gl=ZA&ceid=ZA:en`);
  }
  const uniqueFeeds = [...new Set(feeds)];
  const allItems: LiveNewsItem[] = [];
  for (const url of uniqueFeeds.slice(0, 6)) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "morongwa-ai-news/1.0" } });
      if (!response.ok) continue;
      const xml = await response.text();
      const parsed = xml.includes("<entry") ? parseAtomEntries(xml) : parseRssItems(xml);
      allItems.push(...parsed);
    } catch {
      // Ignore one feed failing; try others.
    }
  }
  return allItems;
}

function normalizeForCompare(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

async function pickLiveNewsItem(
  topic?: string,
  category: AiNewsCategory = "tech"
): Promise<LiveNewsItem | null> {
  const candidates = await fetchLiveNewsCandidates(topic, category);
  if (!candidates.length) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const usedRows = await TVPost.find({
    isAiNews: true,
    newsCategory: category,
    createdAt: { $gte: start },
  })
    .select("heading newsTopic")
    .lean();
  const usedTokens = new Set<string>();
  for (const row of usedRows as Array<{ heading?: string; newsTopic?: string }>) {
    const h = normalizeForCompare(String(row.heading || ""));
    const t = normalizeForCompare(String(row.newsTopic || ""));
    if (h) usedTokens.add(h);
    if (t) usedTokens.add(t);
  }
  const filtered =
    category === "sports"
      ? candidates.filter((item) => !isLowValueSportsHeadline(item.title))
      : candidates;
  const pool = filtered.length ? filtered : candidates;

  for (const item of pool) {
    const keyTitle = normalizeForCompare(item.title);
    const keyTopic = normalizeForCompare(`${item.source} ${item.title}`);
    if (!usedTokens.has(keyTitle) && !usedTokens.has(keyTopic)) {
      return item;
    }
  }
  if (category === "sports") return null;
  return pool[0] || null;
}

function buildPromptFromLiveItem(item: LiveNewsItem): string {
  const publishedAt = item.publishedAt ? `Published: ${item.publishedAt}` : "Published: unknown";
  return [
    "Write a factual, neutral, concise news-style update grounded only in the source item.",
    "Do not invent claims, statistics, names, timelines, or outcomes not present in the source details.",
    "Return JSON only with keys: title, summary, caption, hashtags.",
    "Rules:",
    "- title: 8-14 words",
    "- summary: 120-180 words, no markdown",
    "- caption: one short sentence suitable for social feed",
    "- hashtags: array of 3-6 strings without # prefix",
    "- include attribution naturally in the summary (source name)",
    "Source item:",
    `- Source: ${item.source}`,
    `- Headline: ${item.title}`,
    `- Snippet: ${item.summary || "No snippet provided"}`,
    `- URL: ${item.url}`,
    `- ${publishedAt}`,
  ].join("\n");
}

/** Map OpenAI HTTP errors to sensible API statuses (avoid 502 for quota/rate-limit — that looks like your server crashed). */
function throwOpenAiHttpError(status: number, detailRaw: string): never {
  let openaiCode: string | undefined;
  let openaiMsg: string | undefined;
  const trimmed = detailRaw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed) as { error?: { message?: string; code?: string; type?: string } };
      openaiCode = j?.error?.code || j?.error?.type;
      openaiMsg = j?.error?.message;
    } catch {
      /* ignore */
    }
  }
  if (status === 429) {
    const quota =
      openaiCode === "insufficient_quota" ||
      openaiMsg?.toLowerCase().includes("quota") ||
      openaiMsg?.toLowerCase().includes("billing");
    throw new AppError(
      quota
        ? "OpenAI quota or billing limit reached. Add credits or upgrade your plan in the OpenAI dashboard."
        : "OpenAI rate limit reached. Wait a moment and try again.",
      429
    );
  }
  if (status === 401) {
    throw new AppError("OpenAI rejected the API key. Check OPENAI_API_KEY.", 401);
  }
  if (status >= 500) {
    throw new AppError("OpenAI service is temporarily unavailable. Try again later.", 503);
  }
  if (status >= 400 && status < 500) {
    const snippet = (openaiMsg || trimmed).slice(0, 400);
    throw new AppError(snippet || `OpenAI request failed (HTTP ${status})`, 400);
  }
  throw new AppError(`OpenAI request failed (HTTP ${status})`, 502);
}

function coerceGeneratedNews(raw: unknown): GeneratedNews {
  const fallback: GeneratedNews = {
    title: "Tech update",
    summary: "Latest developments in technology and digital innovation.",
    caption: "AI News: Technology update",
    hashtags: ["Tech", "Innovation", "AINews"],
  };
  if (!raw || typeof raw !== "object") return fallback;
  const row = raw as Record<string, unknown>;
  const title = String(row.title || "").trim();
  const summary = String(row.summary || "").trim();
  const caption = String(row.caption || "").trim();
  const hashtags = Array.isArray(row.hashtags)
    ? row.hashtags.map((h) => String(h || "").replace(/^#+/, "").trim()).filter(Boolean).slice(0, 6)
    : [];
  return {
    title: title || fallback.title,
    summary: summary || fallback.summary,
    caption: caption || fallback.caption,
    hashtags: hashtags.length ? hashtags : fallback.hashtags,
  };
}

async function callOpenAiForNews(
  topic: string,
  category: AiNewsCategory = "tech"
): Promise<GeneratedNews> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new AppError("OPENAI_API_KEY is missing", 500);
  const model = String(process.env.AI_NEWS_MODEL || "gpt-4o-mini").trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a newsroom assistant generating safe, factual summaries." },
        { role: "user", content: buildPrompt(topic, category) },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throwOpenAiHttpError(response.status, detail);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = String(data.choices?.[0]?.message?.content || "").trim();
  if (!content) throw new AppError("OpenAI returned empty content", 500);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }
  return coerceGeneratedNews(parsed);
}

async function callOpenAiForGroundedNews(item: LiveNewsItem): Promise<GeneratedNews> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new AppError("OPENAI_API_KEY is missing", 500);
  const model = String(process.env.AI_NEWS_MODEL || "gpt-4o-mini").trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a newsroom assistant. Stay strictly grounded in provided source details and keep tone neutral.",
        },
        { role: "user", content: buildPromptFromLiveItem(item) },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throwOpenAiHttpError(response.status, detail);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = String(data.choices?.[0]?.message?.content || "").trim();
  if (!content) throw new AppError("OpenAI returned empty content", 500);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }
  return coerceGeneratedNews(parsed);
}

async function resolveNewsCreatorId(category: AiNewsCategory = "tech"): Promise<mongoose.Types.ObjectId> {
  const creatorUsername =
    category === "sports"
      ? String(process.env.AI_SPORTS_CREATOR_USERNAME || "worldnews").trim().toLowerCase()
      : category === "entertainment"
      ? String(process.env.AI_ENTERTAINMENT_CREATOR_USERNAME || "entertainment").trim().toLowerCase()
      : category === "motoring"
      ? String(process.env.AI_MOTORING_CREATOR_USERNAME || "qwerty_motoring").trim().toLowerCase()
      : String(process.env.AI_NEWS_CREATOR_USERNAME || "worldnews").trim().toLowerCase();
  if (creatorUsername) {
    const byUsername = await User.findOne({ username: creatorUsername }).select("_id").lean();
    if (byUsername?._id) return byUsername._id as mongoose.Types.ObjectId;
    throw new AppError(
      `${
        category === "sports"
          ? "AI_SPORTS_CREATOR_USERNAME"
          : category === "entertainment"
          ? "AI_ENTERTAINMENT_CREATOR_USERNAME"
          : category === "motoring"
          ? "AI_MOTORING_CREATOR_USERNAME"
          : "AI_NEWS_CREATOR_USERNAME"
      } is set to "${creatorUsername}" but no matching user was found`,
      500
    );
  }
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (adminEmail) {
    const admin = await User.findOne({ email: adminEmail }).select("_id").lean();
    if (admin?._id) return admin._id as mongoose.Types.ObjectId;
  }
  const fallbackAdmin = await User.findOne({ role: { $in: ["superadmin", "admin"] } }).select("_id").lean();
  if (fallbackAdmin?._id) return fallbackAdmin._id as mongoose.Types.ObjectId;
  throw new AppError("No admin/superadmin account found for AI news publishing", 500);
}

async function aiNewsTitleExistsToday(
  title: string,
  category: AiNewsCategory = "tech"
): Promise<boolean> {
  if (!title.trim()) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const count = await TVPost.countDocuments({
    isAiNews: true,
    newsCategory: category,
    heading: { $regex: `^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    createdAt: { $gte: start, $lt: end },
  });
  return count > 0;
}

function tokenizeHeadline(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union > 0 ? inter / union : 0;
}

async function aiNewsTitleTooSimilarToday(
  title: string,
  category: AiNewsCategory = "tech"
): Promise<boolean> {
  const tokens = tokenizeHeadline(title);
  if (!tokens.length) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows = await TVPost.find({
    isAiNews: true,
    newsCategory: category,
    heading: { $exists: true, $ne: "" },
    createdAt: { $gte: start, $lt: end },
  })
    .select("heading")
    .lean();
  for (const r of rows as Array<{ heading?: string }>) {
    const s = jaccard(tokens, tokenizeHeadline(String(r.heading || "")));
    if (s >= 0.8) return true;
  }
  return false;
}

export async function aiNewsTopicExistsToday(
  topic: string,
  category: AiNewsCategory = "tech"
): Promise<boolean> {
  const normalized = topic.trim().toLowerCase();
  if (!normalized) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows = await TVPost.find({
    isAiNews: true,
    newsCategory: category,
    createdAt: { $gte: start, $lt: end },
  })
    .select("newsTopic")
    .lean();
  return rows.some((r) => String((r as { newsTopic?: string }).newsTopic || "").trim().toLowerCase() === normalized);
}

export async function generateAndPublishAiNewsPost(opts?: {
  category?: AiNewsCategory;
  topic?: string;
}): Promise<{ postId: string; topic: string; title: string }> {
  const category: AiNewsCategory = opts?.category || "tech";

  const requestedTopic = opts?.topic?.trim();
  let topic = requestedTopic || pickTopicForDate(new Date(), category);
  if (await aiNewsTopicExistsToday(topic, category)) {
    throw new AppError("An AI news post for this topic already exists today. Use a different topic.", 409);
  }
  const liveItem = await pickLiveNewsItem(requestedTopic, category);
  if (liveItem) {
    topic = `${liveItem.source}: ${liveItem.title}`.slice(0, 180);
    if (await aiNewsTopicExistsToday(topic, category)) {
      throw new AppError("A grounded AI news post for this source item already exists today.", 409);
    }
  }
  let generated: GeneratedNews;
  try {
    generated = liveItem
      ? await callOpenAiForGroundedNews(liveItem)
      : await callOpenAiForNews(topic, category);
    if (await aiNewsTitleExistsToday(generated.title, category)) {
      generated = liveItem
        ? await callOpenAiForGroundedNews({ ...liveItem, title: `${liveItem.title} (new angle)` })
        : await callOpenAiForNews(`${topic} (new angle, avoid previous headline wording)`, category);
    }
    if (await aiNewsTitleTooSimilarToday(generated.title, category)) {
      generated = liveItem
        ? await callOpenAiForGroundedNews({ ...liveItem, title: `${liveItem.title} (distinct headline wording)` })
        : await callOpenAiForNews(`${topic} (distinct headline, different wording and focus)`, category);
    }
  } catch (err) {
    if (liveItem && err instanceof AppError && (err.statusCode === 429 || err.statusCode === 503)) {
      throw new AppError(
        "Skipped AI news: full summary unavailable (OpenAI busy). Will retry later instead of posting a truncated headline.",
        409
      );
    }
    throw err;
  }
  if (
    !isCompleteAiNewsContent({
      heading: generated.title,
      subject: generated.summary,
      caption: generated.caption,
    })
  ) {
    throw new AppError("Skipped AI news: generated story looks incomplete or truncated", 409);
  }
  if (category === "sports" && isLowValueSportsHeadline(generated.title)) {
    throw new AppError("Skipped low-value sports headline (puzzles/quizzes are not posted)", 409);
  }
  const creatorId = await resolveNewsCreatorId(category);
  const media =
    category === "sports"
      ? await resolveSportsAiNewsPostMedia({
          title: generated.title,
          url: liveItem?.url,
          imageUrl: liveItem?.imageUrl,
        })
      : liveItem
      ? await resolveAiNewsPostMedia({ url: liveItem.url, imageUrl: liveItem.imageUrl })
      : { type: "text" as const, mediaUrls: [] as string[] };

  const post = await TVPost.create({
    creatorId,
    type: media.type,
    mediaUrls: media.mediaUrls,
    heading: generated.title,
    subject: generated.summary,
    caption: generated.caption,
    hashtags: generated.hashtags,
    genre: "news",
    hasWatermark: true,
    status: "approved",
    isAiNews: true,
    newsCategory: category,
    newsTopic: topic,
    newsPromptVersion: "v1",
  });

  return { postId: String(post._id), topic, title: generated.title };
}

export async function generateAiNewsBatchForToday(opts?: {
  min?: number;
  max?: number;
}): Promise<Array<{ postId: string; topic: string; title: string }>> {
  const min = Math.max(1, Math.min(3, Number(opts?.min ?? 1)));
  const max = Math.max(min, Math.min(3, Number(opts?.max ?? min)));
  const target = Math.floor(Math.random() * (max - min + 1)) + min;
  const results: Array<{ postId: string; topic: string; title: string }> = [];
  const daySeed = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const used = new Set<string>();

  for (let i = 0; i < target; i += 1) {
    let topic = TECH_TOPICS[(daySeed + i) % TECH_TOPICS.length];
    let attempts = 0;
    while (
      (used.has(topic) || (await aiNewsTopicExistsToday(topic, "tech"))) &&
      attempts < TECH_TOPICS.length + 2
    ) {
      topic = TECH_TOPICS[(daySeed + i + attempts + 1) % TECH_TOPICS.length];
      attempts += 1;
    }
    if (used.has(topic) || (await aiNewsTopicExistsToday(topic, "tech"))) {
      continue;
    }
    used.add(topic);
    const generated = await generateAndPublishAiNewsPost({ category: "tech", topic });
    results.push(generated);
  }

  return results;
}

/** Hide incomplete @worldnews autoposts already in the database (RSS fallback era). */
export async function rejectIncompleteAiNewsPosts(): Promise<number> {
  const rows = await TVPost.find({ isAiNews: true, status: "approved" })
    .select("_id heading subject caption isAiNews")
    .lean();
  let rejected = 0;
  for (const row of rows) {
    if (!isIncompleteAiNewsPost(row as { isAiNews?: boolean; heading?: string; subject?: string; caption?: string })) {
      continue;
    }
    await TVPost.updateOne({ _id: (row as { _id: unknown })._id }, { $set: { status: "rejected" } });
    rejected += 1;
  }
  return rejected;
}

export async function getAiNewsStats(): Promise<{
  todayCount: number;
  last7DaysCount: number;
  recent: Array<{ id: string; title: string; topic: string; createdAt: string }>;
}> {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const start7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [todayCount, last7DaysCount, recentRows] = await Promise.all([
    TVPost.countDocuments({ isAiNews: true, createdAt: { $gte: startToday } }),
    TVPost.countDocuments({ isAiNews: true, createdAt: { $gte: start7d } }),
    TVPost.find({ isAiNews: true })
      .select("heading newsTopic createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);
  return {
    todayCount,
    last7DaysCount,
    recent: (recentRows as Array<{ _id: unknown; heading?: string; newsTopic?: string; createdAt?: Date }>).map((r) => ({
      id: String(r._id),
      title: String(r.heading || ""),
      topic: String(r.newsTopic || ""),
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    })),
  };
}

