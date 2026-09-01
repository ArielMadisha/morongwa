/**
 * MacGyver service - layered answers (owner flow)
 * 1. Platform search (users, products, TV, music, stores, schools) — Qwertymates first
 * 2. Static FAQ (Qwertymates how-tos) — only when step 1 has no browse hits
 * 3. Expandable learned library (Mongo)
 * 4. Open web (Tavily / Wikipedia / DuckDuckGo)
 * 5. OpenAI — writes an answer from platform + web context (never a dead "no results" page)
 */

import { findQwertymatesAnswer } from "../data/macgyverKnowledge";
import {
  askMacGyver,
  describeImageForMacGyver,
  extractSearchTermsFromImageDescription,
  isMacGyverConfigured,
} from "./macgyverLLM";
import { searchPlatformMacGyverBundle } from "./macgyverSearch";
import { formatMarketplaceStoreAnswer, searchPublicStores } from "./storeSearch";
import { findFreshLearnedAnswer, upsertMacGyverLearned } from "./macgyverLearned";
import { fetchWebContextForMacGyver, formatWebOnlyAnswer } from "./macgyverWebSearch";

export type MacGyverResult =
  | { text: string; error?: string; imageDescription?: string; searchQuery?: string }
  | { type: "search"; query: string; imageDescription?: string };

export type HandleAskMacGyverOptions = {
  /** Extra user context (e.g. vision caption) — used by the LLM only, not platform/web search. */
  extraContext?: string;
};

export async function handleAskMacGyver(
  query: string,
  options?: HandleAskMacGyverOptions
): Promise<MacGyverResult> {
  const trimmed = (query || "").trim();
  const extraContext = (options?.extraContext || "").trim();
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

  // Step 1 — search Qwertymates collections first (people, posts, products, stores, music).
  const { hasResults: platformHasHits, contextForLlm } = await searchPlatformMacGyverBundle(trimmed);

  const storeHits = await searchPublicStores(trimmed, 5);
  const storeAnswer = formatMarketplaceStoreAnswer(trimmed, storeHits);
  if (storeAnswer && !extraContext) {
    return { text: storeAnswer };
  }

  // Step 2 — platform how-to FAQ only when browse would be empty (general topics fall through to web + LLM).
  if (!platformHasHits && !extraContext) {
    const qwertymatesAnswer = findQwertymatesAnswer(trimmed);
    if (qwertymatesAnswer) {
      return { text: qwertymatesAnswer };
    }
  }

  if (!extraContext) {
    const learned = await findFreshLearnedAnswer(trimmed);
    if (learned) {
      return { text: learned };
    }
  }

  // Step 4 — open web when Qwertymates has no solution (always for image/vision context).
  const webBundle = trimmed.length >= 2 ? await fetchWebContextForMacGyver(trimmed) : { contextBlock: "", sources: [] };

  const llmQuery = extraContext
    ? `${trimmed}\n\n[Photo the user uploaded — identify it, find similar products or solutions, and explain.]\n${extraContext}`
    : trimmed;

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
    const response = await askMacGyver(llmQuery, contextForLlm, webBundle.contextBlock);
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

/** Image ask: vision caption → platform + web + MacGyver synthesis. */
export async function handleAskMacGyverFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  hint?: string
): Promise<MacGyverResult> {
  if (!imageBuffer?.length) {
    return { text: "Please choose an image to search.", error: "NO_IMAGE" };
  }

  const hintTrim = (hint || "").trim();

  if (!isMacGyverConfigured()) {
    return {
      text: "Image search needs OPENAI_API_KEY on the server (MacGyver uses vision to describe your photo, then searches Qwertymates and the web).",
      error: "NOT_CONFIGURED",
    };
  }

  let imageDescription: string;
  try {
    imageDescription = await describeImageForMacGyver(imageBuffer.toString("base64"), mimeType);
  } catch (err: any) {
    const msg = err.response?.data?.error?.message || err.message || "Vision failed";
    return { text: `Could not read that image. ${msg}`, error: "VISION_ERROR" };
  }

  const searchTerms = extractSearchTermsFromImageDescription(imageDescription);
  const askQuery = [hintTrim, searchTerms].filter(Boolean).join(" — ") || imageDescription.slice(0, 200);

  const result = await handleAskMacGyver(askQuery, {
    extraContext: `Visual description:\n${imageDescription}\n\nGive a Google-Lens-style answer: what the photo shows, similar items or products, where to look next, and a short explanation.`,
  });
  if ("type" in result && result.type === "search") {
    return { ...result, imageDescription, searchQuery: searchTerms };
  }
  const textBody = "text" in result ? result.text : undefined;
  return {
    text: textBody
      ? `From your image: ${imageDescription}\n\n---\n\n${textBody}`
      : textBody || "No response.",
    error: "error" in result ? result.error : undefined,
    imageDescription,
    searchQuery: searchTerms,
  };
}
