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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

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
  { href: "/mahnwesen", label: "Mahnwesen", icon: AlertTriangle },
  { href: "/mwst", label: "MWST-Abrechnung", icon: ReceiptText },
  { href: "/eingangsrechnungen", label: "Eingangsrechnungen", icon: Receipt },
  { href: "/garantien", label: "Garantieübersicht", icon: BadgeCheck },
];


const KALKULATION_NAV = [
  { href: "/vorkalkulation-uebersicht", label: "Vorkalkulation", icon: Calculator },
  { href: "/nachkalkulation", label: "Nachkalkulation", icon: TrendingUp },
];

const RESSOURCE_NAV = [
  { href: "/mitarbeiter", label: "Mitarbeiterakte", icon: Users },
  { href: "/termine", label: "Planung & Termine", icon: CalendarDays },
  { href: "/kalender", label: "Kalender", icon: CalendarCheck },
  { href: "/plantafel", label: "Plantafel", icon: LayoutGrid },
  { href: "/ferienplanung", label: "Ferienplanung", icon: Umbrella },
  { href: "/stundenauswertung", label: "Stundenauswertung", icon: BarChart2 },
  { href: "/lohnabrechnung", label: "Lohnabrechnung", icon: Banknote },
];

const EINKAUF_NAV = [
  { href: "/lieferanten", label: "Lieferanten & Material", icon: Package },
  { href: "/lager", label: "Lagerverwaltung", icon: ReceiptText },
];

const DOKUMENT_NAV = [
  { href: "/fotodokumentation", label: "Bild-/Fotodoku", icon: Camera },
  { href: "/formulare", label: "Formulare & Unterschriften", icon: FileSignature },
  { href: "/chat", label: "Chat & Historie", icon: MessageSquare },
  { href: "/kundendatencenter", label: "Kundendatencenter", icon: Building2 },
  { href: "/dokumente", label: "Dokumente (+40)", icon: FolderOpen },
];

const BOTTOM_NAV = [
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
];

const ADMIN_NAV = [
  { href: "/benutzerverwaltung", label: "Benutzerverwaltung", icon: Users },
];

function Logo({ size = 36 }: { size?: number }) {
  const aspectRatio = 330 / 158;
  const w = size * aspectRatio;
  return (
    <img
      src="data:image/jpeg;base64,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"
      alt="Schneggenburger GmbH"
      style={{ width: w, height: size, objectFit: 'contain', maxWidth: '100%' }}
    />
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
                      {a.angebots_betrag > 0 && (
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
                      <span className="text-xs font-semibold tabular-nums" style={{ color: "rgba(255,255,255,0.6)" }}>CHF {Number(r.betrag).toLocaleString("de-CH")}</span>
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
function MobileDrawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
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
          background: "hsl(var(--sidebar))",
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
    RESSOURCE_NAV.some((n) => location === n.href || location.startsWith(n.href + "/"))
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
          <Logo size={show ? 48 : 32} />
          {show && (
            <div className="font-bold text-sm leading-tight text-center w-full" style={{ fontFamily: 'var(--font-display)', color: 'hsl(var(--sidebar-foreground))' }}>
              Schneggenburger GmbH
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

          {/* Aufträge mit aufklappbarem Untermenü */}
          {hatZugriff("auftraege") && show && (
            <div>
              <button
                onClick={() => setAuftraegeOpen((o) => !o)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  (location === "/auftraege" || location.startsWith("/auftraege/"))
                    ? "bg-white/10 text-white font-medium"
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                )}
              >
                <ListChecks className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Aufträge</span>
                {auftraegeOpen
                  ? <ChevronDown className="h-3 w-3 shrink-0" />
                  : <ChevronRightSmall className="h-3 w-3 shrink-0" />}
              </button>
              {auftraegeOpen && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  <NavItem href="/auftraege" label="Alle Aufträge" icon={ListChecks} collapsed={false} indent />
                </div>
              )}
            </div>
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
                  {KALKULATION_NAV.map((item) => <NavItem key={item.href} {...item} collapsed={false} indent />)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="my-2 border-t border-white/10" />
              {KALKULATION_NAV.map((item) => <NavItem key={item.href} {...item} collapsed={true} />)}
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
                  {FINANZ_NAV.map((item) => <NavItem key={item.href} {...item} collapsed={false} indent />)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="my-2 border-t border-white/10" />
              {FINANZ_NAV.map((item) => <NavItem key={item.href} {...item} collapsed={true} />)}
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
                  {EINKAUF_NAV.map((item) => <NavItem key={item.href} {...item} collapsed={false} indent />)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="my-2 border-t border-white/10" />
              {EINKAUF_NAV.map((item) => <NavItem key={item.href} {...item} collapsed={true} />)}
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
                  {DOKUMENT_NAV.map((item) => (
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
              {DOKUMENT_NAV.map((item) => (
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

        {/* Ressourcenmanagement Group */}
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
                  {RESSOURCE_NAV.map((item) => <NavItem key={item.href} {...item} collapsed={false} indent />)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="my-2 border-t border-white/10" />
              {RESSOURCE_NAV.map((item) => <NavItem key={item.href} {...item} collapsed={true} />)}
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
          background: "hsl(var(--sidebar))",
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
          background: "hsl(var(--sidebar))",
          color: "hsl(var(--sidebar-foreground))",
          borderBottom: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        <button onClick={() => setMobileOpen(true)} className="text-white/80 hover:text-white" aria-label="Menü öffnen">
          <Menu className="h-5 w-5" />
        </button>
        <Logo size={28} />
        <div className="font-bold text-sm" style={{ fontFamily: "var(--font-display)" }}>Schneggenburger GmbH</div>
        <div className="ml-auto flex items-center gap-2">
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
        <MobileDrawer onClose={() => setMobileOpen(false)}>
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

