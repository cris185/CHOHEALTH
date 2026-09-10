import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, setAuthHandlers, User, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/api';
import { stopLocationTracking } from '@/location/backgroundTask';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = async () => {
    const accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    if (!accessToken) {
      setLoading(false);
      return;
    }
    try {
      const me = await auth.me(accessToken);
      if (me.user_type !== 'Delivery') throw { status: 403, data: null };
      setUser(me);
      setToken(accessToken);
    } catch {
      await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
    // fetchAPI refreshes the access token transparently on a 401 — this is
    // how that reaches React state, so every subsequent call (built from
    // `token` below) uses the fresh one directly instead of taking the
    // 401-then-retry round trip every time.
    setAuthHandlers({
      onTokenRefreshed: (accessToken) => setToken(accessToken),
      onAuthExpired: () => { setUser(null); setToken(null); },
    });
  }, []);

  const login = async (email: string, password: string) => {
    const data = await auth.login(email, password);
    // This app only works for couriers — every other screen assumes a
    // DeliveryPerson profile exists, which throws a 403 in silence and
    // leaves the UI stuck on a loading spinner otherwise.
    if (data.user.user_type !== 'Delivery') {
      throw { status: 403, data: { detail: 'This app is for couriers only. Sign in with a courier account.' } };
    }
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, data.access);
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
    setToken(data.access);
    setUser(data.user);
  };

  const logout = async () => {
    const accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
    if (accessToken && refreshToken) {
      await auth.logout(refreshToken, accessToken).catch(() => {});
    }
    await stopLocationTracking().catch(() => {});
    await AsyncStorage.multiRemove([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!token) return;
    const me = await auth.me(token).catch(() => null);
    if (me) setUser(me);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
