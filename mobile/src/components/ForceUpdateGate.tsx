import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import Constants from "expo-constants";
import { api } from "../lib/api";
import { socialTheme, appTypography } from "../theme/socialTheme";

type MobileUpdatePolicy = {
  minVersion?: string;
  minVersionCode?: number;
  minBuildNumber?: number;
  storeUrl?: string;
  forceUpdate?: boolean;
  message?: string;
};

function parseVersionParts(v: string): number[] {
  return String(v || "")
    .trim()
    .split(/[.+-]/)
    .map((p) => Number.parseInt(p.replace(/\D/g, ""), 10) || 0);
}

/** Return true if `current` is strictly older than `minimum`. */
export function isVersionOlder(current: string, minimum: string): boolean {
  const a = parseVersionParts(current);
  const b = parseVersionParts(minimum);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

function readInstalledVersion(): { version: string; buildNumber: number } {
  const version = String(Constants.expoConfig?.version || "0.0.0");
  const nativeBuild = Number((Constants as { nativeBuildVersion?: string }).nativeBuildVersion || 0);
  const androidCode = Number(
    (Constants.expoConfig as { android?: { versionCode?: number } } | null)?.android?.versionCode || 0
  );
  const iosBuild = Number(
    (Constants.expoConfig as { ios?: { buildNumber?: string } } | null)?.ios?.buildNumber || 0
  );
  const buildNumber =
    Platform.OS === "ios"
      ? nativeBuild || iosBuild || 0
      : nativeBuild || androidCode || 0;
  return { version, buildNumber: Number.isFinite(buildNumber) ? buildNumber : 0 };
}

const PLAY_URL = "https://play.google.com/store/apps/details?id=com.qwertymates";
const MARKET_URL = "market://details?id=com.qwertymates";
const APP_STORE_URL = "https://apps.apple.com/app/id6798004708";

/**
 * Blocks the app until the installed build meets the server minimum.
 * Android: Google Play policy. iOS: App Store policy (force off until listing ships).
 */
export function ForceUpdateGate({ children }: { children: React.ReactNode }) {
  const isNativeStore = Platform.OS === "android" || Platform.OS === "ios";
  const [checking, setChecking] = useState(isNativeStore);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState(
    Platform.OS === "ios"
      ? "A required update is available. Please update Qwertymates from the App Store to continue."
      : "A required update is available. Please update Qwertymates from Google Play to continue."
  );
  const [storeUrl, setStoreUrl] = useState(Platform.OS === "ios" ? APP_STORE_URL : PLAY_URL);

  const evaluate = useCallback(async () => {
    if (!isNativeStore) {
      setChecking(false);
      setBlocked(false);
      return;
    }
    setChecking(true);
    try {
      const path =
        Platform.OS === "ios" ? "/mobile/ios-update-policy" : "/mobile/android-update-policy";
      const res = await api.get<{ data: MobileUpdatePolicy }>(path, {
        timeout: 12_000
      });
      const policy = res.data?.data || {};
      const { version, buildNumber } = readInstalledVersion();
      const minVersion = String(
        policy.minVersion || (Platform.OS === "ios" ? "1.3.23" : "1.3.23")
      );
      const minBuild =
        Platform.OS === "ios"
          ? Number(policy.minBuildNumber || 1)
          : Number(policy.minVersionCode || 75);
      const olderByName = isVersionOlder(version, minVersion);
      const olderByBuild =
        Number.isFinite(minBuild) && minBuild > 0 && buildNumber > 0 && buildNumber < minBuild;
      const mustUpdate = policy.forceUpdate === true && (olderByName || olderByBuild);
      if (policy.message) setMessage(policy.message);
      if (policy.storeUrl) setStoreUrl(String(policy.storeUrl));
      setBlocked(mustUpdate);
    } catch {
      // Fail open if policy endpoint unreachable — do not brick the app offline.
      setBlocked(false);
    } finally {
      setChecking(false);
    }
  }, [isNativeStore]);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  const openStore = async () => {
    if (Platform.OS === "android") {
      try {
        const canMarket = await Linking.canOpenURL(MARKET_URL);
        await Linking.openURL(canMarket ? MARKET_URL : storeUrl || PLAY_URL);
      } catch {
        await Linking.openURL(storeUrl || PLAY_URL).catch(() => undefined);
      }
      return;
    }
    await Linking.openURL(storeUrl || APP_STORE_URL).catch(() => undefined);
  };

  if (!isNativeStore) return <>{children}</>;

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={socialTheme.brandBlue} />
        <Text style={styles.hint}>Checking for required updates…</Text>
      </View>
    );
  }

  if (!blocked) return <>{children}</>;

  const installed = readInstalledVersion();
  const storeLabel = Platform.OS === "ios" ? "Update on the App Store" : "Update on Google Play";
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Update required</Text>
      <Text style={styles.body}>{message}</Text>
      <Text style={styles.meta}>
        Installed {installed.version}
        {installed.buildNumber ? ` (${installed.buildNumber})` : ""}
      </Text>
      <Pressable style={styles.btn} onPress={() => void openStore()} accessibilityRole="button">
        <Text style={styles.btnText}>{storeLabel}</Text>
      </Pressable>
      <Pressable style={styles.linkBtn} onPress={() => void evaluate()} accessibilityRole="button">
        <Text style={styles.linkText}>I updated — check again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 12,
    backgroundColor: socialTheme.canvas
  },
  hint: {
    ...appTypography.meta,
    color: socialTheme.textSecondary
  },
  title: {
    ...appTypography.titleSm,
    fontSize: 22,
    color: socialTheme.textPrimary,
    textAlign: "center"
  },
  body: {
    ...appTypography.meta,
    color: socialTheme.textSecondary,
    textAlign: "center",
    lineHeight: 20
  },
  meta: {
    ...appTypography.badge,
    color: socialTheme.textMuted
  },
  btn: {
    marginTop: 8,
    backgroundColor: socialTheme.brandBlue,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 220,
    alignItems: "center"
  },
  btnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16
  },
  linkBtn: {
    paddingVertical: 10
  },
  linkText: {
    ...appTypography.meta,
    color: socialTheme.brandBlueDark,
    fontWeight: "600"
  }
});
