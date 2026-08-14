import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

export type Branding = {
  firmenname: string;
  firmenlogo: string;
  farbePrimaer: string;
  produktname: string;
};

type Einstellung = { schluessel: string; wert: string | null };

export const NEUTRALES_BRANDING: Branding = {
  firmenname: "AuftragsPro",
  firmenlogo: "",
  farbePrimaer: "#44546a",
  produktname: "AuftragsPro",
};

const BrandingContext = createContext<Branding>(NEUTRALES_BRANDING);

function brandingFromSettings(rows: Einstellung[]): Branding {
  const settings = new Map(rows.map((row) => [row.schluessel, row.wert?.trim() ?? ""]));

  return {
    firmenname: settings.get("firmenname") || NEUTRALES_BRANDING.firmenname,
    firmenlogo: settings.get("firmenlogo") || "",
    farbePrimaer: settings.get("farbe_primaer") || NEUTRALES_BRANDING.farbePrimaer,
    produktname: settings.get("produktname") || NEUTRALES_BRANDING.produktname,
  };
}

/**
 * Loads non-sensitive, tenant-scoped branding only after authentication.  The
 * neutral fallback deliberately contains no customer brand, so a newly created
 * tenant can never inherit another tenant's logo or company name in the UI.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn, user } = useAuth();
  const { data = [] } = useQuery<Einstellung[]>({
    // The account ID is part of the cache key so a quick logout/login can
    // never briefly render the previous tenant's cached company identity.
    queryKey: ["/api/einstellungen", user?.id],
    queryFn: () => apiRequest("GET", "/api/einstellungen").then((response) => response.json()),
    enabled: isLoggedIn,
    staleTime: 0,
  });

  return (
    <BrandingContext.Provider value={isLoggedIn ? brandingFromSettings(data) : NEUTRALES_BRANDING}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
