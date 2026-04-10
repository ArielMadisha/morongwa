/**
 * Qwertymates mobile — “social shell” look inspired by classic Instagram-style layouts
 * (clean white surfaces, hairline borders, neutral type) and Oobenn’s blue + warm accent pairing.
 * Feed list uses `feedLight` (see below) for IG-style white cards on a light canvas; full-screen media viewer stays dark for contrast.
 */
import { Platform, type TextStyle } from "react-native";

/**
 * Shared typography scale — nav labels, hub tiles, and card titles use the same weights with stepped sizes
 * so the app reads as one cohesive system.
 */
export const appTypography = {
  /** Bottom tab labels + hub quick-tile labels */
  labelSm: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: -0.15,
    lineHeight: 14
  } satisfies TextStyle,
  /** Product titles on hub cards */
  titleSm: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.15,
    lineHeight: 17
  } satisfies TextStyle,
  /** Modal titles, larger list headings */
  titleMd: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
    lineHeight: 21
  } satisfies TextStyle,
  /** Primary numbers (prices) */
  price: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 18
  } satisfies TextStyle,
  /** Stock, helpers, empty states */
  meta: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: -0.05,
    lineHeight: 16
  } satisfies TextStyle,
  /** Form fields */
  input: {
    fontSize: 15,
    fontWeight: "400",
    letterSpacing: -0.1,
    lineHeight: 21
  } satisfies TextStyle,
  /** RESELL / small badges */
  badge: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.15,
    lineHeight: 12
  } satisfies TextStyle,
  /** “Create post”–scale sheet titles */
  headline: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.35,
    lineHeight: 22
  } satisfies TextStyle,
  /** Primary CTA label */
  cta: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.15,
    lineHeight: 20
  } satisfies TextStyle
} as const;

export const socialTheme = {
  canvas: "#fafafa",
  surface: "#ffffff",
  surfaceMuted: "#f5f5f5",

  borderHairline: "#dbdbdb",
  borderLight: "#efefef",
  borderFocus: "#a3a3a3",

  textPrimary: "#262626",
  textSecondary: "#8e8e8e",
  textMuted: "#a8a8a8",

  /** Primary Qwertymates brand */
  brandBlue: "#1d4ed8",
  brandBlueDark: "#1e40af",
  brandBlueSoft: "#eff6ff",

  /** Oobenn-style warm accent — chips, badges, subtle highlights */
  accentOrange: "#f97316",
  accentOrangeSoft: "#fff7ed",

  /** Legacy alias used in a few places */
  slateBlueTint: "#eef2ff"
} as const;

/** Login / register hero + form (light “sheet” over blue hero) */
export const authBranding = {
  heroTop: socialTheme.brandBlue,
  sheet: socialTheme.surface,
  muted: socialTheme.textSecondary,
  border: socialTheme.borderHairline,
  inputBg: Platform.OS === "ios" ? "#fafafa" : "#f5f5f5",
  primary: socialTheme.brandBlue,
  primaryPressed: socialTheme.brandBlueDark
};

/** Home chrome: header + bottom tab bar */
export const socialChrome = {
  headerBg: socialTheme.surface,
  headerBorder: socialTheme.borderHairline,
  bottomBarBg: socialTheme.surface,
  bottomBarBorder: socialTheme.borderHairline,
  navActive: socialTheme.textPrimary,
  navInactive: socialTheme.textSecondary,
  navActiveBrand: socialTheme.brandBlue,
  badgeBg: socialTheme.brandBlue,
  badgeText: "#ffffff"
};

/**
 * Light “IG-card” feed: white cards on canvas, hairline borders, dark text.
 * Used by FeedScreen + related modals.
 */
export const feedLight = {
  canvas: socialTheme.canvas,
  surface: socialTheme.surface,
  border: socialTheme.borderHairline,
  borderMuted: socialTheme.borderLight,
  text: socialTheme.textPrimary,
  textSecondary: socialTheme.textSecondary,
  textMuted: socialTheme.textMuted,
  link: socialTheme.brandBlue,
  meta: socialTheme.brandBlue,
  body: "#404040",
  hashtag: "#059669",
  stats: socialTheme.textSecondary,
  ad: socialTheme.accentOrange,
  skeleton: "#e5e7eb",
  skeletonCard: "#f3f4f6",
  searchBg: "#fafafa",
  chipActiveBg: socialTheme.brandBlueSoft,
  chipActiveBorder: socialTheme.brandBlue,
  green: "#22c55e",
  greenSoft: "#ecfdf5",
  greenText: "#15803d",
  amberSoft: "#fffbeb",
  amberBorder: "#f59e0b",
  amberText: "#92400e",
  dangerSoft: "#fef2f2",
  dangerBorder: "#fecaca",
  dangerText: "#b91c1c",
  modalBackdrop: "rgba(0,0,0,0.45)",
  mediaViewerBackdrop: "rgba(0,0,0,0.92)",
  toastBg: socialTheme.surface,
  toastBorder: socialTheme.borderHairline,
  toastSuccessBg: "#ecfdf5",
  toastSuccessBorder: "#86efac",
  toastErrorBg: "#fef2f2",
  toastErrorBorder: "#fecaca",
  heart: "#f43f5e"
} as const;
