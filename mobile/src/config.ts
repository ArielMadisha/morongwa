import Constants from "expo-constants";

type ExtraConfig = {
  apiUrl?: string;
  socketUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

export const MOBILE_API_URL =
  extra.apiUrl ?? "http://10.0.2.2:5001/api";

export const MOBILE_SOCKET_URL =
  extra.socketUrl ?? "http://10.0.2.2:5001";
