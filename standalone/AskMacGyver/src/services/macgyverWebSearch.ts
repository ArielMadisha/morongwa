/**
 * Open-web context for Ask MacGyver when Qwertymates search has no hits.
 * Priority: Tavily (optional API key) → Wikipedia → DuckDuckGo instant answer.
 */

import axios from "axios";
import type { MacGyverWebSource } from "../data/models/MacGyverLearnedEntry";

const HTTP_UA = {
  headers: {
    "User-Agent": "Qwertymates-MacGyver/1.0 (https://qwertymates.com; platform assistant)",
    Accept: "application/json",
  },
  timeout: 14_000,
};

export type MacGyverWebBundle = {
  /** Text block appended for the LLM or web-only fallback */
  contextBlock: string;
  sources: MacGyverWebSource[];
};

function clip(s: string, max: number): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Strip chatter so Wikipedia / DDG match the real topic (not "explain … in two sentences"). */
function extractSearchTopic(q: string): string {
  let t = (q || "").trim();
  t = t.replace(
    /^(please\s+)?(can you\s+|could you\s+)?(explain|describe|define|summarize|summarise|tell me about|what is|what are|who is|who was|who were|where is|when was|how does|how do|how did)\s+/i,
    ""
  );
  t = t.replace(/\bin\s+(one|two|three|\d+)\s+(short\s+)?sentences?\b/gi, "");
  t = t.replace(/[?!.]+$/g, "").trim();
  return t.length >= 2 ? t : (q || "").trim();
}

function looksLikeQuestion(q: string): boolean {
  const t = (q || "").trim();
  if (t.includes("?")) return true;
  return /^(who|what|where|when|why|how|explain|define|tell me)\b/i.test(t);
}

async function searchTavily(q: string): Promise<MacGyverWebBundle | null> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return null;
  try {
    const res = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key: key,
        query: q,
        search_depth: "basic",
        max_results: 6,
        include_answer: false,
      },
      HTTP_UA
    );
    const results = res.data?.results;
    if (!Array.isArray(results) || results.length === 0) return null;

    const sources: MacGyverWebSource[] = results
      .map((r: any) => ({
        title: String(r.title || "Result").slice(0, 300),
        url: String(r.url || "").slice(0, 2000),
        snippet: r.content ? clip(String(r.content), 600) : undefined,
      }))
      .filter((s: MacGyverWebSource) => s.url.startsWith("http"));

    if (sources.length === 0) return null;

    const lines = sources.map(
      (s, i) =>
        `[${i + 1}] ${s.title}\nURL: ${s.url}${s.snippet ? `\nSnippet: ${s.snippet}` : ""}`
    );
    return {
      contextBlock: "Open web (Tavily search results — verify facts; cite by title/URL when you answer):\n" + lines.join("\n\n"),
      sources,
    };
  } catch {
    return null;
  }
}

