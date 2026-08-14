import { Link, useLocation } from "wouter";
import { ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { lsGet, lsSet, lsRemove } from "@/lib/storage";
import {
  LayoutDashboard,
  Search,
  ListChecks,
  FileText,
  Settings,
  Moon,
  Sun,
  Plus,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Clock,
  AlertTriangle,
  Calculator,
  Receipt,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight as ChevronRightSmall,
  Wallet,
  Users,
  CalendarDays,
  CalendarCheck,
  LayoutGrid,
  Camera,
  FileSignature,
  MessageSquare,
  Building2,
  FolderOpen,
  LogOut,
  ShieldCheck,
  Shield,
  FilePlus,
  Banknote,
  Umbrella,
  BarChart2,
  BarChart3,
  BadgeCheck,
  Package,
  Banknote as Banknote2,
  Wallet2,
  TrendingDown as TrendDown,
  ReceiptText,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useBranding } from "@/lib/branding";

const MAIN_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/auftraege", label: "Aufträge", icon: ListChecks },
  { href: "/zeiterfassung", label: "Zeiterfassung", icon: Clock },
  { href: "/rechnungen", label: "Rechnungen", icon: FileText },
  { href: "/offerten", label: "Offerten", icon: FilePlus },
];

// Unterpunkte unter "Aufträge" — nur sichtbar wenn Aufträge-Gruppe offen
const AUFTRAEGE_SUB_NAV = [
  { href: "/auftraege", label: "Alle Aufträge", icon: ListChecks },
];

const FINANZ_NAV = [
  { href: "/finanzen-uebersicht", label: "Finanzen-Übersicht", icon: Wallet2, berechtigung: "finanzmanagement_finanzen_uebersicht" as const },
  { href: "/mahnwesen", label: "Mahnwesen", icon: AlertTriangle, berechtigung: "finanzmanagement_mahnwesen" as const },
  { href: "/mwst", label: "MWST-Abrechnung", icon: ReceiptText, berechtigung: "finanzmanagement_mwst" as const },
  { href: "/eingangsrechnungen", label: "Eingangsrechnungen", icon: Receipt, berechtigung: "finanzmanagement_eingangsrechnungen" as const },
  { href: "/garantien", label: "Garantieübersicht", icon: BadgeCheck, berechtigung: "finanzmanagement_garantien" as const },
];


const KALKULATION_NAV = [
  { href: "/vorkalkulation-uebersicht", label: "Vorkalkulation", icon: Calculator, berechtigung: "kalkulation_vorkalkulation" as const },
  { href: "/nachkalkulation", label: "Nachkalkulation", icon: TrendingUp, berechtigung: "kalkulation_nachkalkulation" as const },
];

const RESSOURCE_NAV = [
  { href: "/mitarbeiter", label: "Mitarbeiterakte", icon: Users, berechtigung: "ressourcen_mitarbeiterakte" as const },
  { href: "/termine", label: "Planung & Termine", icon: CalendarDays, berechtigung: "ressourcen_planung_termine" as const },
  { href: "/kalender", label: "Kalender", icon: CalendarCheck, berechtigung: "ressourcen_kalender" as const },
  { href: "/plantafel", label: "Plantafel", icon: LayoutGrid, berechtigung: "ressourcen_plantafel" as const },
  { href: "/ferienplanung", label: "Ferienplanung", icon: Umbrella, berechtigung: "ressourcen_ferienplanung" as const },
  { href: "/stundenauswertung", label: "Stundenauswertung", icon: BarChart2, berechtigung: "ressourcen_stundenauswertung" as const },
  { href: "/lohnabrechnung", label: "Lohnabrechnung", icon: Banknote, berechtigung: "ressourcen_lohnabrechnung" as const },
  { href: "/aufgaben", label: "Aufgaben", icon: ClipboardCheck, berechtigung: "ressourcen_aufgaben" as const },
];

const EINKAUF_NAV = [
  { href: "/lieferanten", label: "Lieferanten & Material", icon: Package, berechtigung: "einkauf_lieferanten_material" as const },
  { href: "/lager", label: "Lagerverwaltung", icon: ReceiptText, berechtigung: "einkauf_lagerverwaltung" as const },
];

