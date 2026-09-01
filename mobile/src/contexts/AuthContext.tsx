import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { authAPI, getAuthToken, registerUnauthorizedHandler, setAuthToken } from "../lib/api";
import {
  attachPushNotificationListeners,
  registerForPushNotifications,
  unregisterPushNotifications,
} from "../lib/pushNotifications";
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
    emailToken?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  /** Refresh /auth/me into local session (e.g. after phone verify). */
  refreshUser: () => Promise<User | null>;
  /** Patch local user cache without round-trip. */
  applyUserPatch: (patch: Partial<User>) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const persistSession = useCallback(async (token: string, nextUser: User) => {
    setAuthToken(token);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  }, []);

  const clearSession = useCallback(async () => {
    // If the 401 interceptor already dropped the in-memory token, skip push
    // unregister — that DELETE is authenticated and would 401-loop.
    if (getAuthToken()) {
      await unregisterPushNotifications();
    }
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setAuthToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => registerUnauthorizedHandler(null);
  }, [clearSession]);

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
          // Login may have won a race while hydration was reading empty storage.
          if (getAuthToken()) return;
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
        } catch (err: unknown) {
          if (cancelled) return;
          const status = (err as { response?: { status?: number } })?.response?.status;
          // Interceptor logs out only when the current bearer was rejected.
          // Keep the cached session here so a missing header cannot bounce to login.
          if (status === 401) {
            if (!getAuthToken()) return;
            setUser(normalizeUser(cachedUser));
            return;
          }
          setUser(normalizeUser(cachedUser));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // After session is ready, register Expo push token + listen for shop-order taps.
  useEffect(() => {
    if (loading || !user) return;
    void registerForPushNotifications();
    return attachPushNotificationListeners();
  }, [loading, user]);

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
    await persistSession(token, normalizedFromLogin);
    // Authenticated shell must appear as soon as the session is stored.
    // Do not await /auth/me — a 401 interceptor used to clear this session and
    // bounce Android back to login/register after a successful sign-in.
    setUser(normalizedFromLogin);
    void (async () => {
      try {
        const meRes = await authAPI.me();
        const me = meRes.data?.user ?? null;
        if (me) {
          const normalized = normalizeUser(me as User);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(normalized));
          setUser(normalized);
        }
      } catch {
        await persistSession(token, normalizedFromLogin);
        setUser(normalizedFromLogin);
      }
    })();
  }, [persistSession]);

  const register = useCallback(async (payload: {
    name: string;
    email?: string;
    username?: string;
    password: string;
    role: string[];
    dateOfBirth?: string;
    phone?: string;
    otpToken?: string;
    emailToken?: string;
  }) => {
    const res = await authAPI.register(payload);
    const { token, user: registeredUser } = readLoginRegisterBody(res);
    if (!token || typeof token !== "string" || !registeredUser) {
      throw new Error("Invalid registration response from server");
    }
    const normalizedFromRegister = normalizeUser(registeredUser);
    await persistSession(token, normalizedFromRegister);
    setUser(normalizedFromRegister);
    void (async () => {
      try {
        const meRes = await authAPI.me();
        const me = meRes.data?.user ?? null;
        if (me) {
          const normalized = normalizeUser(me as User);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(normalized));
          setUser(normalized);
        }
      } catch {
        await persistSession(token, normalizedFromRegister);
        setUser(normalizedFromRegister);
      }
    })();
  }, [persistSession]);

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authAPI.me();
      const me = res.data?.user ?? null;
      if (me) {
        const normalized = normalizeUser(me as User);
        setUser(normalized);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(normalized));
        return normalized;
      }
    } catch {
      /* keep current */
    }
    return null;
  }, []);

  const applyUserPatch = useCallback(async (patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = normalizeUser({ ...prev, ...patch });
      void AsyncStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refreshUser,
      applyUserPatch
    }),
    [loading, user, login, register, logout, refreshUser, applyUserPatch]
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
