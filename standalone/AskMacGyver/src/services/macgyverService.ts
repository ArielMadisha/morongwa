/**
 * MacGyver service - website search first, then AI
 * 1. Knowledge base (Qwertymates FAQs) — no DB, fast path for common questions
 * 2. Platform search (users, products, TV, music) — single DB round-trip
 * 3. If website has results → return search (user sees results)
 * 4. If still no answer → OpenAI (seamlessly, user just sees the answer)
 */

import { findQwertymatesAnswer } from "../data/macgyverKnowledge";
import { askMacGyver, isMacGyverConfigured } from "./macgyverLLM";
import { searchPlatformMacGyverBundle } from "./macgyverSearch";

export type MacGyverResult =
  | { text: string; error?: string }
  | { type: "search"; query: string };

export async function handleAskMacGyver(query: string): Promise<MacGyverResult> {
  const trimmed = (query || "").trim();
  if (!trimmed) {
    return { text: "What would you like to know? Ask me anything – about Qwertymates or the world." };
  }

  const qwertymatesAnswer = findQwertymatesAnswer(trimmed);
  if (qwertymatesAnswer) {
    return { text: qwertymatesAnswer };
  }

  const { hasResults, contextForLlm } = await searchPlatformMacGyverBundle(trimmed);
  if (hasResults) {
    return { type: "search", query: trimmed };
  }

  if (!isMacGyverConfigured()) {
    return {
      text: "I can help with Qwertymates questions. Try: how to pay, how to register a store, how to post.",
      error: "NOT_CONFIGURED",
    };
  }

  try {
    const response = await askMacGyver(trimmed, contextForLlm);
    return { text: response };
  } catch (err: any) {
    const rawMessage = err.response?.data?.error?.message || err.message || "";
    const errorCode = err.response?.data?.error?.code || "";

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
