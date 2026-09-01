import React, { createContext, useContext, useMemo, useState } from "react";
import { Animated, FlatList, ScrollView, StyleSheet, View } from "react-native";
import type { FlatListProps, LayoutChangeEvent, ScrollViewProps, StyleProp, ViewStyle } from "react-native";
import {
  mergeScrollHandler,
  useScrollAwareChrome,
  type ScrollAwareChromeApi,
  type ScrollAwareChromeOptions,
  type ScrollAwareScrollHandlers,
} from "../hooks/useScrollAwareChrome";

const NOOP_HANDLERS: ScrollAwareScrollHandlers = {
  onScroll: () => {},
  onContentSizeChange: () => {},
  onLayout: () => {},
  scrollEventThrottle: 16,
};

const ScrollAwareChromeContext = createContext<ScrollAwareChromeApi | null>(null);

/**
 * Share one chrome controller with every nested scrollable screen.
 *
 * Screens never need to know which header/footer exists — they attach
 * `useScrollAwareScrollHandlers()` (or use the wrapper lists below) and the shell
 * animates its own chrome.
 */
export function ScrollAwareChromeProvider({
  children,
  options,
}: {
  children: React.ReactNode | ((api: ScrollAwareChromeApi) => React.ReactNode);
  options?: ScrollAwareChromeOptions;
}) {
  const api = useScrollAwareChrome(options);
  return (
    <ScrollAwareChromeContext.Provider value={api}>
      {typeof children === "function" ? children(api) : children}
    </ScrollAwareChromeContext.Provider>
  );
}

export function useScrollAwareChromeContext(): ScrollAwareChromeApi | null {
  return useContext(ScrollAwareChromeContext);
}

/** Safe in screens rendered outside a provider — returns no-ops. */
export function useScrollAwareScrollHandlers(): ScrollAwareScrollHandlers {
  return useScrollAwareChromeContext()?.handlers ?? NOOP_HANDLERS;
}

type CollapsibleChromeProps = {
  api: ScrollAwareChromeApi | null;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** "top" slides up out of view, "bottom" slides down. */
  edge?: "top" | "bottom";
  /** Keeps this many px visible when collapsed (e.g. safe-area inset). */
  minHeight?: number;
  enabled?: boolean;
};

/**
 * Collapses its natural height to `minHeight` while sliding out of view, so a hidden
 * tab bar or header leaves no empty gap and the content area grows instead.
 */
export function CollapsibleChrome({
  api,
  children,
  style,
  edge = "top",
  minHeight = 0,
  enabled = true,
}: CollapsibleChromeProps) {
  const [naturalHeight, setNaturalHeight] = useState(0);

  // Measured on the inner view: it keeps its content height even while the animated
  // outer view is clipped, so collapsing never latches a shrunken height.
  const onInnerLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - naturalHeight) > 1) setNaturalHeight(h);
  };

  const animated = useMemo(() => {
    if (!api || !enabled || naturalHeight <= 0) return null;
    const height = api.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [minHeight, naturalHeight],
    });
    const shift = Math.max(0, naturalHeight - minHeight);
    const translateY = api.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [edge === "top" ? -shift : shift, 0],
    });
    const opacity = api.progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.35, 1] });
    return { height, translateY, opacity };
  }, [api, enabled, naturalHeight, minHeight, edge]);

  return (
    <Animated.View
      style={[
        style,
        animated
          ? { height: animated.height, opacity: animated.opacity, transform: [{ translateY: animated.translateY }] }
          : null,
        animated ? styles.clipped : null,
      ]}
      pointerEvents={api?.hidden && enabled ? "none" : "auto"}
    >
      <View style={styles.chromeInner} onLayout={onInnerLayout}>
        {children}
      </View>
    </Animated.View>
  );
}

/** FlatList that drives the shared chrome. Existing props (refresh, onEndReached…) pass through. */
export function ScrollAwareFlatList<ItemT>(props: FlatListProps<ItemT>) {
  const shared = useScrollAwareScrollHandlers();
  return (
    <FlatList
      {...props}
      scrollEventThrottle={props.scrollEventThrottle ?? shared.scrollEventThrottle}
      onScroll={mergeScrollHandler(props.onScroll, shared.onScroll)}
      onContentSizeChange={(w, h) => {
        props.onContentSizeChange?.(w, h);
        shared.onContentSizeChange(w, h);
      }}
      onLayout={(e) => {
        props.onLayout?.(e);
        shared.onLayout(e);
      }}
    />
  );
}

/** ScrollView that drives the shared chrome. */
export function ScrollAwareScrollView(props: ScrollViewProps & { children?: React.ReactNode }) {
  const shared = useScrollAwareScrollHandlers();
  return (
    <ScrollView
      {...props}
      scrollEventThrottle={props.scrollEventThrottle ?? shared.scrollEventThrottle}
      onScroll={mergeScrollHandler(props.onScroll, shared.onScroll)}
      onContentSizeChange={(w, h) => {
        props.onContentSizeChange?.(w, h);
        shared.onContentSizeChange(w, h);
      }}
      onLayout={(e) => {
        props.onLayout?.(e);
        shared.onLayout(e);
      }}
    />
  );
}

const styles = StyleSheet.create({
  clipped: { overflow: "hidden" },
  chromeInner: { flexShrink: 0 },
});
