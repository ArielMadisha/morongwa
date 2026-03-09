import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";

type Props = {
  onGoLogin: () => void;
};

export function RegisterScreen({ onGoLogin }: Props) {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await register({
        name,
        email: email.trim().toLowerCase(),
        password,
        role: ["client"]
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Create account</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Full name"
        placeholderTextColor="#94a3b8"
        style={styles.input}
      />
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
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
        <Text style={styles.primaryText}>{busy ? "Creating..." : "Create account"}</Text>
      </Pressable>
      <Pressable onPress={onGoLogin}>
        <Text style={styles.link}>I already have an account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  heading: { color: "#f8fafc", fontSize: 24, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#334155", borderRadius: 10, padding: 12, color: "#f8fafc" },
  error: { color: "#fca5a5" },
  primaryBtn: { backgroundColor: "#22c55e", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  primaryText: { color: "#052e16", fontWeight: "700" },
  link: { color: "#93c5fd", textAlign: "center", marginTop: 4 }
});
