import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authAPI, setAuthToken } from "../lib/api";
import { Role, User } from "../types";

const TOKEN_KEY = "morongwa.mobile.token";
const USER_KEY = "morongwa.mobile.user";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string, mode?: "email" | "username" | "phone") => Promise<void>;
  register: (payload: {
    name: string;
    email?: string;
    username?: string;
    password: string;
    role: string[];
    dateOfBirth?: string;
    phone?: string;
    otpToken?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [token, rawUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY)
        ]);
        if (!mounted) return;
        if (!token || !rawUser) {
          setLoading(false);
          return;
        }
        setAuthToken(token);
        setUser(JSON.parse(rawUser) as User);
        try {
          const res = await authAPI.me();
          const me = res.data?.user ?? null;
          if (me) {
                       const normalized: User = {
              ...me,
              _id: me._id ?? me.id,
              id: me.id ?? me._id,
              role: Array.isArray(me.role) ? me.role : me.role != null ? [me.role as Role] : undefined
            };
            setUser(normalized);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(normalized));
          }
        } catch {
          await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
          setAuthToken(null);
          setUser(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (identifier: string, password: string, mode?: "email" | "username" | "phone") => {
    const raw = identifier.trim();
    const detectedMode =
      mode ??
      (/^\+?\d[\d\s()-]{8,}$/.test(raw)
        ? "phone"
        : raw.includes("@")
        ? "email"
        : "username");
    const payload =
      detectedMode === "phone"
        ? { phone: raw, password }
        : detectedMode === "username"
        ? { username: raw.toLowerCase(), password }
        : { email: raw.toLowerCase(), password };
    const res = await authAPI.login(payload);
    const token = res.data?.token as string;
    const loggedInUser = res.data?.user as User;
    setAuthToken(token);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USER_KEY, JSON.stringify(loggedInUser)]
    ]);
    setUser(loggedInUser);
  };

  const register = async (payload: {
    name: string;
    email?: string;
    username?: string;
    password: string;
    role: string[];
    dateOfBirth?: string;
    phone?: string;
    otpToken?: string;
  }) => {
    const res = await authAPI.register(payload);
    const token = res.data?.token as string;
    const registeredUser = res.data?.user as User;
    setAuthToken(token);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USER_KEY, JSON.stringify(registeredUser)]
    ]);
    setUser(registeredUser);
  };

  const logout = async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setAuthToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
