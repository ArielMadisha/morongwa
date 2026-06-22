import { Linking } from "react-native";
import { normalizeSiteUrl } from "./webRoutePolicy";

/**
 * Open a Qwertymates web URL in the **system browser** only (no in-app WebView / Custom Tabs).
 * Use for forgot-password, errands dashboards, wallet top-ups that return to the web, etc.
 */
export async function openWebUrl(rawUrlOrPath: string): Promise<void> {
  const url = normalizeSiteUrl(rawUrlOrPath);
  const can = await Linking.canOpenURL(url);
  if (!can) throw new Error("openWebUrl: cannot open URL");
  await Linking.openURL(url);
}
