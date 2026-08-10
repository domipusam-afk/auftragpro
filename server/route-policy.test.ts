import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PERMISSIONS_CATALOG } from "../shared/permissions-catalog";
import { ROUTE_POLICIES, getRoutePolicy, isRoutePolicyAllowed, matchRoutePolicy, type RoutePolicy } from "./route-policy";

const routesSourcePath = path.resolve(process.cwd(), "server/routes.ts");
const routesSource = fs.readFileSync(routesSourcePath, "utf8");

type RegisteredRoute = Pick<RoutePolicy, "method" | "path"> & { line: number };

function registeredRoutes(source: string): RegisteredRoute[] {
  return [...source.matchAll(/app\.(get|post|put|patch|delete|all)\(\s*"([^"\\]+)"/g)].map((match) => ({
    method: match[1].toUpperCase() as RoutePolicy["method"],
    path: match[2],
    line: source.slice(0, match.index).split("\n").length,
  }));
}

function sourceAtLine(source: string, line: number): string {
  return source.split("\n")[line - 1] || "";
}

function actualLegacyEnforcement(source: string): "unguarded" | "guarded" {
  // Etappe 6 stellt requireAuth bereit, aber server/routes.ts importiert oder
  // registriert die Middleware absichtlich noch nicht.
  return /\b(?:requireAuth|requirePermission|createRequirePermission)\s*\(/.test(source)
    ? "guarded"
    : "unguarded";
}

const SAMPLE_EXPECTATIONS: ReadonlyArray<{
  readonly fingerprint: string;
  readonly access: RoutePolicy["access"];
  readonly permissions: readonly string[];
}> = [
  { fingerprint: "GET /api/auftraege", access: "permissions", permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"] },
  { fingerprint: "PATCH /api/auftraege/:id/status", access: "permissions", permissions: ["auftraege_anzeigen"] },
  { fingerprint: "POST /api/auftraege/:id/rechnungen", access: "permissions", permissions: ["rechnungen"] },
  { fingerprint: "GET /api/rechnungen", access: "permissions", permissions: ["rechnungen"] },
  { fingerprint: "GET /api/export/q3", access: "permissions", permissions: ["finanzmanagement_mwst"] },
  { fingerprint: "GET /api/finanzen/uebersicht", access: "permissions", permissions: ["finanzmanagement_finanzen_uebersicht"] },
  { fingerprint: "GET /api/mahnungen", access: "permissions", permissions: ["finanzmanagement_mahnwesen"] },
  { fingerprint: "GET /api/zeiteintraege", access: "permissions", permissions: ["zeiterfassung"] },
  { fingerprint: "POST /api/lohnabrechnung/pdf", access: "permissions", permissions: ["ressourcen_lohnabrechnung"] },
  { fingerprint: "POST /api/termine", access: "permissions", permissions: ["ressourcen_planung_termine"] },
  { fingerprint: "GET /api/aufgaben", access: "permissions", permissions: ["ressourcen_aufgaben"] },
  { fingerprint: "GET /api/fotos/:auftragId", access: "permissions", permissions: ["dokumente_fotodokumentation"] },
  { fingerprint: "GET /api/auftraege/:id/dokumente", access: "permissions", permissions: ["dokumente_uebersicht"] },
  { fingerprint: "POST /api/auftraege/:auftr_id/offerten", access: "permissions", permissions: ["offerten"] },
  { fingerprint: "GET /api/lager", access: "permissions", permissions: ["einkauf_lagerverwaltung"] },
  { fingerprint: "GET /api/lieferanten", access: "permissions", permissions: ["einkauf_lieferanten_material"] },
  { fingerprint: "GET /api/benutzer", access: "admin-only", permissions: [] },
  { fingerprint: "POST /api/benutzer/:id/reset-2fa", access: "admin-only", permissions: [] },
  { fingerprint: "GET /api/backup", access: "admin-only", permissions: [] },
  { fingerprint: "POST /api/email/send", access: "admin-only", permissions: [] },
  { fingerprint: "POST /api/auth/login", access: "public", permissions: [] },
  { fingerprint: "GET /api/ping", access: "public", permissions: [] },
  { fingerprint: "GET /api/public/auftrag/:token", access: "public", permissions: [] },
];

function run(): void {
  const registered = registeredRoutes(routesSource);
  const matrixFingerprints = new Set(ROUTE_POLICIES.map((policy) => `${policy.method} ${policy.path}`));
  const registeredFingerprints = new Set(registered.map((route) => `${route.method} ${route.path}`));

  assert.equal(PERMISSIONS_CATALOG.length, 36, "Der gemeinsame Katalog muss exakt die 36 bestehenden Rechte enthalten.");
  assert.equal(new Set(PERMISSIONS_CATALOG.map((permission) => permission.key)).size, 36, "Rechte-Schlüssel müssen eindeutig sein.");
  assert.equal(registered.length, 226, "Die bestätigte Anzahl der Express-Routen darf nicht unbemerkt abweichen.");
  assert.equal(ROUTE_POLICIES.length, registered.length, "Jede registrierte Route braucht genau eine Policy.");
  assert.deepEqual(matrixFingerprints, registeredFingerprints, "Matrix und server/routes.ts müssen denselben Routenbestand enthalten.");

  for (const policy of ROUTE_POLICIES) {
    assert.equal(sourceAtLine(routesSource, policy.line).includes(`app.${policy.method.toLowerCase()}(`), true, `Zeilenanker stimmt nicht für ${policy.method} ${policy.path}`);
    assert.equal(registeredFingerprints.has(`${policy.method} ${policy.path}`), true, `Route fehlt im aktuellen Code: ${policy.method} ${policy.path}`);
    assert.equal(policy.currentEnforcement, actualLegacyEnforcement(routesSource), `Ist-Zugriffsstatus stimmt nicht für ${policy.method} ${policy.path}`);
    for (const permission of policy.permissions) {
      assert.equal(PERMISSIONS_CATALOG.some((catalogPermission) => catalogPermission.key === permission), true, `Unbekanntes Recht in Matrix: ${permission}`);
    }
  }

  for (const expected of SAMPLE_EXPECTATIONS) {
    const policy = getRoutePolicy(...expected.fingerprint.split(" ", 2) as [string, string]);
    assert.ok(policy, `Stichprobenroute fehlt: ${expected.fingerprint}`);
    assert.equal(policy.access, expected.access, `Falscher Zugriffstyp für ${expected.fingerprint}`);
    assert.deepEqual(policy.permissions, expected.permissions, `Falsche Rechte für ${expected.fingerprint}`);
    assert.equal(sourceAtLine(routesSource, policy.line).includes("app."), true, `Stichprobe ist keine aktuelle Route: ${expected.fingerprint}`);
  }

  const pricePolicy = getRoutePolicy("GET", "/api/auftraege");
  assert.ok(pricePolicy);
  assert.equal(isRoutePolicyAllowed(pricePolicy, "mitarbeiter", { auftraege_anzeigen: true, auftraege_preise_sichtbar: true }), true);
  assert.equal(isRoutePolicyAllowed(pricePolicy, "mitarbeiter", { auftraege_anzeigen: true, auftraege_preise_sichtbar: false }), false);
  assert.equal(isRoutePolicyAllowed(pricePolicy, "admin", {}), true);
  assert.equal(isRoutePolicyAllowed(getRoutePolicy("GET", "/api/ping")!, undefined, undefined), true);
  assert.equal(isRoutePolicyAllowed(getRoutePolicy("GET", "/api/backup")!, "mitarbeiter", {}), false);
  assert.equal(matchRoutePolicy("GET", "/api/auftraege/123")?.path, "/api/auftraege/:id");
  assert.equal(matchRoutePolicy("PATCH", "/api/auftraege/123/status")?.path, "/api/auftraege/:id/status");
  assert.equal(matchRoutePolicy("GET", "/api/public/auftrag/token-123")?.path, "/api/public/auftrag/:token");
  assert.equal(matchRoutePolicy("GET", "/api/nicht-vorhanden"), undefined);

  const discrepancies = ROUTE_POLICIES.filter((policy) => policy.access !== "public" && policy.currentEnforcement === "unguarded");
  assert.equal(discrepancies.length, 222, "Die erwarteten, noch nicht aktivierten Ziel-Gates müssen vollständig sichtbar bleiben.");

  console.log(`Route policy checks passed: ${PERMISSIONS_CATALOG.length} permissions, ${ROUTE_POLICIES.length}/${registered.length} routes, ${SAMPLE_EXPECTATIONS.length} representative routes, ${discrepancies.length} documented inactive-gate discrepancies.`);
}

run();
