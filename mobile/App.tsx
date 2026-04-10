import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { socialTheme } from "./src/theme/socialTheme";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SafeAreaView style={styles.safe}>
          <View style={styles.container}>
            <AuthGate />
          </View>
          <StatusBar style="dark" />
        </SafeAreaView>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const [authScreen, setAuthScreen] = useState<"login" | "register">("login");

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={socialTheme.brandBlue} />
        <Text style={styles.loadingText}>Loading your session...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.authShell}>
        {authScreen === "login" ? (
          <LoginScreen onGoRegister={() => setAuthScreen("register")} />
        ) : (
          <RegisterScreen onGoLogin={() => setAuthScreen("login")} />
        )}
      </View>
    );
  }

  return <HomeScreen />;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: socialTheme.canvas
  },
  container: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8
  },
  authShell: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 4
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12
  },
  loadingText: {
    color: socialTheme.textSecondary,
    fontSize: 15
  }
});
