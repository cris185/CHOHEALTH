'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { auth, User, RegisterResponse, PatientRegisterData, DoctorRegisterData } from '@/lib/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerPatient: (data: PatientRegisterData) => Promise<void>;
  registerDoctor: (data: DoctorRegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getDashboardRoute(userType: string) {
  if (userType === 'Doctor') return '/dashboard/doctor';
  return '/dashboard/patient';
}

function handleRegisterSuccess(res: RegisterResponse, setUser: (u: User) => void, router: ReturnType<typeof useRouter>) {
  localStorage.setItem('access_token', res.tokens.access);
  localStorage.setItem('refresh_token', res.tokens.refresh);
  setUser(res.user);
  router.push(getDashboardRoute(res.user.user_type));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) {
      auth.me(accessToken)
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await auth.login(email, password);
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    setUser(data.user);
    router.push(getDashboardRoute(data.user.user_type));
  };

  const registerPatient = async (data: PatientRegisterData) => {
    const res = await auth.registerPatient(data);
    handleRegisterSuccess(res, setUser, router);
  };

  const registerDoctor = async (data: DoctorRegisterData) => {
    const res = await auth.registerDoctor(data);
    handleRegisterSuccess(res, setUser, router);
  };

  const logout = async () => {
    const accessToken = localStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token');
    if (accessToken && refreshToken) {
      await auth.logout(refreshToken, accessToken).catch(() => {});
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.clear();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, registerPatient, registerDoctor, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}