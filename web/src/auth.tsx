import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';

export interface Permissions {
  canEdit: boolean;
  canDelete: boolean;
  viewReports: boolean;
  manageUsers: boolean;
  viewBalances: boolean;
  viewProfit: boolean;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'EMPLOYEE';
  permissions: Permissions;
}

interface AuthState {
  /** undefined = جارٍ التحقق من الجلسة، null = لا جلسة. */
  user: User | null | undefined;
  login(username: string, password: string, remember: boolean): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api<{ user: User }>('GET', '/api/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string, remember: boolean) => {
    const data = await api<{ user: User }>('POST', '/api/auth/login', { username, password, remember });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api<void>('POST', '/api/auth/logout');
    } catch (error) {
      // فشل الاتصال لا يمنع الخروج من الواجهة.
      if (!(error instanceof ApiError)) throw error;
    }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth خارج AuthProvider');
  return context;
}

/** تسمية الدور كما في التصميم. */
export const roleLabel = (role: User['role']) => (role === 'ADMIN' ? 'المدير' : 'موظف');
