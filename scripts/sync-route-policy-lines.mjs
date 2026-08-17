#!/usr/bin/env node
// Aktualisiert die `line:`-Anker in server/route-policy.ts, indem die
// tatsaechlichen Zeilennummern der Route-Registrierungen aus server/routes.ts
// (source-Standard) und server/super-admin/routes.ts (source: "super-admin")
// gelesen werden. Nur `line:`-Werte werden veraendert, sonst nichts.
import { readFileSync, writeFileSync } from "node:fs";

const ROUTES_FILES = {
  default: "server/routes.ts",
  "super-admin": "server/super-admin/routes.ts",
};
const POLICY = "server/route-policy.ts";

function pathToRegex(path) {
  // /api/x/:id -> ^/api/x/[^/]+$; used only for match count sanity
  return path.replace(/:[a-zA-Z0-9_]+/g, "[a-zA-Z0-9_-]+");
}

function collectRoutes(file) {
  const src = readFileSync(file, "utf8").split(/\r?\n/);
  // Match app.<method>("<path>" ; wenn Pfad direkt danach
  const rxSame = /^\s*app\.(get|post|patch|put|delete)\(\s*["`]([^"`]+)["`]/;
  // Match app.<method>( am Zeilenende → Pfad steht auf naechster Zeile
  const rxOpen = /^\s*app\.(get|post|patch|put|delete)\(\s*$/;
  const rxPathOnly = /^\s*["`]([^"`]+)["`]/;
  const list = [];
  for (let i = 0; i < src.length; i++) {
    const line = src[i];
    const mSame = line.match(rxSame);
    if (mSame) {
      list.push({ method: mSame[1].toUpperCase(), path: mSame[2], line: i + 1 });
      continue;
    }
    const mOpen = line.match(rxOpen);
    if (mOpen && i + 1 < src.length) {
      const mPath = src[i + 1].match(rxPathOnly);
      if (mPath) list.push({ method: mOpen[1].toUpperCase(), path: mPath[1], line: i + 1 });
    }
  }
  return list;
}

const routesBySource = {
  default: collectRoutes(ROUTES_FILES.default),
  "super-admin": collectRoutes(ROUTES_FILES["super-admin"]),
};

// Fuer schnelles Nachschlagen: Map method+path -> Array von Vorkommen (Zeilen).
function toMap(list) {
  const m = new Map();
  for (const r of list) {
    const key = `${r.method} ${r.path}`;
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(r.line);
  }
  return m;
}
const mapsBySource = {
  default: toMap(routesBySource.default),
  "super-admin": toMap(routesBySource["super-admin"]),
};

let policySrc = readFileSync(POLICY, "utf8");

// Zeile fuer Zeile durchgehen; nur Policy-Eintraege veraendern.
const outLines = policySrc.split(/\r?\n/);
let changed = 0;
let unresolved = [];
for (let i = 0; i < outLines.length; i++) {
  const line = outLines[i];
  // Ein Policy-Eintrag hat method, path und line auf derselben Zeile:
  const entryRx = /\{\s*method:\s*"([A-Z]+)"\s*,\s*path:\s*"([^"]+)"\s*,\s*line:\s*(\d+)(.*?source:\s*"([^"]+)")?/;
  const m = line.match(entryRx);
  if (!m) continue;
  const method = m[1];
  const path = m[2];
  const source = m[5] || "default";
  const map = mapsBySource[source] || mapsBySource.default;
  const candidates = map.get(`${method} ${path}`) || [];
  if (candidates.length === 0) {
    unresolved.push(`${source}: ${method} ${path}`);
    continue;
  }
  // Wenn mehrere Vorkommen existieren, waehle das naechstliegende (im Vergleich
  // zum bisherigen Wert), damit doppelte Registrierungen weiter stabil bleiben.
  const oldLine = parseInt(m[3], 10);
  let best = candidates[0];
  let bestDist = Math.abs(best - oldLine);
  for (const c of candidates) {
    const d = Math.abs(c - oldLine);
    if (d < bestDist) { best = c; bestDist = d; }
  }
  if (best !== oldLine) {
    outLines[i] = line.replace(/line:\s*\d+/, `line: ${best}`);
    changed++;
  }
}

if (unresolved.length > 0) {
  console.error("Konnte diese Routen in den Sources nicht finden:");
  for (const u of unresolved) console.error("  - " + u);
  process.exit(2);
}

writeFileSync(POLICY, outLines.join("\n"));
console.log(`Sync fertig: ${changed} Zeilen aktualisiert.`);
