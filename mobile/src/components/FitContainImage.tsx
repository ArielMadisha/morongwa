/**
 * Feed media — full image visible by default (`contain`).
 * Use `cover` only when a cropped full-bleed frame is intentional (e.g. TV).
 */
import React, { useState } from "react";
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

type Props = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  maxHeight?: number;
  /** `contain` shows the whole photo (default); `cover` crops to fill. */
  mode?: "cover" | "contain";
};

export function FitContainImage({ uri, style, maxHeight = 560, mode = "contain" }: Props) {
  const [ratio, setRatio] = useState(1);

  return (
    <View style={[styles.wrap, { maxHeight }, mode === "cover" && styles.wrapCover]}>
      <Image
        source={{ uri }}
        style={[
          mode === "cover"
            ? { width: "100%", height: Math.min(maxHeight, 420), maxHeight }
            : { width: "100%", aspectRatio: ratio, maxHeight },
          style
        ]}
        resizeMode={mode}
        onLoad={(e) => {
          if (mode === "cover") return;
          const src = e.nativeEvent.source as { width?: number; height?: number };
          const w = Number(src?.width || 0);
          const h = Number(src?.height || 0);
          if (w > 0 && h > 0) setRatio(w / h);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    backgroundColor: "#0f172a",
    overflow: "hidden"
  },
  wrapCover: {
    alignSelf: "stretch"
  }
});
