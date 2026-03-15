/**
 * MacGyver service - orchestrates Ask MacGyver requests
 * 1. Try Qwertymates knowledge base first (no API cost)
 * 2. For general questions (e.g. "George Bush"): search platform for mentions, then OpenAI
 * 3. OpenAI gets platform context so it can say "It was also mentioned by @user on QwertyTV..."
 */

import { findQwertymatesAnswer } from "../data/macgyverKnowledge";
import { askMacGyver, isMacGyverConfigured } from "./macgyverLLM";
import { searchPlatformForContext } from "./macgyverSearch";

export async function handleAskMacGyver(query: string): Promise<{ text: string; error?: string }> {
  const trimmed = (query || "").trim();
  if (!trimmed) {
    return { text: "What would you like to know? Ask me anything – about Qwertymates or the world." };
  }

  // 1. Try Qwertymates knowledge base first (payment, store, errands, etc.)
  const qwertymatesAnswer = findQwertymatesAnswer(trimmed);
  if (qwertymatesAnswer) {
    return { text: qwertymatesAnswer };
  }

  // 2. Not a Qwertymates question – use OpenAI (if configured)
  if (!isMacGyverConfigured()) {
    return {
      text: "I can answer Qwertymates questions (try: how to pay, how to register a store, how to post). For other questions, add OPENAI_API_KEY to enable MacGyver.",
      error: "NOT_CONFIGURED",
    };
  }

  try {
    // Search platform for mentions (e.g. "George Bush" → posts/users who mentioned it)
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
        text: "Try MacGyver later or use the search bar to find products, users, and content on Qwertymates.",
        error: "QUOTA_EXCEEDED",
      };
    }

    return {
      text: `Sorry, I couldn't process that. ${rawMessage || "Something went wrong."}`,
      error: "LLM_ERROR",
    };
  }
}
