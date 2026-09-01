import React from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { appTypography, socialTheme } from "../theme/socialTheme";

export type MediaChip = { id: string; label: string };

/**
 * Pill chip row shared by QwertyMedia section tabs and the QwertyTV genre filter.
 * Styling matches the QwertyMusic genre chips.
 */
export function MediaChipsRow({
  chips,
  activeId,
  onSelect,
  accessibilityLabel
}: {
  chips: MediaChip[];
  activeId: string;
  onSelect: (id: string) => void;
  accessibilityLabel?: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsRow}
      accessibilityLabel={accessibilityLabel}
    >
      {chips.map((chip) => {
        const on = chip.id === activeId;
        return (
          <Pressable
            key={chip.id}
            onPress={() => onSelect(chip.id)}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chipsRow: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 2,
    alignItems: "center"
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: socialTheme.borderHairline,
    backgroundColor: socialTheme.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  chipOn: {
    borderColor: socialTheme.brandBlue,
    backgroundColor: socialTheme.brandBlueSoft
  },
  chipText: {
    ...appTypography.labelSm,
    color: socialTheme.textSecondary
  },
  chipTextOn: {
    color: socialTheme.brandBlueDark
  }
});
