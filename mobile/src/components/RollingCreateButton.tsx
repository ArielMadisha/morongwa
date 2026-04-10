import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { socialTheme } from "../theme/socialTheme";

type RollingCreateButtonProps = {
  onPress: () => void;
  /** Outer diameter in px (default 44). */
  size?: number;
};

/**
 * Oobenn-style create control: blue sphere with rolling motion (slow rotation)
 * plus a sweeping highlight; the “+” counter-rotates so it stays upright.
 */
export function RollingCreateButton({ onPress, size = 44 }: RollingCreateButtonProps) {
  const sweep = useRef(new Animated.Value(0)).current;
  const roll = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sweepLoop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    const rollLoop = Animated.loop(
      Animated.timing(roll, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    sweepLoop.start();
    rollLoop.start();
    return () => {
      sweepLoop.stop();
      rollLoop.stop();
    };
  }, [roll, sweep]);

  const translateX = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-size * 0.85, size * 0.85]
  });

  const spin = roll.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });

  const counterSpin = roll.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-360deg"]
  });

  const r = size / 2;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Create"
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <Animated.View style={{ width: size, height: size, transform: [{ rotate: spin }] }}>
        <View style={[styles.outer, { width: size, height: size, borderRadius: r }]}>
          <View style={[styles.clip, { borderRadius: r }]}>
            <Animated.View
              style={[
                styles.shimmer,
                {
                  height: size,
                  transform: [{ translateX }]
                }
              ]}
            />
          </View>
          <Animated.View
            style={[styles.iconLayer, { transform: [{ rotate: counterSpin }] }]}
            pointerEvents="none"
          >
            <Ionicons name="add" size={Math.round(size * 0.58)} color="#ffffff" />
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92
  },
  outer: {
    backgroundColor: socialTheme.brandBlue,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4
  },
  clip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden"
  },
  shimmer: {
    position: "absolute",
    left: "50%",
    marginLeft: -14,
    width: 28,
    backgroundColor: "rgba(255,255,255,0.38)"
  },
  iconLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2
  }
});
