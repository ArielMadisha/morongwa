import React from "react";
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle
} from "react-native";

type ModalCardProps = {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  closeAccessibilityLabel?: string;
  closeAccessibilityHint?: string;
  headerLeft?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  animatedStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
};

export function ModalCard({
  title,
  onClose,
  closeLabel = "Close",
  closeAccessibilityLabel,
  closeAccessibilityHint,
  headerLeft,
  children,
  style,
  animatedStyle,
  titleStyle
}: ModalCardProps) {
  return (
    <Animated.View style={[styles.card, style, animatedStyle]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {headerLeft}
          <Text style={[styles.title, titleStyle]}>{title}</Text>
        </View>
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel={closeAccessibilityLabel || `Close ${title}`}
          accessibilityHint={closeAccessibilityHint || `Dismiss ${title} modal`}
        >
          <Text style={styles.closeText}>{closeLabel}</Text>
        </Pressable>
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    maxHeight: "85%",
    padding: 12,
    gap: 9
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  title: {
    color: "#f8fafc",
    fontWeight: "700",
    fontSize: 16
  },
  closeBtn: {
    minHeight: 34,
    minWidth: 50,
    alignItems: "center",
    justifyContent: "center"
  },
  closeText: {
    color: "#93c5fd",
    fontWeight: "600"
  }
});
