import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { authAPI, setAuthToken } from "../lib/api";
import { Role, User } from "../types";

const TOKEN_KEY = "qwertymates.mobile.token";
const USER_KEY = "qwertymates.mobile.user";

function normalizeUser(me: User): User {
  const id = me._id ?? me.id;
  const sid = id != null ? String(id) : "";
  return {
    ...me,
    _id: sid || undefined,
    id: sid || undefined,
    role: Array.isArray(me.role) ? me.role : me.role != null ? [me.role as Role] : undefined
  };
}

/** Support both flat and wrapped API bodies across axios / proxy variants. */
function readLoginRegisterBody(res: { data?: unknown }): { token?: string; user?: User } {
  const root = res?.data as Record<string, unknown> | undefined;
  if (!root || typeof root !== "object") return {};
  const token =
    typeof root.token === "string"
      ? root.token
      : root.data && typeof root.data === "object" && typeof (root.data as { token?: unknown }).token === "string"
        ? ((root.data as { token: string }).token as string)
        : undefined;
  const userRaw =
    (root.user as User | undefined) ??
    (root.data && typeof root.data === "object"
      ? ((root.data as { user?: User }).user as User | undefined)
      : undefined);
  return { token, user: userRaw };
}

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
    let cancelled = false;
    (async () => {
      try {
        const [token, rawUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY)
        ]);
        if (cancelled) return;
        if (!token || !rawUser) {
          setAuthToken(null);
          setUser(null);
          return;
        }
        setAuthToken(token);
        let cachedUser: User;
        try {
          cachedUser = JSON.parse(rawUser) as User;
        } catch {
          await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
          setAuthToken(null);
          setUser(null);
          return;
        }
        if (cancelled) return;
        setUser(normalizeUser(cachedUser));
        try {
          const res = await authAPI.me();
          if (cancelled) return;
          const me = res.data?.user ?? null;
          if (me) {
            const normalized = normalizeUser(me as User);
            setUser(normalized);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(normalized));
          }
        } catch {
          // Keep cached session when /auth/me is temporarily unavailable.
          // Logging users out here causes a "briefly opens home then back to landing" loop.
          if (cancelled) return;
          setUser(normalizeUser(cachedUser));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string, mode?: "email" | "username" | "phone") => {
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
    const { token, user: loggedInUser } = readLoginRegisterBody(res);
    if (!token || typeof token !== "string" || !loggedInUser) {
      throw new Error("Invalid login response from server");
    }
    const normalizedFromLogin = normalizeUser(loggedInUser);
    setAuthToken(token);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USER_KEY, JSON.stringify(normalizedFromLogin)]
    ]);
    // Immediately mark authenticated; refresh profile in background.
    setUser(normalizedFromLogin);
    try {
      const meRes = await authAPI.me();
      const me = meRes.data?.user ?? null;
      if (me) {
        const normalized = normalizeUser(me as User);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(normalized));
        setUser(normalized);
      }
    } catch {
      // Keep authenticated session even if profile refresh fails.
      setUser(normalizedFromLogin);
    }
  }, []);

  const register = useCallback(async (payload: {
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
    const { token, user: registeredUser } = readLoginRegisterBody(res);
    if (!token || typeof token !== "string" || !registeredUser) {
      throw new Error("Invalid registration response from server");
    }
    const normalizedFromRegister = normalizeUser(registeredUser);
    setAuthToken(token);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USER_KEY, JSON.stringify(normalizedFromRegister)]
    ]);
    // Immediately mark authenticated; refresh profile in background.
    setUser(normalizedFromRegister);
    try {
      const meRes = await authAPI.me();
      const me = meRes.data?.user ?? null;
      if (me) {
        const normalized = normalizeUser(me as User);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(normalized));
        setUser(normalized);
      }
    } catch {
      // Keep authenticated session even if profile refresh fails.
      setUser(normalizedFromRegister);
    }
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setAuthToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout
    }),
    [loading, user, login, register, logout]
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
