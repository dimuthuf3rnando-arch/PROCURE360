import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '../api/auth';
import { clearStoredToken, getStoredToken, storeToken } from '../api/client';
import type { Role, User } from '../types/api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  isAdmin: boolean;
  canCreateRecords: boolean;
  canEditContractors: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearStoredToken();
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      if (!getStoredToken()) {
        setLoading(false);
        return;
      }
      try {
        const current = await authApi.me();
        if (!cancelled) setUser(current);
      } catch {
        if (!cancelled) {
          clearStoredToken();
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      clearStoredToken();
      setUser(null);
    };
    window.addEventListener('procure360:unauthorized', onUnauthorized);
    return () => window.removeEventListener('procure360:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    storeToken(response.access_token);
    setUser(response.user);
    return response.user;
  }, []);

  const refresh = useCallback(async () => {
    const current = await authApi.me();
    setUser(current);
  }, []);

  const hasRole = useCallback(
    (...roles: Role[]) => Boolean(user && roles.includes(user.role)),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      refresh,
      hasRole,
      isAdmin: user?.role === 'ADMIN',
      canCreateRecords: user?.role === 'PC_MANAGER' || user?.role === 'ADMIN',
      canEditContractors:
        user?.role === 'PC_ENGINEER' || user?.role === 'SUPPLY_OFFICER' || user?.role === 'ADMIN',
    }),
    [user, loading, login, logout, refresh, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
