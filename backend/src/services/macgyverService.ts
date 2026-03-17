/**
 * MacGyver service - website search first, then AI
 * 1. Always search the website first (users, products, TV, music)
 * 2. If website has results → return search (user sees results, no process revealed)
 * 3. If no website results → knowledge base (Qwertymates FAQs)
 * 4. If still no answer → OpenAI (seamlessly, user just sees the answer)
 */

import { findQwertymatesAnswer } from "../data/macgyverKnowledge";
import { askMacGyver, isMacGyverConfigured } from "./macgyverLLM";
import { searchPlatformForContext, searchPlatformHasResults } from "./macgyverSearch";

export type MacGyverResult =
  | { text: string; error?: string }
  | { type: "search"; query: string };

export async function handleAskMacGyver(query: string): Promise<MacGyverResult> {
  const trimmed = (query || "").trim();
  if (!trimmed) {
    return { text: "What would you like to know? Ask me anything – about Qwertymates or the world." };
  }

  // 1. Always search the website first
  const hasPlatformResults = await searchPlatformHasResults(trimmed);
  if (hasPlatformResults) {
    return { type: "search", query: trimmed };
  }

  // 2. No website results → try knowledge base (Qwertymates FAQs)
  const qwertymatesAnswer = findQwertymatesAnswer(trimmed);
  if (qwertymatesAnswer) {
    return { text: qwertymatesAnswer };
  }

  // 3. No knowledge base match → OpenAI (if configured)
  if (!isMacGyverConfigured()) {
    return {
      text: "I can help with Qwertymates questions. Try: how to pay, how to register a store, how to post.",
      error: "NOT_CONFIGURED",
    };
  }

  try {
    const platformContext = await searchPlatformForContext(trimmed);
    const response = await askMacGyver(trimmed, platformContext);
    return { text: response };
  } catch (err: any) {
    const rawMessage = err.response?.data?.error?.message || err.message || "";
    const errorCode = err.response?.data?.error?.code || "";

    // Quota / billing exceeded – friendly message
    if (
      errorCode === "insufficient_quota" ||
      rawMessage.toLowerCase().includes("quota") ||
      rawMessage.toLowerCase().includes("billing")
    ) {
      return {
        text: "Try again in a moment.",
        error: "QUOTA_EXCEEDED",
      };
    }

    return {
      text: "Try again in a moment.",
      error: "LLM_ERROR",
    };
  }
}
