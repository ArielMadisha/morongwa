import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";

type Props = {
  onGoRegister: () => void;
};

export function LoginScreen({ onGoRegister }: Props) {
  const { login } = useAuth();
  const [mode, setMode] = useState<"email" | "username" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await login(identifier, password, mode);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Welcome back</Text>
      <View style={styles.modeRow}>
        <Pressable onPress={() => setMode("email")} style={[styles.modeBtn, mode === "email" && styles.active]}>
          <Text style={styles.modeText}>Email</Text>
        </Pressable>
        <Pressable onPress={() => setMode("username")} style={[styles.modeBtn, mode === "username" && styles.active]}>
          <Text style={styles.modeText}>Username</Text>
        </Pressable>
        <Pressable onPress={() => setMode("phone")} style={[styles.modeBtn, mode === "phone" && styles.active]}>
          <Text style={styles.modeText}>Phone</Text>
        </Pressable>
      </View>
      <TextInput
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        placeholder={mode === "phone" ? "Phone" : mode === "username" ? "Username" : "Email"}
        placeholderTextColor="#94a3b8"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        secureTextEntry
        placeholder="Password"
        placeholderTextColor="#94a3b8"
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={submit} disabled={busy} style={styles.primaryBtn}>
        <Text style={styles.primaryText}>{busy ? "Signing in..." : "Sign in"}</Text>
      </Pressable>
      <Pressable onPress={onGoRegister}>
        <Text style={styles.link}>Create account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  heading: { color: "#f8fafc", fontSize: 24, fontWeight: "700" },
  modeRow: { flexDirection: "row", gap: 8 },
  modeBtn: { borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  active: { borderColor: "#22c55e", backgroundColor: "#052e16" },
  modeText: { color: "#e2e8f0", fontSize: 12, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#334155", borderRadius: 10, padding: 12, color: "#f8fafc" },
  error: { color: "#fca5a5" },
  primaryBtn: { backgroundColor: "#22c55e", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  primaryText: { color: "#052e16", fontWeight: "700" },
  link: { color: "#93c5fd", textAlign: "center", marginTop: 4 }
});
