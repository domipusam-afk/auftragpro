import type { Status, Prioritaet } from "@shared/schema";

/**
 * Parst einen Zahlen-Rohtext aus einem Eingabefeld (String oder Number) robust in eine
 * Zahl. Unterstützt sowohl Punkt als auch Komma als Dezimaltrennzeichen, da Schweizer
 * Nutzer beim Tippen oft ein Komma verwenden, auch wenn CHF-Beträge üblicherweise mit
 * Punkt geschrieben werden. Gibt bei leerem/unvollständigem Text (z.B. "3.", "", "-") 0
 * zurück, statt NaN — Aufrufer sollen also NICHT zusätzlich "|| 0" auf das Ergebnis von
 * isNaN-Fällen verlassen müssen, können es aber trotzdem tun.
 *
 * WICHTIG: Diese Funktion ist nur für Berechnungen/Speichern gedacht — NIE das Ergebnis
 * zurück in den Rohtext-State des Eingabefelds schreiben (das war der Bug: das Feld hat
 * bei jedem Tastenanschlag sofort zur Zahl geparst und sich dadurch selbst verstümmelt,
 * sodass z.B. "3." oder "3,5" nie fertig eingegeben werden konnte).
 */
export function parseZahl(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const normalisiert = value.trim().replace(",", ".");
  if (normalisiert === "" || normalisiert === "-" || normalisiert === ".") return 0;
  const n = Number(normalisiert);
  return isNaN(n) ? 0 : n;
}

export function formatCHF(value: number | null | undefined, waehrung = "CHF") {
  if (value == null || isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: waehrung || "CHF",
    minimumFractionDigits: 2,
  }).format(Number(value));
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export const STATUS_BADGE: Record<Status, string> = {
  anfrage: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  angebot: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800",
  bestaetigt: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  in_arbeit: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800",
  qualitaet: "bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-200 dark:border-cyan-800",
  rechnung: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-800",
  abgeschlossen: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
  storniert: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
};

export const PRIO_BADGE: Record<Prioritaet, string> = {
  niedrig: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
  normal: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  hoch: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  dringend: "bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
};
