import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { siteAssetUrl } from "../constants/site";
import { socialChrome } from "../theme/socialTheme";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

type SiteNavIconProps = {
  path: string;
  size?: number;
  /** Used when the remote image fails to load (offline, 404, TLS). */
  fallback: IonName;
  tint?: string;
  active?: boolean;
};

export function SiteNavIcon({ path, size = 22, fallback, tint, active }: SiteNavIconProps) {
  const [failed, setFailed] = useState(false);
  const color = tint ?? (active ? socialChrome.navActiveBrand : socialChrome.navInactive);

  if (failed) {
    return <Ionicons name={fallback} size={size} color={color} />;
  }

  return (
    <View style={[styles.wrap, { width: size + 8, height: size + 8 }]}>
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: siteAssetUrl(path) }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center"
  }
});
