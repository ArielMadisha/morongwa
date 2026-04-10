import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type CallScreenProps = {
  userId: string;
  onClose: () => void;
  initialPeerUserId?: string;
  initialRoomId?: string;
  autoJoinRoom?: boolean;
  initialAudioOnly?: boolean;
};

/**
 * Expo Go does not ship react-native-webrtc. Real calls require a dev or preview build (EAS).
 */
export default function CallScreenExpoGoStub({ onClose }: CallScreenProps) {
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>Video calls need a custom build</Text>
        <Text style={styles.body}>
          Expo Go cannot load WebRTC. Use an EAS development/preview build on your device, or run{" "}
          <Text style={styles.mono}>npx expo run:ios</Text> / <Text style={styles.mono}>run:android</Text>{" "}
          locally.
        </Text>
        <Pressable onPress={onClose} style={styles.btn} accessibilityRole="button">
          <Text style={styles.btnText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    zIndex: 9999
  },
  card: {
    maxWidth: 360,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 14
  },
  title: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  body: { color: "#cbd5e1", fontSize: 15, lineHeight: 22 },
  mono: { fontFamily: "monospace", color: "#93c5fd" },
  btn: {
    alignSelf: "flex-start",
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10
  },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 15 }
});
