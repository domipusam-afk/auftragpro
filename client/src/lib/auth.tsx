import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiRequest, API_BASE } from "./queryClient";
import { lsGet, lsSet } from "./storage";
import { clearAccessToken, onApiUnauthorized, setAccessToken } from "./api-auth";
import { clearAdminSessionToken } from "./super-admin-api";
import { hatZugriff as checkZugriff, BerechtigungKey } from "./permissions";

export type Rolle = "admin" | "mitarbeiter";

export interface AppUser {
  id: string;
  benutzername: string;
  rolle: Rolle;
  berechtigungen: string | null;
  ist_super_admin?: boolean;
}

interface AuthContextType {
  user: AppUser | null;
  isLoggedIn: boolean;
  login: (benutzername: string, passwort: string) => Promise<{ ok: boolean; requires2fa?: boolean; userId?: string; message?: string; gesperrt?: boolean; minutenNoch?: number }>;
  verify2fa: (userId: string, code: string, geraetMerken?: boolean, benutzername?: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
  isAdmin: boolean;
  hatZugriff: (berechtigung: BerechtigungKey) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoggedIn: false,
  login: async () => ({ ok: false }),
  verify2fa: async () => ({ ok: false } as { ok: boolean; message?: string }),
  logout: () => {},
  isAdmin: false,
  hatZugriff: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Nutzerprofil bleibt im React-State; der Supabase access_token liegt für API-Header im bestehenden sicheren Storage-Wrapper.
  const [user, setUser] = useState<AppUser | null>(null);

  const login = async (benutzername: string, passwort: string) => {
    try {
      // Vertrauens-Token aus persistentem Speicher lesen
      const vertrauensToken = lsGet(`ap_vt_${benutzername}`) || undefined;
      // Direkter fetch statt apiRequest: apiRequest wirft bei jedem Nicht-2xx-
      // Status einen Error, bevor die JSON-Antwort gelesen werden kann — damit
      // gingen Server-Meldungen wie "Versuche verbleibend" oder "Konto
      // gesperrt" verloren und es wurde nur "Verbindungsfehler" angezeigt.
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benutzername, passwort, vertrauensToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: data.message, gesperrt: data.gesperrt, minutenNoch: data.minutenNoch };
      if (data.requires2fa) return { ok: true, requires2fa: true, userId: data.userId };
      if (data.session?.access_token) setAccessToken(data.session.access_token);
      else clearAccessToken();
      setUser(data.user);
      return { ok: true };
    } catch { return { ok: false, message: "Verbindungsfehler" }; }
  };

  const verify2fa = async (userId: string, code: string, geraetMerken?: boolean, benutzername?: string) => {
    try {
      const res = await apiRequest("POST", "/api/auth/verify-2fa", { userId, code, geraetMerken: !!geraetMerken });
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.message };
      // Vertrauens-Token speichern wenn Gerät gemerkt werden soll
      if (geraetMerken && data.vertrauensToken && benutzername) {
        lsSet(`ap_vt_${benutzername}`, data.vertrauensToken);
      }
      clearAccessToken();
      setUser(data.user);
      return { ok: true };
    } catch { return { ok: false, message: "Verbindungsfehler" }; }
  };

  const logout = () => {
    clearAccessToken();
    clearAdminSessionToken();
    setUser(null);
  };

  useEffect(() => onApiUnauthorized(() => {
    clearAccessToken();
    clearAdminSessionToken();
    setUser(null);
  }), []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: !!user,
      login,
      verify2fa,
      logout,
      isAdmin: user?.rolle === "admin",
      hatZugriff: (berechtigung: BerechtigungKey) => checkZugriff(user?.rolle || "", user?.berechtigungen || null, berechtigung),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
