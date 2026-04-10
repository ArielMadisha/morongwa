import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle
} from "react-native";

type ActionChipProps = {
  /** Visible text when `children` is not set. */
  label?: string;
  /** Icon or custom content; when set, replaces `label` (use `accessibilityLabel` for screen readers). */
  children?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingColor?: string;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  activeStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  activeTextStyle?: StyleProp<TextStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function ActionChip({
  label,
  children,
  onPress,
  disabled,
  loading,
  loadingColor = "#64748b",
  active,
  style,
  activeStyle,
  textStyle,
  activeTextStyle,
  pressedStyle,
  accessibilityLabel,
  accessibilityHint
}: ActionChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label || "Action"}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading, selected: !!active }}
      style={({ pressed }) => [
        style,
        active && activeStyle,
        pressed && !disabled && pressedStyle
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={loadingColor} />
      ) : children != null ? (
        children
      ) : (
        <Text style={[styles.label, textStyle, active && activeTextStyle]}>{label ?? ""}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    color: "#262626",
    fontWeight: "600"
  }
});
