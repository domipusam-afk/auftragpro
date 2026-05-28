import { createContext, useContext, useState, ReactNode } from "react";
import { apiRequest } from "./queryClient";

export type Rolle = "admin" | "mitarbeiter";

export interface AppUser {
  id: string;
  benutzername: string;
  rolle: Rolle;
}

interface AuthContextType {
  user: AppUser | null;
  isLoggedIn: boolean;
  login: (benutzername: string, passwort: string) => Promise<{ ok: boolean; requires2fa?: boolean; userId?: string; message?: string }>;
  verify2fa: (userId: string, code: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoggedIn: false,
  login: async () => ({ ok: false }),
  verify2fa: async () => ({ ok: false }),
  logout: () => {},
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // In-Memory only — kein sessionStorage (blockiert im Preview-Iframe)
  const [user, setUser] = useState<AppUser | null>(null);

  const login = async (benutzername: string, passwort: string) => {
    try {
      const res = await apiRequest("POST", "/api/auth/login", { benutzername, passwort });
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.message };
      if (data.requires2fa) return { ok: true, requires2fa: true, userId: data.userId };
      setUser(data.user);
      return { ok: true };
    } catch { return { ok: false, message: "Verbindungsfehler" }; }
  };

  const verify2fa = async (userId: string, code: string) => {
    try {
      const res = await apiRequest("POST", "/api/auth/verify-2fa", { userId, code });
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.message };
      setUser(data.user);
      return { ok: true };
    } catch { return { ok: false, message: "Verbindungsfehler" }; }
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: !!user,
      login,
      verify2fa,
      logout,
      isAdmin: user?.rolle === "admin",
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
