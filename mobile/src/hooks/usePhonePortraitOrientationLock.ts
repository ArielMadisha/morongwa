import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect } from "react";
import { Platform, useWindowDimensions } from "react-native";

/**
 * Manifest uses `orientation: "default"` (Play / Android 16 large screens).
 * On compact width (~phones), lock portrait at runtime; on tablets / large
 * foldables (shortest side ≥ 600), allow all orientations.
 */
const COMPACT_MAX_SHORTEST_SIDE = 600;

export function usePhonePortraitOrientationLock() {
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (Platform.OS === "web") return;

    const shortest = Math.min(width, height);
    const isCompact = shortest < COMPACT_MAX_SHORTEST_SIDE;

    const apply = async () => {
      try {
        if (isCompact) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } else {
          await ScreenOrientation.unlockAsync();
        }
      } catch {
        /* ignore: unsupported host, Expo Go edge cases */
      }
    };

    void apply();

    return () => {
      void ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [width, height]);
}
