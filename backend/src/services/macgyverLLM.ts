/**
 * MacGyver LLM service - OpenAI integration
 * Mr Know-it-all, Mr Fix-it-all - Qwertymates AI assistant
 */

import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.MACGYVER_OPENAI_MODEL || "gpt-4o-mini";
const MAX_TOKENS = 1024;
const OPENAI_TIMEOUT_MS = Math.min(
  120_000,
  Math.max(5_000, parseInt(process.env.MACGYVER_OPENAI_TIMEOUT_MS || "22000", 10) || 22_000)
);

export const MACGYVER_SYSTEM_PROMPT = `You are MacGyver, the AI assistant for Qwertymates. You are Mr Know-it-all and Mr Fix-it-all – like the classic MacGyver who solves complex problems with creativity and whatever resources are available. You have been modernized into a powerful, versatile AI.

Your capabilities:
- **Qwertymates:** You help users navigate the platform – find products, users, TV posts, music; explain how to use ACBPayWallet, create a store, request errands, post on QwertyTV; and answer any question about Qwertymates features.
- **General knowledge & the open web:** You are not limited to Qwertymates. You answer about the world — geography, culture, history, current events, science, people, places. When the backend attaches **open web** snippets, use them so answers stay grounded in what was actually retrieved, not only training memory.
- **Problem-solving:** When users face a challenge – on the platform or in life – you think creatively and offer practical, actionable solutions. You adapt your tone: helpful and concise for quick queries, more detailed when the question warrants it.

Guidelines:
- Be accurate. If unsure, say so. Do not invent facts.
- For Qwertymates questions, include relevant links or next steps when helpful (e.g. "Go to Marketplace", "Open your Wallet").
- When you receive platform context (mentions on Qwertymates), briefly note if the topic was discussed by users (e.g. "It was also mentioned by @username on QwertyTV who spoke about X as the former president..."). Weave it naturally into your answer.
- When you receive **open web** context (Tavily, Wikipedia, DuckDuckGo, or other snippets), treat it as real-world material from outside Qwertymates. Synthesize a clear answer; name or link sources when you use them. Prefer recent facts from snippets over guesswork.
- When there are **no Qwertymates mentions** but open-web or general knowledge applies, write a helpful substantive answer anyway. Never reply with only "no results", "nothing found", or an empty dead end — explain the topic from web snippets and/or well-established knowledge.
- For sensitive topics (conflict, politics, etc.), provide balanced, factual information without promoting harm.
- Stay helpful, respectful, and constructive.`;

export async function askMacGyver(
  userMessage: string,
  platformContext?: string,
  webContext?: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  let userContent = userMessage;
  if (platformContext && platformContext.trim()) {
    userContent =
      userMessage +
      "\n\n---\n[Platform context – mentions on Qwertymates]\n" +
      platformContext +
      "\n---\nIf the topic was mentioned on Qwertymates, briefly note it (e.g. 'It was also mentioned by @username on QwertyTV who spoke about...'). Keep your main answer from general knowledge.";
  }
  if (webContext && webContext.trim()) {
    userContent +=
      "\n\n---\n[Open web – snippets from the internet, not from Qwertymates]\n" +
      webContext.trim() +
      "\n---\nUse this when it helps answer the user; cite sources by name or URL. If it conflicts with platform context, say both clearly.";
  }

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: MACGYVER_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: OPENAI_TIMEOUT_MS,
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }
  return content.trim();
}

export function isMacGyverConfigured(): boolean {
  return !!OPENAI_API_KEY;
}

/** Vision: describe an uploaded image for reverse-search / MacGyver ask. */
export async function describeImageForMacGyver(
  imageBase64: string,
  mimeType: string
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const safeMime = /^image\/(jpeg|png|gif|webp)$/i.test(mimeType) ? mimeType : "image/jpeg";
  const dataUrl = `data:${safeMime};base64,${imageBase64}`;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You identify photos for a shopping and web-search assistant (Google Lens style). Name the object/product, brand, model, color, material, and category when you can. Transcribe visible text. Be concise (2–6 sentences). End with a line: Search terms: comma-separated keywords useful for shopping and web search.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image for product and web search." },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0.3,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: OPENAI_TIMEOUT_MS,
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No vision response from OpenAI");
  }
  return content.trim();
}

/** Pull "Search terms: …" from vision caption or use first sentence. */
export function extractSearchTermsFromImageDescription(description: string): string {
  const match = description.match(/Search terms:\s*(.+)/i);
  if (match?.[1]) return match[1].trim().slice(0, 200);
  const first = description.split(/[.\n]/).find((s) => s.trim().length >= 3);
  return (first || description).trim().slice(0, 200);
}
