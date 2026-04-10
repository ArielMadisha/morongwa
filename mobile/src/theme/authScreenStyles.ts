import { Platform, StyleSheet } from "react-native";
import { socialTheme } from "./socialTheme";

/**
 * Shared login/register card styles — matches qwertymates.com auth + home marketing look.
 */
export const authScreenStyles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
    }),
  },
  cardHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 28,
    fontWeight: Platform.OS === "ios" ? "700" : "800",
    color: "#0f172a",
    letterSpacing: -0.6,
    textAlign: "center",
  },
  cardSubtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
  },
  inputShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingLeft: 12,
    marginBottom: 18,
  },
  inputShellError: {
    borderColor: "#fca5a5",
    backgroundColor: "#fef2f2",
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    minHeight: 48,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    paddingRight: 14,
    fontSize: 16,
    color: "#0f172a",
  },
  error: {
    color: "#be123c",
    fontSize: 14,
    marginBottom: 12,
  },
  primaryBtn: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#1e3a8a",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  primaryBtnPressed: {
    backgroundColor: "#1d4ed8",
  },
  primaryBtnDisabled: {
    opacity: 0.75,
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  btnIcon: {
    marginLeft: 2,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
    color: socialTheme.brandBlue,
  },
  registerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  mutedInline: {
    fontSize: 14,
    color: "#64748b",
  },
  linkTextBold: {
    fontSize: 14,
    fontWeight: "700",
    color: socialTheme.brandBlue,
  },
});