const DOKUMENT_NAV = [
  { href: "/fotodokumentation", label: "Bild-/Fotodoku", icon: Camera, berechtigung: "dokumente_fotodokumentation" as const },
  { href: "/formulare", label: "Formulare & Unterschriften", icon: FileSignature, berechtigung: "dokumente_formulare" as const },
  { href: "/chat", label: "Chat & Historie", icon: MessageSquare, berechtigung: "dokumente_chat_historie" as const },
  { href: "/kundendatencenter", label: "Kundendatencenter", icon: Building2, berechtigung: "dokumente_kundendatencenter" as const },
  { href: "/dokumente", label: "Dokumente (+40)", icon: FolderOpen, berechtigung: "dokumente_uebersicht" as const },
];

const BOTTOM_NAV = [
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
];

const ADMIN_NAV = [
  { href: "/benutzerverwaltung", label: "Benutzerverwaltung", icon: Users },
];

function Logo({ size = 36, src, alt }: { size?: number; src: string; alt: string }) {
  return src ? (
    <img
      src={src}
      alt={alt}
      style={{ width: size * 2.1, height: size, objectFit: "contain", maxWidth: "100%" }}
    />
  ) : (
    <div
      aria-label={alt}
      className="rounded-lg border border-white/30 bg-white/10 text-white font-bold flex items-center justify-center"
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.42) }}
    >
      {alt.slice(0, 1).toUpperCase()}
    </div>
  );
}

// Kalkulation Sub-Item: kein direkter Link, sondern Hinweis mit Link zur Aufträge-Liste
function KalkulationNavHint({ collapsed }: { collapsed: boolean }) {
  const [location] = useLocation();
  const active = location.includes("/kalkulation");
  if (collapsed) {
    return (
      <Link href="/auftraege">
        <a className={cn(
          "flex items-center justify-center px-2 py-2 rounded-md text-sm transition-colors",
          active ? "bg-white/10 text-white font-medium" : "text-white/80 hover:bg-white/5 hover:text-white"
        )} title="Kalkulation (Auftrag wählen)">
          <Calculator className="h-4 w-4 shrink-0" />
        </a>
      </Link>
    );
  }
  return (
    <Link href="/auftraege">
      <a className={cn(
        "flex items-center gap-3 px-3 pl-5 py-2 rounded-md text-sm transition-colors",
        active ? "bg-white/10 text-white font-medium" : "text-white/80 hover:bg-white/5 hover:text-white"
      )}>
        <Calculator className="h-4 w-4 shrink-0" />
        <span className="truncate">Kalkulation</span>
      </a>
    </Link>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  collapsed,
  indent = false,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: any;
  collapsed: boolean;
  indent?: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  const [location] = useLocation();
  const active =
    href === "/"
      ? location === "/"
      : location === href || location.startsWith(href + "/");

  return (
    <Link href={href}>
      <a
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 py-2 rounded-md text-sm transition-colors",
          collapsed ? "justify-center px-2" : indent ? "px-3 pl-5" : "px-3",
          active
            ? "bg-white/10 text-white font-medium"
            : "text-white/80 hover:bg-white/5 hover:text-white"
        )}
        title={collapsed ? label : undefined}
      >
        <div className="relative shrink-0">
          <Icon className="h-4 w-4" />
          {collapsed && badge && badge > 0 ? (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </div>
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && badge && badge > 0 ? (
          <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold leading-none">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </a>
    </Link>
  );
}

function LogoutButton({ collapsed }: { collapsed: boolean }) {
  const { logout } = useAuth();
  return (
    <button
      onClick={logout}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/70 hover:bg-red-500/20 hover:text-red-300 transition-colors",
        collapsed && "justify-center px-2"
      )}
      title={collapsed ? "Abmelden" : undefined}
    >
      <LogOut className="h-4 w-4 shrink-0" />
      {!collapsed && <span>Abmelden</span>}
    </button>
  );
}

