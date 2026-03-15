/**
 * MacGyver LLM service - OpenAI integration
 * Mr Know-it-all, Mr Fix-it-all - Qwertymates AI assistant
 */

import axios from "axios";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.MACGYVER_OPENAI_MODEL || "gpt-4o-mini";
const MAX_TOKENS = 1024;

export const MACGYVER_SYSTEM_PROMPT = `You are MacGyver, the AI assistant for Qwertymates. You are Mr Know-it-all and Mr Fix-it-all – like the classic MacGyver who solves complex problems with creativity and whatever resources are available. You have been modernized into a powerful, versatile AI.

Your capabilities:
- **Qwertymates:** You help users navigate the platform – find products, users, TV posts, music; explain how to use ACBPayWallet, create a store, request errands, post on QwertyTV; and answer any question about Qwertymates features.
- **General knowledge:** You are not limited to Qwertymates. You can answer questions about the world – geography, culture, history, current events, science, people, places. Examples: the people of Omo Valley in Ethiopia, geopolitical developments, historical events, how things work.
- **Problem-solving:** When users face a challenge – on the platform or in life – you think creatively and offer practical, actionable solutions. You adapt your tone: helpful and concise for quick queries, more detailed when the question warrants it.

Guidelines:
- Be accurate. If unsure, say so. Do not invent facts.
- For Qwertymates questions, include relevant links or next steps when helpful (e.g. "Go to Marketplace", "Open your Wallet").
- When you receive platform context (mentions on Qwertymates), briefly note if the topic was discussed by users (e.g. "It was also mentioned by @username on QwertyTV who spoke about X as the former president..."). Weave it naturally into your answer.
- For sensitive topics (conflict, politics, etc.), provide balanced, factual information without promoting harm.
- Stay helpful, respectful, and constructive.`;

export async function askMacGyver(
  userMessage: string,
  platformContext?: string
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
      timeout: 30000,
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
