import React, { useState } from "react";
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Phone-call entry point on Messages.
 * Twilio Voice native SDK was removed from the startup graph because autolinking
 * it caused blank-screen native crashes on some Android devices. This FAB still
 * offers dialing via the production web wallet / Morongwa call flow until a
 * properly configured native Voice build is reintroduced.
 */
export function MorongwaPstnCallFab() {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");

  const openWebCall = () => {
    const dest = to.trim();
    const url = dest
      ? `https://www.qwertymates.com/wallet?call=${encodeURIComponent(dest)}`
      : "https://www.qwertymates.com/wallet";
    void Linking.openURL(url).catch(() => {
      Alert.alert("Call", "Could not open Qwertymates. Check your connection and try again.");
    });
    setOpen(false);
  };

  return (
    <>
      <Pressable style={styles.fab} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Call phone">
        <Ionicons name="call" size={22} color="#4338ca" />
        <Text style={styles.fabText}>Call phone</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Call a number</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <Text style={styles.hint}>
              Enter a number, then continue on Qwertymates to place the call with your wallet airtime.
            </Text>
            <TextInput
              value={to}
              onChangeText={setTo}
              placeholder="+27111222333"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              style={styles.input}
              accessibilityLabel="Phone number"
            />
            <Pressable style={styles.callBtn} onPress={openWebCall}>
              <Text style={styles.callBtnText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: "#312e81",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    zIndex: 20,
  },
  fabText: { color: "#4338ca", fontWeight: "800", fontSize: 14 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    gap: 8,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a", flex: 1 },
  hint: { color: "#64748b", fontSize: 13, lineHeight: 18, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  callBtn: {
    marginTop: 8,
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  callBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
