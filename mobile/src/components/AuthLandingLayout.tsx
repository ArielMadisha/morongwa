import React from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { socialTheme } from "../theme/socialTheme";

type Props = {
  children: React.ReactNode;
  /** Optional line under the revolution pill (e.g. register tagline). */
  eyebrow?: string;
  /** Extra top padding after safe area (default accounts for status bar). */
  topInset: number;
};

/**
 * Marketing shell aligned with qwertymates.com: soft brand orbs, logo row,
 * “Join the Qwerty Revolution” pill — same family as the web home + auth pages.
 */
export function AuthLandingLayout({ children, eyebrow, topInset }: Props) {
  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.orb, styles.orb1]} />
        <View style={[styles.orb, styles.orb2]} />
        <View style={[styles.orb, styles.orb3]} />
      </View>
      <View style={[styles.inner, { paddingTop: topInset }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandLogoBadge}>
            <Image
              source={require("../../assets/images/qwertymates-logo-icon.png")}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
          <Text style={styles.brandWordmark}>Qwertymates</Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="sparkles" size={14} color={socialTheme.brandBlue} />
          <Text style={styles.pillText}>Join the Qwerty Revolution</Text>
        </View>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: "#f8fafc"
  },
  orb: {
    position: "absolute",
    borderRadius: 9999
  },
  orb1: {
    width: 280,
    height: 280,
    top: -100,
    left: -72,
    backgroundColor: "rgba(191, 219, 254, 0.55)"
  },
  orb2: {
    width: 320,
    height: 320,
    top: 80,
    right: -120,
    backgroundColor: "rgba(165, 180, 252, 0.35)"
  },
  orb3: {
    width: 200,
    height: 200,
    bottom: 120,
    left: -40,
    backgroundColor: "rgba(147, 197, 253, 0.25)"
  },
  inner: {
    paddingHorizontal: 20,
    paddingBottom: 8
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 20
  },
  brandLogo: {
    width: 34,
    height: 34
  },
  brandLogoBadge: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)"
  },
  brandWordmark: {
    fontSize: 22,
    fontWeight: Platform.OS === "ios" ? "700" : "800",
    color: "#0f172a",
    letterSpacing: -0.4
  },
  pill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(239, 246, 255, 0.95)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(191, 219, 254, 0.9)",
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4
      },
      android: { elevation: 1 }
    })
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1d4ed8"
  },
  eyebrow: {
    textAlign: "center",
    fontSize: 14,
    color: "#64748b",
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8
  }
});
