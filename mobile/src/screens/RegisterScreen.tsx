import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { AuthLandingLayout } from "../components/AuthLandingLayout";
import { authScreenStyles as S } from "../theme/authScreenStyles";

type Props = {
  onGoLogin: () => void;
};

export function RegisterScreen({ onGoLogin }: Props) {
  const { register } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const topPad = Math.max(insets.top, 12) + 8;
  const minScrollH = Math.max(winH - topPad, 520);

  const submit = async () => {
    setError("");
    if (!name.trim() || !email.trim() || !password || !dateOfBirth) {
      setError("All fields are required");
      return;
    }
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setBusy(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: ["client"],
        dateOfBirth,
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={S.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          S.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24), minHeight: minScrollH },
        ]}
      >
        <AuthLandingLayout topInset={topPad} eyebrow="Create your account in a minute — we’ll secure your wallet and orders.">
          <View style={S.card}>
            <View style={S.cardHeader}>
              <Text style={S.cardTitle}>Create account</Text>
              <Text style={S.cardSubtitle}>Join Qwertymates and start selling, creating, and connecting.</Text>
            </View>

            <Text style={S.fieldLabel}>Full name</Text>
            <View style={[S.inputShell, error ? S.inputShellError : null]}>
              <Ionicons name="person-outline" size={20} color="#94a3b8" style={S.inputIcon} />
              <TextInput
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (error) setError("");
                }}
                placeholder="Full name"
                placeholderTextColor="#94a3b8"
                style={S.input}
                textContentType="name"
                autoComplete="name"
              />
            </View>

            <Text style={S.fieldLabel}>Email</Text>
            <View style={[S.inputShell, error ? S.inputShellError : null]}>
              <Ionicons name="mail-outline" size={20} color="#94a3b8" style={S.inputIcon} />
              <TextInput
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (error) setError("");
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor="#94a3b8"
                style={S.input}
                textContentType="emailAddress"
                autoComplete="email"
              />
            </View>

            <Text style={S.fieldLabel}>Password</Text>
            <View style={[S.inputShell, error ? S.inputShellError : null]}>
              <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={S.inputIcon} />
              <TextInput
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) setError("");
                }}
                autoCapitalize="none"
                secureTextEntry
                placeholder="Password"
                placeholderTextColor="#94a3b8"
                style={S.input}
                textContentType="newPassword"
                autoComplete="password-new"
              />
            </View>

            <Text style={S.fieldLabel}>Date of birth</Text>
            <View style={[S.inputShell, error ? S.inputShellError : null]}>
              <Ionicons name="calendar-outline" size={20} color="#94a3b8" style={S.inputIcon} />
              <TextInput
                value={dateOfBirth}
                onChangeText={(t) => {
                  setDateOfBirth(t);
                  if (error) setError("");
                }}
                autoCapitalize="none"
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
                style={S.input}
              />
            </View>

            {error ? <Text style={S.error}>{error}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={busy}
              style={({ pressed }) => [
                S.primaryBtn,
                pressed && S.primaryBtnPressed,
                busy && S.primaryBtnDisabled,
              ]}
              android_ripple={{ color: "rgba(255,255,255,0.25)" }}
            >
              {busy ? (
                <Text style={S.primaryText}>Creating…</Text>
              ) : (
                <>
                  <Text style={S.primaryText}>Create account</Text>
                  <Ionicons name="arrow-forward" size={20} color="#ffffff" style={S.btnIcon} />
                </>
              )}
            </Pressable>

            <View style={S.registerRow}>
              <Text style={S.mutedInline}>Already have an account? </Text>
              <Pressable onPress={onGoLogin} hitSlop={12}>
                <Text style={S.linkTextBold}>Sign in</Text>
              </Pressable>
            </View>
          </View>
        </AuthLandingLayout>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
