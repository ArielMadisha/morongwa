import Constants from "expo-constants";
import { Platform } from "react-native";

type ExtraConfig = {
  apiUrl?: string;
  socketUrl?: string;
  turnUrls?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

/** Set at build time via EAS / .env (Expo inlines EXPO_PUBLIC_*). */
function envApiUrl(): string | undefined {
  const raw =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL
      ? String(process.env.EXPO_PUBLIC_API_URL).trim()
      : "";
  return raw || undefined;
}

function envSocketUrl(): string | undefined {
  const raw =
    typeof process !== "undefined" && process.env?.EXPO_PUBLIC_SOCKET_URL
      ? String(process.env.EXPO_PUBLIC_SOCKET_URL).trim()
      : "";
  return raw || undefined;
}

function normalizeProdApiUrl(url?: string): string | undefined {
  const raw = String(url || "").trim();
  if (!raw) return undefined;
  // Legacy/wrong host used apex; backend API is served on api.qwertymates.com.
  if (/^https?:\/\/(www\.)?qwertymates\.com\/api\/?$/i.test(raw)) {
    return "https://api.qwertymates.com/api";
  }
  return raw;
}

function normalizeProdSocketUrl(url?: string): string | undefined {
  const raw = String(url || "").trim();
  if (!raw) return undefined;
  if (/^https?:\/\/(www\.)?qwertymates\.com\/?$/i.test(raw)) {
    return "https://api.qwertymates.com";
  }
  return raw;
}

function inferExpoLanHost(): string | null {
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.expoGoConfig?.hostUri ||
    "";
  if (!hostUri || typeof hostUri !== "string") return null;
  const host = hostUri.split(":")[0]?.trim();
  return host || null;
}

const inferredHost = inferExpoLanHost();
const inferredApiUrl = inferredHost ? `http://${inferredHost}:4000/api` : undefined;
const inferredSocketUrl = inferredHost ? `http://${inferredHost}:4000` : undefined;

const normalizedExtraApiUrl = normalizeProdApiUrl(extra.apiUrl);
const normalizedExtraSocketUrl = normalizeProdSocketUrl(extra.socketUrl);

const resolvedApiUrl = envApiUrl() || normalizedExtraApiUrl;
const resolvedSocketUrl = envSocketUrl() || normalizedExtraSocketUrl;

const webApiUrl = resolvedApiUrl || "http://localhost:4000/api";
const webSocketUrl = resolvedSocketUrl || "http://localhost:4000";

export const MOBILE_API_URL =
  Platform.OS === "web"
    ? webApiUrl
    : resolvedApiUrl ?? inferredApiUrl ?? "http://10.0.2.2:4000/api";

export const MOBILE_SOCKET_URL =
  Platform.OS === "web"
    ? webSocketUrl
    : resolvedSocketUrl ?? inferredSocketUrl ?? "http://10.0.2.2:4000";

const defaultTurnUrls =
  "turn:165.227.237.142:3478?transport=udp,turns:165.227.237.142:5349?transport=tcp";

export const MOBILE_TURN_URLS = (extra.turnUrls || defaultTurnUrls)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
