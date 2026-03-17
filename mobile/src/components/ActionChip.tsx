import React from "react";
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
  label: string;
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
  onPress,
  disabled,
  loading,
  loadingColor = "#e2e8f0",
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
      accessibilityLabel={accessibilityLabel || label}
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
      ) : (
        <Text style={[styles.label, textStyle, active && activeTextStyle]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    color: "#e2e8f0",
    fontWeight: "600"
  }
});
