import Constants from "expo-constants";
import { Platform } from "react-native";

type ExtraConfig = {
  apiUrl?: string;
  socketUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

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

const webApiUrl = "http://localhost:4000/api";
const webSocketUrl = "http://localhost:4000";

export const MOBILE_API_URL =
  Platform.OS === "web"
    ? webApiUrl
    : inferredApiUrl ?? extra.apiUrl ?? "http://10.0.2.2:4000/api";

export const MOBILE_SOCKET_URL =
  Platform.OS === "web"
    ? webSocketUrl
    : inferredSocketUrl ?? extra.socketUrl ?? "http://10.0.2.2:4000";
