/**
 * MacGyver service - layered answers
 * 1. Static FAQ (Qwertymates) — fast path
 * 2. Platform search (users, products, TV, music, stores) — if hits, return unified search UI
 * 3. Expandable learned library (Mongo) — past answers when the site still has no browse hits
 * 4. Open web (Tavily / Wikipedia / DuckDuckGo) — snippets from outside Qwertymates
 * 5. OpenAI — synthesizes from platform + web context; successful replies are saved to the library
 */

import { findQwertymatesAnswer } from "../data/macgyverKnowledge";
import { askMacGyver, isMacGyverConfigured } from "./macgyverLLM";
import { searchPlatformMacGyverBundle } from "./macgyverSearch";
import { formatMarketplaceStoreAnswer, searchPublicStores } from "./storeSearch";
import { findFreshLearnedAnswer, upsertMacGyverLearned } from "./macgyverLearned";
import { fetchWebContextForMacGyver, formatWebOnlyAnswer } from "./macgyverWebSearch";

export type MacGyverResult =
  | { text: string; error?: string }
  | { type: "search"; query: string };

export async function handleAskMacGyver(query: string): Promise<MacGyverResult> {
  const trimmed = (query || "").trim();
  if (!trimmed) {
    return { text: "What would you like to know? Ask me anything – about Qwertymates or the world." };
  }

  // Single-character queries match almost everything on the platform and used to
  // return type:"search", which closed the Ask modal onto an empty search page.
  if (trimmed.length < 2) {
    return {
      text: "Give me a bit more to work with — try a name, product, place, or a short question (at least 2 characters).",
    };
  }

  const qwertymatesAnswer = findQwertymatesAnswer(trimmed);
  if (qwertymatesAnswer) {
    return { text: qwertymatesAnswer };
  }

  // Platform hits feed LLM context (and the search UI already shows matches inline).
  // Do not redirect Ask MacGyver with type:"search" — that looked broken when browse
  // APIs returned nothing for thin substring matches.
  const { contextForLlm } = await searchPlatformMacGyverBundle(trimmed);

  const storeHits = await searchPublicStores(trimmed, 5);
  const storeAnswer = formatMarketplaceStoreAnswer(trimmed, storeHits);
  if (storeAnswer) {
    return { text: storeAnswer };
  }

  const learned = await findFreshLearnedAnswer(trimmed);
  if (learned) {
    return { text: learned };
  }

  const webBundle = trimmed.length >= 2 ? await fetchWebContextForMacGyver(trimmed) : { contextBlock: "", sources: [] };

  if (!isMacGyverConfigured()) {
    const webOnly = formatWebOnlyAnswer(trimmed, webBundle);
    if (webOnly) {
      await upsertMacGyverLearned({ query: trimmed, answer: webOnly, webSources: webBundle.sources });
      return { text: webOnly };
    }
    return {
      text: "I can help with Qwertymates questions. Try: how to pay, how to register a store, how to post. For broader topics, set OPENAI_API_KEY on the server (MacGyver uses it with open-web snippets when the marketplace has no matches).",
      error: "NOT_CONFIGURED",
    };
  }

  try {
    const response = await askMacGyver(trimmed, contextForLlm, webBundle.contextBlock);
    await upsertMacGyverLearned({
      query: trimmed,
      answer: response,
      webSources: webBundle.sources,
    });
    return { text: response };
  } catch (err: any) {
    const rawMessage = err.response?.data?.error?.message || err.message || "";
    const errorCode = err.response?.data?.error?.code || "";

    const webFallback = formatWebOnlyAnswer(trimmed, webBundle);
    if (webFallback) {
      await upsertMacGyverLearned({ query: trimmed, answer: webFallback, webSources: webBundle.sources });
    }

    if (
      errorCode === "insufficient_quota" ||
      rawMessage.toLowerCase().includes("quota") ||
      rawMessage.toLowerCase().includes("billing")
    ) {
      if (webFallback) {
        return {
          text:
            webFallback +
            "\n\n(MacGyver AI is temporarily on open-web mode — OpenAI quota needs a top-up for fuller answers.)",
          error: "QUOTA_EXCEEDED",
        };
      }
      return {
        text: "MacGyver AI is temporarily unavailable (OpenAI billing/quota). Try again after the API key is topped up, or ask a Qwertymates how-to (pay, store, post).",
        error: "QUOTA_EXCEEDED",
      };
    }

    if (webFallback) return { text: webFallback, error: "LLM_ERROR" };
    return { text: "Try again in a moment.", error: "LLM_ERROR" };
  }
}
