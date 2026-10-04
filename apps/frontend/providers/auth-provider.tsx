'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'name' | 'email'>>) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.session().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    setUser(await api.auth.login(email, password, remember));
  }, []);
  const loginWithGoogle = useCallback(async () => setUser(await api.auth.loginWithGoogle()), []);
  const signup = useCallback(async (name: string, email: string, password: string) => {
    setUser(await api.auth.signup(name, email, password));
  }, []);
  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);
  const updateProfile = useCallback(async (patch: Partial<Pick<User, 'name' | 'email'>>) => {
    setUser(await api.auth.updateProfile(patch));
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, signup, logout, updateProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
