import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { api, tokenStore, AuthUser } from "@/lib/api";

interface RegisterInput {
  organization_name: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  password_confirmation: string;
  business_type?: string;
  package?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  isAuthenticated: boolean;
  /** Tenant uuid. Kept under the old name so existing pages still compile. */
  tenantId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      return;
    }
    try {
      const { user } = await api.get<{ user: AuthUser }>("auth/me");
      setUser(user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));

    // api.ts fires this when the server rejects the stored token.
    const onLogout = () => setUser(null);
    window.addEventListener("tikooh:logout", onLogout);
    return () => window.removeEventListener("tikooh:logout", onLogout);
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: AuthUser }>("auth/login", { email, password });
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  };

  const register = async (input: RegisterInput) => {
    const res = await api.post<{ token: string; user: AuthUser }>("auth/register", { ...input });
    tokenStore.set(res.token);
    // Register returns a slimmer user; fetch the full one.
    const { user } = await api.get<{ user: AuthUser }>("auth/me");
    setUser(user);
    return user;
  };

  const logout = async () => {
    try { await api.post("auth/logout"); } catch { /* token may already be gone */ }
    tokenStore.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refresh,
        isAuthenticated: !!user,
        tenantId: user?.tenant?.uuid ?? null,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
