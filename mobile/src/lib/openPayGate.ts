import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

/**
 * Open PayGate (or any payment URL) in an in-app browser tab so the user
 * returns to the app instead of being dumped on the website.
 */
export async function openPayGateInApp(url: string): Promise<void> {
  const href = String(url || "").trim();
  if (!href) return;
  try {
    await WebBrowser.openBrowserAsync(href, {
      enableDefaultShareMenuItem: false,
      showInRecents: true
    });
  } catch {
    await Linking.openURL(href);
  }
}
