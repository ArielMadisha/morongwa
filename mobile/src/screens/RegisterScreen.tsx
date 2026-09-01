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
import { authAPI, formatApiError } from "../lib/api";
import { AuthLandingLayout } from "../components/AuthLandingLayout";
import { authScreenStyles as S } from "../theme/authScreenStyles";

type Props = {
  onGoLogin: () => void;
};

type Mode = "phone" | "email";

/** Accept YYYY-MM-DD or digits-only YYYYMMDD; insert hyphens while typing. */
function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function normalizeDobForApi(raw: string): string {
  const formatted = formatDobInput(raw);
  return /^\d{4}-\d{2}-\d{2}$/.test(formatted) ? formatted : formatted;
}

function digitsPhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function RegisterScreen({ onGoLogin }: Props) {
  const { register } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>("phone");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [otpChannel, setOtpChannel] = useState<"sms" | "whatsapp">("sms");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const topPad = Math.max(insets.top, 12) + 8;
  const minScrollH = Math.max(winH - topPad, 520);

  const resetAwaiting = () => {
    setAwaitingCode(false);
    setEmailOtp("");
    setPhoneOtp("");
  };

  const sendPhoneCode = async () => {
    setError("");
    const p = digitsPhone(phone);
    if (p.length < 9) {
      setError("Enter a valid cellphone number (with country code, e.g. 2782…)");
      return;
    }
    setBusy(true);
    try {
      await authAPI.sendOtp(p, otpChannel);
      setAwaitingCode(true);
      setPhoneOtp("");
    } catch (err: unknown) {
      setError(formatApiError(err, "Could not send verification code"));
    } finally {
      setBusy(false);
    }
  };

  const sendEmailCode = async () => {
    setError("");
    const dob = normalizeDobForApi(dateOfBirth);
    if (!name.trim() || !email.trim() || !password || !dob) {
      setError("All fields are required");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      setError("Date of birth must be in YYYY-MM-DD format");
      return;
    }
    setBusy(true);
    try {
      await authAPI.sendEmailOtp(email.trim().toLowerCase());
      setAwaitingCode(true);
      setEmailOtp("");
    } catch (err: unknown) {
      setError(formatApiError(err, "Could not send verification email"));
    } finally {
      setBusy(false);
    }
  };

  const submitPhone = async () => {
    setError("");
    const dob = normalizeDobForApi(dateOfBirth);
    const p = digitsPhone(phone);
    if (!awaitingCode) {
      if (!name.trim() || !password || !dob) {
        setError("Name, password, date of birth, and cellphone are required");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        setError("Date of birth must be in YYYY-MM-DD format");
        return;
      }
      await sendPhoneCode();
      return;
    }
    if (!/^\d{6}$/.test(phoneOtp.trim())) {
      setError("Enter the 6-digit code from SMS or WhatsApp");
      return;
    }
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setBusy(true);
    try {
      const verifyRes = await authAPI.verifyOtp(p, phoneOtp.trim());
      const otpToken = verifyRes.data?.otpToken;
      if (!otpToken) throw new Error("Verification failed");
      await register({
        name: name.trim(),
        phone: p,
        password,
        role: ["client"],
        dateOfBirth: dob,
        otpToken,
      });
    } catch (err: unknown) {
      setError(formatApiError(err, "Registration failed"));
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async () => {
    setError("");
    const dob = normalizeDobForApi(dateOfBirth);
    if (!awaitingCode) {
      await sendEmailCode();
      return;
    }
    if (!/^\d{6}$/.test(emailOtp.trim())) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setBusy(true);
    try {
      const verifyRes = await authAPI.verifyEmailOtp(email.trim().toLowerCase(), emailOtp.trim());
      const emailToken = verifyRes.data?.emailToken as string | undefined;
      if (!emailToken) throw new Error("Verification failed");
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: ["client"],
        dateOfBirth: dob,
        emailToken,
      });
    } catch (err: unknown) {
      setError(formatApiError(err, "Registration failed"));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => void (mode === "phone" ? submitPhone() : submitEmail());

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
        <AuthLandingLayout
          topInset={topPad}
          eyebrow="Create your account in a minute — we’ll secure your wallet and orders."
        >
          <View style={S.card}>
            <View style={S.cardHeader}>
              <Text style={S.cardTitle}>Create account</Text>
              <Text style={S.cardSubtitle}>
                Join Qwertymates,{" "}
                <Text style={S.brandTagline}>
                  The Digital Home for <Text style={S.brandTaglineAccent}>Doers</Text>, Sellers & Creators.
                </Text>
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <Pressable
                onPress={() => {
                  setMode("phone");
                  resetAwaiting();
                  setError("");
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: mode === "phone" ? "#0284c7" : "#e2e8f0",
                  backgroundColor: mode === "phone" ? "#e0f2fe" : "#fff",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: "700", color: mode === "phone" ? "#0369a1" : "#64748b" }}>
                  Cellphone
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMode("email");
                  resetAwaiting();
                  setError("");
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: mode === "email" ? "#0284c7" : "#e2e8f0",
                  backgroundColor: mode === "email" ? "#e0f2fe" : "#fff",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: "700", color: mode === "email" ? "#0369a1" : "#64748b" }}>
                  Email
                </Text>
              </Pressable>
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
                editable={!awaitingCode}
                placeholder="Full name"
                placeholderTextColor="#94a3b8"
                style={S.input}
                textContentType="name"
                autoComplete="name"
              />
            </View>

            {mode === "phone" ? (
              <>
                <Text style={S.fieldLabel}>Cellphone</Text>
                <View style={[S.inputShell, error ? S.inputShellError : null]}>
                  <Ionicons name="call-outline" size={20} color="#94a3b8" style={S.inputIcon} />
                  <TextInput
                    value={phone}
                    onChangeText={(t) => {
                      setPhone(t);
                      if (error) setError("");
                    }}
                    editable={!awaitingCode}
                    keyboardType="phone-pad"
                    placeholder="e.g. 27821234567"
                    placeholderTextColor="#94a3b8"
                    style={S.input}
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                  />
                </View>
                {!awaitingCode ? (
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => setOtpChannel("sms")}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: otpChannel === "sms" ? "#0284c7" : "#f1f5f9",
                      }}
                    >
                      <Text style={{ color: otpChannel === "sms" ? "#fff" : "#475569", fontWeight: "600" }}>
                        SMS
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setOtpChannel("whatsapp")}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: otpChannel === "whatsapp" ? "#0284c7" : "#f1f5f9",
                      }}
                    >
                      <Text
                        style={{ color: otpChannel === "whatsapp" ? "#fff" : "#475569", fontWeight: "600" }}
                      >
                        WhatsApp
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={S.fieldLabel}>Email</Text>
                <View style={[S.inputShell, error ? S.inputShellError : null]}>
                  <Ionicons name="mail-outline" size={20} color="#94a3b8" style={S.inputIcon} />
                  <TextInput
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      if (error) setError("");
                    }}
                    editable={!awaitingCode}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor="#94a3b8"
                    style={S.input}
                    textContentType="emailAddress"
                    autoComplete="email"
                  />
                </View>
              </>
            )}

            <Text style={S.fieldLabel}>Password</Text>
            <View style={[S.inputShell, error ? S.inputShellError : null]}>
              <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={S.inputIcon} />
              <TextInput
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) setError("");
                }}
                editable={!awaitingCode}
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
                  setDateOfBirth(formatDobInput(t));
                  if (error) setError("");
                }}
                editable={!awaitingCode}
                autoCapitalize="none"
                keyboardType="number-pad"
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
                style={S.input}
                maxLength={10}
              />
            </View>

            {awaitingCode ? (
              <>
                <Text style={S.fieldLabel}>
                  {mode === "phone" ? "SMS / WhatsApp code" : "Email verification code"}
                </Text>
                <View style={[S.inputShell, error ? S.inputShellError : null]}>
                  <Ionicons name="key-outline" size={20} color="#94a3b8" style={S.inputIcon} />
                  <TextInput
                    value={mode === "phone" ? phoneOtp : emailOtp}
                    onChangeText={(t) => {
                      const v = t.replace(/\D/g, "").slice(0, 6);
                      if (mode === "phone") setPhoneOtp(v);
                      else setEmailOtp(v);
                      if (error) setError("");
                    }}
                    keyboardType="number-pad"
                    placeholder="6-digit code"
                    placeholderTextColor="#94a3b8"
                    style={S.input}
                    maxLength={6}
                  />
                </View>
                <Pressable onPress={resetAwaiting} style={{ marginBottom: 8 }}>
                  <Text style={{ color: "#0284c7", fontWeight: "600" }}>Change number / email</Text>
                </Pressable>
              </>
            ) : null}

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
              <Text style={S.primaryText}>
                {busy
                  ? "Please wait…"
                  : awaitingCode
                    ? "Create account"
                    : "Send verification code"}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>

            <Text style={S.linkText}>
              Already have an account?{" "}
              <Text style={S.linkTextBold} onPress={onGoLogin}>
                Sign in
              </Text>
            </Text>
          </View>
        </AuthLandingLayout>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
