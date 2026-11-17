import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, getStoredToken, setStoredToken } from '../api/client';
import type { DeveloperProfile } from '../api/types';

// =============================================================================
// AuthContext — Mengelola sesi login JWT Developer di seluruh halaman Dashboard
// =============================================================================

interface AuthContextValue {
  developer: DeveloperProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [developer, setDeveloper] = useState<DeveloperProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Saat aplikasi pertama kali dimuat, cek apakah ada token JWT tersimpan dan validasi ke /me.
  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }

    authApi
      .me()
      .then((profile) => setDeveloper(profile))
      .catch(() => {
        // Token kedaluwarsa atau tidak valid -> bersihkan dari storage.
        setStoredToken(null);
        setDeveloper(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Fungsi login developer dan simpan JWT.
  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setStoredToken(res.token);
    setDeveloper(res.developer);
  };

  // Fungsi registrasi developer baru dan langsung login.
  const register = async (name: string, email: string, password: string) => {
    const res = await authApi.register(name, email, password);
    setStoredToken(res.token);
    setDeveloper(res.developer);
  };

  // Fungsi logout developer.
  const logout = () => {
    setStoredToken(null);
    setDeveloper(null);
  };

  return (
    <AuthContext.Provider value={{ developer, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook untuk mengakses state autentikasi developer dari komponen mana pun.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipanggil di dalam AuthProvider');
  return ctx;
}
