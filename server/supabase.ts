import { createClient } from "@supabase/supabase-js";
import WS from "ws";
import {
  DEFAULT_TENANT_SLUG,
  getDefaultTenantId,
  recordTenantReadObservation,
  TENANCY_MODE,
} from "./tenant-context";

// Fallback-Werte für Render-Deployment (werden durch ENV-Variablen überschrieben)
const SUPABASE_URL_FALLBACK = "https://rbklkyozbefdjzaufszk.supabase.co";
const SUPABASE_KEY_FALLBACK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJia2xreW96YmVmZGp6YXVmc3prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Njk1MTUsImV4cCI6MjA5NDE0NTUxNX0.gcFKMlHay24dzaWZnL0y-oLrVDjGDoFTKmt0z_sTDsc";

const url = process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK;
const key = process.env.SUPABASE_ANON_KEY || SUPABASE_KEY_FALLBACK;

console.log("Supabase URL:", url.substring(0, 40) + "...");

const rawSupabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: {
    // ws polyfill for Node < 22
    transport: WS as unknown as typeof WebSocket,
  },
});

const TENANT_TABLES = new Set([
  "auftraege",
  "verlauf",
  "notizen",
  "dokumente",
  "dokument_daten",
  "rechnungen",
  "zeiteintraege",
  "mahnungen",
  "kalkulationen",
  "eingangsrechnungen",
  "offerten",
  "auftrag_kommentare",
  "garantien",
  "tagesrapporte",
  "reklamationen",
  "liefertermine",
  "auftrag_schritte",
  "auftrag_schritt_fotos",
  "auftrag_positionen",
  "aufgaben",
  "rechnungsvorlagen",
  "foto_dokumentation",
  "formulare",
  "chat_nachrichten",
  "pdf_vorlagen",
  "kunden",
  "mitarbeiter",
  "termine",
  "plantafel",
  "ferien",
  "lieferanten",
  "materialbestellungen",
  "stundensaetze",
  "einstellungen",
  "auftrag_status_pipeline",
  "lager_artikel",
  "lager_buchungen",
  "subunternehmer",
  "vorkalkulation_stunden",
  "vorkalkulation_material",
  "vorkalkulation_hilfsmaterial",
  "vorkalkulation_hauptmaterial_flaeche",
  "vorkalkulation_fremdleistungen",
  "vorkalkulation_soek",
  "vorkalkulation_config",
  "vorkalkulation",
  "vk_hauptmaterial",
  "vk_hilfsmaterial",
  "vk_fremdleistungen",
  "vk_stunden",
  "vk_soek",
  "nachkalkulation",
  "nk_positionen",
  "nk_stunden",
  "nachkalkulation_stunden",
  "nachkalkulation_material",
  "nachkalkulation_fremdleistungen",
  "nachkalkulation_soek",
]);

type InsertRow = Record<string, unknown>;
type InsertPayload = InsertRow | InsertRow[];

function isInsertRow(value: unknown): value is InsertRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addDefaultTenantId(table: string, payload: InsertPayload): InsertPayload {
  if (!TENANT_TABLES.has(table)) return payload;

  const defaultTenantId = getDefaultTenantId();
  let addedRows = 0;
  const addToRow = (row: InsertRow): InsertRow => {
    // Preserve an explicitly supplied tenant. Null and undefined still need the
    // default so future inserts cannot reintroduce tenant-less rows.
    if (row.tenant_id != null) return row;
    addedRows += 1;
    return { ...row, tenant_id: defaultTenantId };
  };

  const enriched = Array.isArray(payload)
    ? payload.map((row) => (isInsertRow(row) ? addToRow(row) : row)) as InsertPayload
    : addToRow(payload);

  if (addedRows > 0 && TENANCY_MODE === "observe") {
    console.warn(
      `[TENANCY_OBSERVE] Added default tenant_id to ${addedRows} insert row(s) for ${table}.`,
    );
  }

  return enriched;
}

type QueryOperation = "unknown" | "read" | "write";

interface QueryState {
  operation: QueryOperation;
  includesTenantId: boolean;
}

function selectIncludesTenantId(columns: unknown): boolean {
  if (typeof columns !== "string") return true;
  return columns === "*" || /\btenant_id\b/.test(columns);
}

function observeTenantRead(table: string, data: unknown, includesTenantId: boolean): void {
  if (TENANCY_MODE !== "observe") return;

  const rows = Array.isArray(data) ? data : data == null ? [] : [data];
  let present = 0;
  let missing = 0;
  let unavailable = 0;

  for (const row of rows) {
    if (!isInsertRow(row) || !includesTenantId || !Object.prototype.hasOwnProperty.call(row, "tenant_id")) {
      unavailable += 1;
    } else if (row.tenant_id == null) {
      missing += 1;
    } else {
      present += 1;
    }
  }

  // Explicit projections that omit tenant_id cannot be measured without
  // changing the query result. Count those rows as unavailable rather than
  // misreporting them as NULL; no response data is changed in observe mode.
  recordTenantReadObservation(present, missing, unavailable);
}

// All route code imports this module's default client. Intercepting from(...).insert
// and upsert here keeps the Stage-5 safeguard central without changing existing
// route payloads, API responses, or SELECT/UPDATE/DELETE behavior.
function tenantAwareQuery(
  query: any,
  table: string,
  state: QueryState = { operation: "unknown", includesTenantId: false },
): any {
  if (!query || typeof query !== "object") return query;

  return new Proxy(query, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (property === "insert" || property === "upsert") {
        return (payload: InsertPayload, ...args: unknown[]) => {
          const enriched = addDefaultTenantId(table, payload);
          return tenantAwareQuery(value.call(target, enriched, ...args), table, {
            operation: "write",
            includesTenantId: state.includesTenantId,
          });
        };
      }

      if (property === "select") {
        return (...args: unknown[]) => tenantAwareQuery(value.apply(target, args), table, {
          operation: state.operation === "unknown" ? "read" : state.operation,
          includesTenantId: state.operation === "unknown"
            ? selectIncludesTenantId(args[0])
            : state.includesTenantId,
        });
      }

      if (property === "update" || property === "delete") {
        return (...args: unknown[]) => tenantAwareQuery(value.apply(target, args), table, {
          operation: "write",
          includesTenantId: state.includesTenantId,
        });
      }

      if (property === "then" && state.operation === "read" && TENANT_TABLES.has(table)) {
        return (onFulfilled?: (result: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          value.call(
            target,
            (result: { data?: unknown }) => {
              observeTenantRead(table, result?.data, state.includesTenantId);
              return typeof onFulfilled === "function" ? onFulfilled(result) : result;
            },
            onRejected,
          );
      }

      if (typeof value === "function") {
        return (...args: unknown[]) => tenantAwareQuery(value.apply(target, args), table, state);
      }

      return value;
    },
  });
}

const supabase = new Proxy(rawSupabase, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);

    if (property === "from") {
      return (table: string) => tenantAwareQuery(value.call(target, table), table);
    }

    return typeof value === "function" ? value.bind(target) : value;
  },
});

export async function initializeTenantContext(): Promise<void> {
  console.log(
    `[TENANCY_OBSERVE] Tenant context initialized for ${DEFAULT_TENANT_SLUG}; mode=${TENANCY_MODE}.`,
  );
}

export default supabase;
