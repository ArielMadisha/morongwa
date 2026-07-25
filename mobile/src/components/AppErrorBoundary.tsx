import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { socialTheme } from "../theme/socialTheme";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message?: string };

/**
 * Catches render/runtime errors anywhere below it so the app shows a readable
 * message instead of a blank white screen (React Native renders nothing when an
 * uncaught error escapes the root component in a production build).
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error("AppErrorBoundary caught:", error);
  }

  handleRetry = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.wrap}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The app hit an unexpected error. Please try again. If it keeps happening, update the app from the store.
          </Text>
          {this.state.message ? <Text style={styles.detail}>{this.state.message}</Text> : null}
          <Pressable style={styles.button} onPress={this.handleRetry} accessibilityRole="button">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: socialTheme.canvas },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: "800", color: socialTheme.textPrimary, textAlign: "center" },
  body: { fontSize: 15, color: socialTheme.textSecondary, textAlign: "center", lineHeight: 21 },
  detail: { fontSize: 12, color: socialTheme.textMuted, textAlign: "center", marginTop: 4 },
  button: {
    marginTop: 12,
    backgroundColor: socialTheme.brandBlue,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: { color: "#ffffff", fontWeight: "800", fontSize: 15 },
});
