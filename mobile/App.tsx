import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <AuthGate />
        </View>
        <StatusBar style="light" />
      </SafeAreaView>
    </AuthProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const [authScreen, setAuthScreen] = useState<"login" | "register">("login");

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={styles.loadingText}>Loading your session...</Text>
      </View>
    );
  }

  if (!user) {
    return authScreen === "login" ? (
      <LoginScreen onGoRegister={() => setAuthScreen("register")} />
    ) : (
      <RegisterScreen onGoLogin={() => setAuthScreen("login")} />
    );
  }

  return <HomeScreen />;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0f172a"
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 36
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12
  },
  loadingText: {
    color: "#cbd5e1",
    fontSize: 15
  }
});