async function searchWikipedia(q: string): Promise<MacGyverWebBundle | null> {
  try {
    const searchUrl =
      "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=" +
      encodeURIComponent(q.slice(0, 300));
    const sres = await axios.get(searchUrl, HTTP_UA);
    const hits = sres.data?.query?.search;
    if (!Array.isArray(hits) || hits.length === 0) return null;

    const titles = hits.map((h: any) => h.title).filter(Boolean);
    if (titles.length === 0) return null;

    const exUrl =
      "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&titles=" +
      encodeURIComponent(titles.join("|"));
    const eres = await axios.get(exUrl, HTTP_UA);
    const pages = eres.data?.query?.pages;
    if (!pages || typeof pages !== "object") return null;

    const sources: MacGyverWebSource[] = [];
    const parts: string[] = [];

    for (const page of Object.values(pages) as any[]) {
      const title = page?.title as string | undefined;
      const extract = page?.extract as string | undefined;
      if (!title) continue;
      const slug = title.replace(/\s/g, "_");
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`;
      const snippet = extract ? clip(extract, 1200) : undefined;
      sources.push({ title: `Wikipedia: ${title}`, url, snippet });
      if (snippet) parts.push(`**${title}** (${url})\n${snippet}`);
    }

    if (parts.length === 0) return null;
    return {
      contextBlock: "Open web (Wikipedia — may be incomplete for breaking news):\n" + parts.join("\n\n---\n\n"),
      sources,
    };
  } catch {
    return null;
  }
}

async function searchDuckDuckGoInstant(q: string): Promise<MacGyverWebBundle | null> {
  try {
    const url = "https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=" + encodeURIComponent(q.slice(0, 400));
    const res = await axios.get(url, HTTP_UA);
    const d = res.data;
    const sources: MacGyverWebSource[] = [];
    const chunks: string[] = [];

    if (d.Abstract && (d.AbstractURL || d.Url)) {
      const u = String(d.AbstractURL || d.Url || "");
      const title = String(d.Heading || d.AbstractSource || "DuckDuckGo abstract");
      if (u.startsWith("http")) {
        sources.push({ title, url: u, snippet: clip(String(d.Abstract), 1500) });
        chunks.push(`${title}\n${u}\n${clip(String(d.Abstract), 1500)}`);
      }
    }

    const topics = Array.isArray(d.RelatedTopics) ? d.RelatedTopics : [];
    for (const t of topics.slice(0, 4)) {
      if (typeof t === "object" && t.Text && t.FirstURL) {
        const u = String(t.FirstURL);
        if (!u.startsWith("http")) continue;
        sources.push({
          title: clip(String(t.Text), 120),
          url: u,
          snippet: clip(String(t.Text), 400),
        });
        chunks.push(`${t.Text}\n${u}`);
      }
    }

    if (chunks.length === 0) return null;
    return {
      contextBlock: "Open web (DuckDuckGo instant answer / related topics):\n" + chunks.join("\n\n---\n\n"),
      sources,
    };
  } catch {
    return null;
  }
}

/**
 * Fetches real-world snippets for the LLM (or plain fallback when OpenAI is off).
 * Respects MACGYVER_WEB_SEARCH_DISABLED=1 to turn off outbound web calls.
 */
export async function fetchWebContextForMacGyver(query: string): Promise<MacGyverWebBundle> {
  const q = (query || "").trim();
  if (!q || process.env.MACGYVER_WEB_SEARCH_DISABLED === "1") {
    return { contextBlock: "", sources: [] };
  }

  const topic = extractSearchTopic(q);

  const queryVariants = [topic, q];
  if (topic.includes(" ") && !topic.includes("-")) {
    queryVariants.push(topic.replace(/\s+/g, "-"));
  }

  for (const variant of queryVariants) {
    if (!variant || variant.length < 2) continue;
    const tavily = await searchTavily(variant);
    if (tavily?.contextBlock) return tavily;
  }

  for (const variant of queryVariants) {
    if (!variant || variant.length < 2) continue;
    if (looksLikeQuestion(q)) {
      const ddgFirst = await searchDuckDuckGoInstant(variant);
      if (ddgFirst?.contextBlock) return ddgFirst;
      const wikiQ = await searchWikipedia(variant);
      if (wikiQ?.contextBlock) return wikiQ;
    } else {
      const wiki = await searchWikipedia(variant);
      if (wiki?.contextBlock) return wiki;
      const ddg = await searchDuckDuckGoInstant(variant);
      if (ddg?.contextBlock) return ddg;
    }
  }

  return { contextBlock: "", sources: [] };
}

/** Short plain answer when OpenAI is unavailable but web returned snippets. */
export function formatWebOnlyAnswer(query: string, bundle: MacGyverWebBundle): string {
  if (!bundle.sources.length) {
    return "";
  }
  const lines = bundle.sources.map((s, i) => {
    const sn = s.snippet ? `\n${s.snippet}` : "";
    return `${i + 1}. ${s.title}\n${s.url}${sn}`;
  });
  return (
    `Here is what we could gather from the open web for “${clip(query, 200)}” (sources below — verify on the linked pages):\n\n` +
    lines.join("\n\n")
  );
}