// ─── Globale Suche ──────────────────────────────────────────────────────────
function GlobalSearch({ collapsed }: { collapsed: boolean }) {
  const { hatZugriff } = useAuth();
  const darfPreiseSehen = hatZugriff("auftraege_preise_sichtbar");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQ(""); setResults(null); }
  }, [open]);

  useEffect(() => {
    if (q.length < 2) { setResults(null); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
        const r = await fetch(`${API_BASE}/api/suche?q=${encodeURIComponent(q)}`);
        const data = await r.json();
        setResults(data);
      } catch { setResults(null); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const go = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  const hasResults = results && (
    results.auftraege?.length > 0 ||
    results.rechnungen?.length > 0 ||
    results.offerten?.length > 0 ||
    results.kunden?.length > 0
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors ${collapsed ? "justify-center px-2" : ""}`}
        title="Suche (Ctrl+K)"
        data-testid="button-global-search"
      >
        <Search className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1 text-left truncate">Suchen…</span>}
        {!collapsed && <kbd className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/40">⌘K</kbd>}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            style={{ background: "hsl(var(--sidebar))", border: "1px solid rgba(255,255,255,0.12)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
              <Search className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.5)" }} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Aufträge, Kunden, Rechnungen, Offerten…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "rgba(255,255,255,0.9)", caretColor: "white" }}
                data-testid="input-global-search"
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
              />
              {loading && <div className="h-4 w-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "rgba(255,255,255,0.4)", borderTopColor: "transparent" }} />}
              <kbd
                className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
                style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)" }}
                onClick={() => setOpen(false)}
              >Esc</kbd>
            </div>

            <div className="max-h-96 overflow-y-auto p-2">
              {q.length < 2 && (
                <div className="px-3 py-8 text-center text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Mindestens 2 Zeichen eingeben…
                </div>
              )}

              {q.length >= 2 && !loading && !hasResults && (
                <div className="px-3 py-8 text-center text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Keine Ergebnisse für „{q}"
                </div>
              )}

              {results?.auftraege?.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Aufträge</div>
                  {results.auftraege.map((a: any) => (
                    <button
                      key={a.id}
                      onClick={() => go(`/auftraege/${a.id}`)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors"
                      style={{ color: "rgba(255,255,255,0.85)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{a.nr}</span>
                          <span className="text-sm font-medium truncate">{a.titel}</span>
                        </div>
                        <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.45)" }}>{a.kunde}</div>
                      </div>
                      {darfPreiseSehen && a.angebots_betrag > 0 && (
                        <span className="text-xs font-semibold tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>CHF {Number(a.angebots_betrag).toLocaleString("de-CH")}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {results?.kunden?.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Kunden</div>
                  {results.kunden.map((k: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => go(`/auftraege/${k.auftrag_id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors"
                      style={{ color: "rgba(255,255,255,0.85)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="text-sm">{k.name}</span>
                      <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>→ {k.auftrag_nr}</span>
                    </button>
                  ))}
                </div>
              )}

              {results?.rechnungen?.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Rechnungen</div>
                  {results.rechnungen.map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => go(`/rechnungen`)}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-colors"
                      style={{ color: "rgba(255,255,255,0.85)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="font-mono text-sm">{r.nr}</span>
                      <span className="text-xs" style={{ color: r.bezahlt_am ? "rgba(134,239,172,0.8)" : "rgba(255,255,255,0.4)" }}>{r.bezahlt_am ? "✓ Bezahlt" : "Offen"}</span>
                      {darfPreiseSehen && (
                        <span className="text-xs font-semibold tabular-nums" style={{ color: "rgba(255,255,255,0.6)" }}>CHF {Number(r.betrag).toLocaleString("de-CH")}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {results?.offerten?.length > 0 && (
                <div className="mb-2">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>Offerten</div>
                  {results.offerten.map((o: any) => (
                    <button
                      key={o.id}
                      onClick={() => go(`/auftraege/${o.auftrag_id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors"
                      style={{ color: "rgba(255,255,255,0.85)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{o.nr}</span>
                      <span className="text-sm truncate">{o.titel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Mobile Drawer mit Swipe-to-close ───────────────────────────────────────────────────────────────
function MobileDrawer({ children, onClose, background }: { children: ReactNode; onClose: () => void; background: string }) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    // Swipe nach links: mindestens 60px horizontal, weniger als 80px vertikal
    if (dx < -60 && dy < 80) {
      onClose();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [onClose]);

  return (
    <div className="md:hidden fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <aside
        className="relative w-72 flex flex-col h-full overflow-y-auto"
        style={{
          background,
          color: "hsl(var(--sidebar-foreground))",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button
          className="absolute top-4 right-4 z-10 text-white/70 hover:text-white"
          onClick={onClose}
          aria-label="Menü schließen"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </aside>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const { user, isAdmin, hatZugriff } = useAuth();
  const branding = useBranding();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // App-Hintergrundbild — sofort aus localStorage, dann fresh vom Server
  const [appBg, setAppBg] = useState<string>(
    () => lsGet("ap_app_bg") || ""
  );
  // Kontrast-Overlay-Stärke (0-98), Standard 88
  const [bgKontrast, setBgKontrast] = useState<number>(
    () => {
      const stored = lsGet("ap_bg_kontrast");
      return stored !== null ? Number(stored) : 88;
    }
  );
  const { data: einstellungenList = [] } = useQuery<{ schluessel: string; wert: string }[]>({
    queryKey: ["/api/einstellungen"],
    queryFn: () => apiRequest("GET", "/api/einstellungen").then((r) => r.json()),
    staleTime: 0,
    gcTime: 0,
  });
  useEffect(() => {
    const fresh = einstellungenList.find((e) => e.schluessel === "app_hintergrund")?.wert || "";
    if (fresh !== appBg) {
      setAppBg(fresh);
      if (fresh) lsSet("ap_app_bg", fresh);
      else lsRemove("ap_app_bg");
    }
    const freshK = einstellungenList.find((e) => e.schluessel === "hintergrund_kontrast")?.wert;
    if (freshK !== undefined) {
      const n = Number(freshK);
      setBgKontrast(n);
      lsSet("ap_bg_kontrast", String(n));
    }
  }, [einstellungenList]);

  // Ungelesene Chat-Nachrichten (Polling alle 30 Sek.)
  const { data: ungelesenData } = useQuery<{ count: number }>({
    queryKey: ["/api/chat/ungelesen"],
    queryFn: () => apiRequest("GET", "/api/chat/ungelesen").then((r) => r.json()),
    refetchInterval: 30000,
    staleTime: 25000,
  });
  const ungelesenCount = ungelesenData?.count ?? 0;

  // Aufträge sub-nav: offen wenn man auf /auftraege oder /auftraege/:id/... ist
  const isOnAuftraege = location === "/auftraege" || location.startsWith("/auftraege/");
  const [auftraegeOpen, setAuftraegeOpen] = useState(isOnAuftraege);

  const [kalkulationOpen, setKalkulationOpen] = useState(
    KALKULATION_NAV.some((n) => location === n.href || location.startsWith(n.href + "/"))
  );
  const [finanzOpen, setFinanzOpen] = useState(
    FINANZ_NAV.some((n) => location === n.href || location.startsWith(n.href + "/"))
  );
  const [ressourceOpen, setRessourceOpen] = useState(
    RESSOURCE_NAV.some(
      (n) => location === n.href || location.startsWith(n.href + "/")
    )
  );
  const [dokumentOpen, setDokumentOpen] = useState(
    DOKUMENT_NAV.some((n) => location === n.href || location.startsWith(n.href + "/"))
  );
  const [einkaufOpen, setEinkaufOpen] = useState(
    EINKAUF_NAV.some((n) => location === n.href || location.startsWith(n.href + "/"))
  );

  // Mobile: Menü schließt NICHT automatisch bei Routenwechsel — nur manuell (Overlay, X, Swipe)
  // useEffect(() => { setMobileOpen(false); }, [location]); // <-- absichtlich deaktiviert

  useEffect(() => {
    const handleResize = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>("[data-testid='button-global-search']")?.click();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-open groups when navigating to their pages
  useEffect(() => {
    if (location === "/auftraege" || location.startsWith("/auftraege/")) setAuftraegeOpen(true);
    if (FINANZ_NAV.some((n) => location === n.href)) setFinanzOpen(true);
    if (RESSOURCE_NAV.some((n) => location === n.href)) setRessourceOpen(true);
    if (DOKUMENT_NAV.some((n) => location === n.href)) setDokumentOpen(true);
    if (EINKAUF_NAV.some((n) => location === n.href)) setEinkaufOpen(true);
  }, [location]);

  const SidebarContent = ({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) => {
    const show = mobile || !collapsed;
    return (
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className={cn("px-3 pt-4 pb-3 flex flex-col items-center gap-1.5", !show && "px-2")}>
          <Logo size={show ? 48 : 32} src={branding.firmenlogo} alt={branding.firmenname} />
          {show && (
            <div className="font-bold text-sm leading-tight text-center w-full" style={{ fontFamily: 'var(--font-display)', color: 'hsl(var(--sidebar-foreground))' }}>
              {branding.firmenname}
            </div>
          )}
        </div>

        {/* Globale Suche */}
        <div className="px-2 pb-1 pt-1">
          <GlobalSearch collapsed={!show} />
        </div>

        {/* Main Nav */}
        <nav className="flex flex-col gap-0.5 px-2">
          {/* Dashboard */}
          <NavItem href="/" label="Dashboard" icon={LayoutDashboard} collapsed={!show} />

          {/* Aufträge — direkter Link, kein Untermenü (nur ein einziger Unterpunkt vorhanden) */}
          {hatZugriff("auftraege") && show && (
            <NavItem href="/auftraege" label="Aufträge" icon={ListChecks} collapsed={false} />
          )}
          {/* Sidebar eingeklappt: nur Icon */}
          {hatZugriff("auftraege") && !show && (
            <NavItem href="/auftraege" label="Aufträge" icon={ListChecks} collapsed={true} />
          )}

          {/* Zeiterfassung */}
          {hatZugriff("zeiterfassung") && <NavItem href="/zeiterfassung" label="Zeiterfassung" icon={Clock} collapsed={!show} />}

          {/* Rechnungen (Admin oder mit Berechtigung) */}
          {(isAdmin || hatZugriff("rechnungen")) && <NavItem href="/rechnungen" label="Rechnungen" icon={FileText} collapsed={!show} />}

          {/* Offerten */}
          {hatZugriff("offerten") && <NavItem href="/offerten" label="Offerten" icon={FilePlus} collapsed={!show} />}
        </nav>


        {/* Kalkulation */}
        {(isAdmin || hatZugriff("kalkulation")) && (
        <div className="px-2 mt-1">
          {show ? (
            <>
              <button
                onClick={() => setKalkulationOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors uppercase tracking-wider"
              >
                <Calculator className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">Kalkulation</span>
                {kalkulationOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRightSmall className="h-3 w-3" />}
              </button>
              {kalkulationOpen && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {KALKULATION_NAV.filter((item) => isAdmin || hatZugriff(item.berechtigung)).map(({ berechtigung: _berechtigung, ...item }) => <NavItem key={item.href} {...item} collapsed={false} indent />)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="my-2 border-t border-white/10" />
              {KALKULATION_NAV.filter((item) => isAdmin || hatZugriff(item.berechtigung)).map(({ berechtigung: _berechtigung, ...item }) => <NavItem key={item.href} {...item} collapsed={true} />)}
            </>
          )}
        </div>
        )}

        {/* Finanzmanagement — nur für Admins oder mit Berechtigung */}
        {(isAdmin || hatZugriff("finanzmanagement")) && (
        <div className="px-2 mt-2">
          {show ? (
            <>
              <button
                onClick={() => setFinanzOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors uppercase tracking-wider"
              >
                <Wallet className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">Finanzmanagement</span>
                {finanzOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRightSmall className="h-3 w-3" />}
              </button>
              {finanzOpen && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {FINANZ_NAV.filter((item) => isAdmin || hatZugriff(item.berechtigung)).map(({ berechtigung: _berechtigung, ...item }) => <NavItem key={item.href} {...item} collapsed={false} indent />)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="my-2 border-t border-white/10" />
              {FINANZ_NAV.filter((item) => isAdmin || hatZugriff(item.berechtigung)).map(({ berechtigung: _berechtigung, ...item }) => <NavItem key={item.href} {...item} collapsed={true} />)}
            </>
          )}
        </div>
        )}

        {/* Einkauf Group */}
        {(isAdmin || hatZugriff("einkauf")) && (
        <div className="px-2 mt-1">
          {show ? (
            <>
              <button
                onClick={() => setEinkaufOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors uppercase tracking-wider"
              >
                <Package className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">Einkauf</span>
                {einkaufOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRightSmall className="h-3 w-3" />}
              </button>
              {einkaufOpen && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {EINKAUF_NAV.filter((item) => isAdmin || hatZugriff(item.berechtigung)).map(({ berechtigung: _berechtigung, ...item }) => <NavItem key={item.href} {...item} collapsed={false} indent />)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="my-2 border-t border-white/10" />
              {EINKAUF_NAV.filter((item) => isAdmin || hatZugriff(item.berechtigung)).map(({ berechtigung: _berechtigung, ...item }) => <NavItem key={item.href} {...item} collapsed={true} />)}
            </>
          )}
        </div>
        )}

        {/* Dokumentenmanagement Group */}
        {hatZugriff("dokumente") && <div className="px-2 mt-1">
          {show ? (
            <>
              <button
                onClick={() => setDokumentOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors uppercase tracking-wider"
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">Dokumente</span>
                {ungelesenCount > 0 && (
                  <span className="bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none mr-1">
                    {ungelesenCount > 99 ? "99+" : ungelesenCount}
                  </span>
                )}
                {dokumentOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRightSmall className="h-3 w-3" />}
              </button>
              {dokumentOpen && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {DOKUMENT_NAV.filter((item) => isAdmin || hatZugriff(item.berechtigung)).map(({ berechtigung: _berechtigung, ...item }) => (
                    <NavItem
                      key={item.href}
                      {...item}
                      collapsed={false}
                      indent
                      badge={item.href === "/chat" ? ungelesenCount : undefined}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="my-2 border-t border-white/10" />
              {DOKUMENT_NAV.filter((item) => isAdmin || hatZugriff(item.berechtigung)).map(({ berechtigung: _berechtigung, ...item }) => (
                <NavItem
                  key={item.href}
                  {...item}
                  collapsed={true}
                  badge={item.href === "/chat" ? ungelesenCount : undefined}
                />
              ))}
            </>
          )}
        </div>}

        {/* Ressourcenmanagement — sichtbar, sobald mindestens ein Unterpunkt erlaubt ist. */}
        {(isAdmin || hatZugriff("ressourcen")) && <div className="px-2 mt-1">
          {show ? (
            <>
              <button
                onClick={() => setRessourceOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors uppercase tracking-wider"
              >
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">Ressourcen</span>
                {ressourceOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRightSmall className="h-3 w-3" />}
              </button>
              {ressourceOpen && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {RESSOURCE_NAV.filter((item) => isAdmin || hatZugriff(item.berechtigung)).map(({ berechtigung: _berechtigung, ...item }) => <NavItem key={item.href} {...item} collapsed={false} indent />)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="my-2 border-t border-white/10" />
              {RESSOURCE_NAV.filter((item) => isAdmin || hatZugriff(item.berechtigung)).map(({ berechtigung: _berechtigung, ...item }) => <NavItem key={item.href} {...item} collapsed={true} />)}
            </>
          )}
        </div>}

        {/* New Order Button */}
        <div className={cn("px-2 mt-4", !show && "px-2")}>
          <Link href="/neu">
            <a>
              <Button
                className="w-full bg-secondary hover:bg-secondary/90 text-white"
                size="sm"
                title={!show ? "Neuer Auftrag" : undefined}
              >
                <Plus className="h-4 w-4 shrink-0" />
                {show && <span className="ml-2">Neuer Auftrag</span>}
              </Button>
            </a>
          </Link>
        </div>

        {/* Bottom Nav */}
        <div className="mt-auto px-2 pb-1">
          {/* Admin only: Benutzerverwaltung */}
          {isAdmin && ADMIN_NAV.map((item) => (
            <NavItem key={item.href} {...item} collapsed={!show} />
          ))}

          {/* Einstellungen — nur Admin oder mit Berechtigung */}
          {(isAdmin || hatZugriff("einstellungen")) && BOTTOM_NAV.map((item) => (
            <NavItem key={item.href} {...item} collapsed={!show} />
          ))}

          {user?.ist_super_admin === true && (
            <NavItem href="/super-admin" label="System-Verwaltung" icon={Shield} collapsed={!show} />
          )}

          {/* Eingeloggter Benutzer */}
          {show && user && (
            <div className="px-3 py-1.5 text-xs text-white/40 truncate">
              {user.benutzername.split("@")[0]}
              <span className="ml-1 opacity-60">({user.rolle})</span>
            </div>
          )}

          {/* Logout */}
          <LogoutButton collapsed={!show} />

          {/* Theme Toggle */}
          <button
            onClick={toggle}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors",
              !show && "justify-center px-2"
            )}
            title={!show ? (theme === "dark" ? "Helles Theme" : "Dunkles Theme") : undefined}
          >
            {theme === "dark" ? (
              <><Sun className="h-4 w-4 shrink-0" />{show && " Helles Theme"}</>
            ) : (
              <><Moon className="h-4 w-4 shrink-0" />{show && " Dunkles Theme"}</>
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ── DESKTOP SIDEBAR ── */}
      <aside
        className={cn(
          "hidden md:flex flex-col relative transition-all duration-300 shrink-0",
          collapsed ? "w-[60px]" : "w-60"
        )}
        style={{
          background: branding.farbePrimaer,
          color: "hsl(var(--sidebar-foreground))",
          borderRight: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <SidebarContent />
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-foreground shadow-sm hover:bg-muted transition-colors"
          title={collapsed ? "Menü ausklappen" : "Menü einklappen"}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {/* ── MOBILE HEADER ── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center h-14 px-4 gap-3"
        style={{
          background: branding.farbePrimaer,
          color: "hsl(var(--sidebar-foreground))",
          borderBottom: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        <button onClick={() => setMobileOpen(true)} className="text-white/80 hover:text-white" aria-label="Menü öffnen">
          <Menu className="h-5 w-5" />
        </button>
        <Logo size={28} src={branding.firmenlogo} alt={branding.firmenname} />
        <div className="font-bold text-sm truncate min-w-0" style={{ fontFamily: "var(--font-display)" }}>{branding.firmenname}</div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Chat Badge im Mobile Header */}
          <Link href="/chat">
            <a className="relative text-white/80 hover:text-white" title="Chat & Historie">
              <MessageSquare className="h-5 w-5" />
              {ungelesenCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none">
                  {ungelesenCount > 99 ? "99+" : ungelesenCount}
                </span>
              )}
            </a>
          </Link>
          <Link href="/neu">
            <a>
              <Button size="sm" className="bg-secondary hover:bg-secondary/90 text-white h-8 px-3">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </a>
          </Link>
        </div>
      </div>

      {/* ── MOBILE DRAWER ── */}
      {mobileOpen && (
        <MobileDrawer onClose={() => setMobileOpen(false)} background={branding.farbePrimaer}>
          <SidebarContent mobile />
        </MobileDrawer>
      )}

      {/* ── MAIN CONTENT ── */}
      <main
        className="flex-1 min-w-0 overflow-x-hidden md:pt-0 pt-14"
        style={appBg
          ? {
              backgroundImage: `url(${appBg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
            }
          : undefined
        }
      >
        {/* Weisser Overlay damit Inhalt immer lesbar ist — Stärke per Einstellung */}
        <div
          id="ap-bg-overlay"
          className="min-h-full"
          style={appBg ? { backgroundColor: `rgba(255,255,255,${bgKontrast / 100})` } : undefined}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
