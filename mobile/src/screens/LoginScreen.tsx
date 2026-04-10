import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { AuthLandingLayout } from "../components/AuthLandingLayout";
import { authScreenStyles as S } from "../theme/authScreenStyles";

type Props = {
  onGoRegister: () => void;
};

const SITE_ORIGIN = "https://www.qwertymates.com";

export function LoginScreen({ onGoRegister }: Props) {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const topPad = Math.max(insets.top, 12) + 8;
  const minScrollH = Math.max(winH - topPad, 480);

  const submit = async () => {
    setError("");
    if (!identifier.trim() || !password) {
      setError("Enter identifier and password");
      return;
    }
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setBusy(true);
    try {
      await login(identifier, password);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const openForgotPassword = () => {
    void Linking.openURL(`${SITE_ORIGIN}/forgot-password`).catch(() => {});
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
        <AuthLandingLayout topInset={topPad}>
          <View style={S.card}>
            <View style={S.cardHeader}>
              <Text style={S.cardTitle}>Welcome back</Text>
              <Text style={S.cardSubtitle}>Sign in to your Qwertymates account</Text>
            </View>

            <Text style={S.fieldLabel}>Username/Email/Phone</Text>
            <View style={[S.inputShell, error ? S.inputShellError : null]}>
              <Ionicons name="mail-outline" size={20} color="#94a3b8" style={S.inputIcon} />
              <TextInput
                value={identifier}
                onChangeText={(t) => {
                  setIdentifier(t);
                  if (error) setError("");
                }}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                autoComplete="username"
                placeholder="Username/Email/Phone"
                placeholderTextColor="#94a3b8"
                style={S.input}
                returnKeyType="next"
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
                textContentType="password"
                autoComplete="password"
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                style={S.input}
                returnKeyType="go"
                onSubmitEditing={submit}
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
                <Text style={S.primaryText}>Signing in…</Text>
              ) : (
                <>
                  <Text style={S.primaryText}>Sign in</Text>
                  <Ionicons name="arrow-forward" size={20} color="#ffffff" style={S.btnIcon} />
                </>
              )}
            </Pressable>

            <Pressable onPress={openForgotPassword} style={styles.linkBlock} hitSlop={12}>
              <Text style={S.linkText}>Forgot your password?</Text>
            </Pressable>

            <View style={S.registerRow}>
              <Text style={S.mutedInline}>Don&apos;t have an account? </Text>
              <Pressable onPress={onGoRegister} hitSlop={12}>
                <Text style={S.linkTextBold}>Register now</Text>
              </Pressable>
            </View>
          </View>
        </AuthLandingLayout>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  linkBlock: {
    alignItems: "center",
    paddingVertical: 16,
  },
});
