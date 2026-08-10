/**
 * Etappe 9: productive import of the three confirmed legacy accounts.
 *
 * This script deliberately uses the Supabase Auth Admin API for auth.users and
 * the service-role PostgREST API for tenant_memberships. The production
 * orchestrator must run the documented privileged execute_sql pre- and
 * post-checks immediately around this script. Supabase's Management
 * execute_sql connector is not available to a standalone repository script.
 *
 * The service-role key is read only from SUPABASE_SERVICE_ROLE_KEY at runtime.
 * It is never read from a file, logged, or included in the generated report.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run auth:import:production -- --execute \
 *     --report /absolute/path/production-import-report.md
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient, type User } from "@supabase/supabase-js";
import WebSocket from "ws";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

type SupabaseAdminClient = ReturnType<typeof createClient<any>>;

const PROJECT_REF = "rbklkyozbefdjzaufszk";
const DEFAULT_SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const DEFAULT_BACKUP_PATH = "/home/user/workspace/backup_2026-08-10/app_benutzer.json";
const DEFAULT_TENANT_ID = "cbb89e60-d328-4daf-a5a5-be56f488e897";

const TARGETS = [
  { id: "2782cae6-6a24-4ccb-8bf2-c6dc33b34049", email: "philipp@schneggenburger.ch", rolle: "admin" },
  { id: "d621e7d4-aa18-4e9f-a074-9c5b7436e035", email: "domipusam@gmail.com", rolle: "admin" },
  { id: "d818704c-330e-4c22-bfc6-be903fc504fa", email: "test.muster@schneggenburger.ch", rolle: "mitarbeiter" },
] as const;

type MembershipRole = (typeof TARGETS)[number]["rolle"];

interface LegacyBackupUser {
  id: string;
  benutzername?: string | null;
  rolle?: string;
  passwort_hash?: string;
}

interface CurrentLegacyUser {
  id: string;
  benutzername: string | null;
  rolle: string;
  passwort_hash: string;
  aktiv: boolean;
}

interface ImportUser {
  id: string;
  email: string;
  rolle: MembershipRole;
  benutzername: string;
  passwordHash: string;
  backupEmailDifferent: boolean;
  backupHashDifferent: boolean;
}

interface UserResult {
  id: string;
  email: string;
  auth: "created" | "already-present" | "not-started" | "rolled-back";
  membership: "created" | "already-present" | "not-started" | "failed";
  uuidRetained: boolean;
  emailConfirmed: boolean;
  backupDifferences: string[];
  detail?: string;
}

interface Options {
  execute: boolean;
  backupPath: string;
  reportPath?: string;
}

function usage(message?: string): never {
  if (message) console.error(`Fehler: ${message}\n`);
  console.error(
    [
      "Verwendung:",
      "  SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/auth-import-production.ts --execute [--backup <pfad>] [--report <pfad>]",
      "",
      "Ohne --execute werden weder auth.users noch tenant_memberships verändert.",
    ].join("\n"),
  );
  process.exit(2);
}

function parseOptions(argv: string[]): Options {
  const options: Options = { execute: false, backupPath: DEFAULT_BACKUP_PATH };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") {
      options.execute = true;
    } else if (arg === "--backup" || arg === "--report") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) usage(`Wert für ${arg} fehlt.`);
      if (arg === "--backup") options.backupPath = resolve(value);
      else options.reportPath = resolve(value);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else {
      usage(`Unbekannte Option ${arg}.`);
    }
  }

  return options;
}

function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

function redactError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) message = message.replaceAll(serviceRoleKey, "[REDACTED]");
  return message;
}

async function writeReport(reportPath: string | undefined, content: string): Promise<void> {
  if (!reportPath) return;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, content, { encoding: "utf8", mode: 0o600 });
  console.log(`Report geschrieben: ${reportPath}`);
}

function targetFor(id: string) {
  return TARGETS.find((target) => target.id === id);
}

function buildImportUsers(currentRows: CurrentLegacyUser[], backupRows: LegacyBackupUser[]): ImportUser[] {
  if (currentRows.length !== TARGETS.length) {
    throw new Error(`app_benutzer lieferte ${currentRows.length} statt der erwarteten ${TARGETS.length} Zielnutzer.`);
  }

  const backupById = new Map(backupRows.map((user) => [user.id, user]));
  const currentById = new Map(currentRows.map((user) => [user.id, user]));

  return TARGETS.map((target) => {
    const current = currentById.get(target.id);
    if (!current) throw new Error(`Aktueller app_benutzer-Datensatz fehlt: ${target.id}.`);
    if (!current.benutzername || current.benutzername.toLowerCase() !== target.email) {
      throw new Error(
        `Aktuelle E-Mail für ${target.id} ist nicht die bestätigte Ziel-E-Mail ${target.email}. Import abgebrochen.`,
      );
    }
    if (current.rolle !== target.rolle) {
      throw new Error(`Aktuelle Rolle für ${target.email} ist ${current.rolle}; erwartet wird ${target.rolle}.`);
    }
    if (!isBcryptHash(current.passwort_hash)) {
      throw new Error(`Aktueller Passwort-Hash für ${target.email} ist kein akzeptierter bcrypt-Hash.`);
    }

    const backup = backupById.get(target.id);
    if (!backup) throw new Error(`Backup-Datensatz fehlt: ${target.id}.`);
    if (!backup.passwort_hash || !isBcryptHash(backup.passwort_hash)) {
      throw new Error(`Backup-Hash für ${target.email} ist nicht als bcrypt validierbar.`);
    }

    return {
      id: target.id,
      email: target.email,
      rolle: target.rolle,
      benutzername: current.benutzername,
      passwordHash: current.passwort_hash,
      backupEmailDifferent: (backup.benutzername ?? "").toLowerCase() !== target.email,
      backupHashDifferent: backup.passwort_hash !== current.passwort_hash,
    };
  });
}

async function listAuthUsersByEmail(
  client: SupabaseAdminClient,
  emails: Set<string>,
): Promise<Map<string, User>> {
  const found = new Map<string, User>();
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.admin.listUsers fehlgeschlagen: ${error.message}`);
    for (const user of data.users) {
      if (user.email && emails.has(user.email.toLowerCase())) found.set(user.email.toLowerCase(), user);
    }
    if (found.size === emails.size || data.users.length < perPage) return found;
  }

  throw new Error("Auth-Precheck brach nach 100 Seiten ab; Import wurde nicht begonnen.");
}

async function assertNoAuthCollisions(
  client: SupabaseAdminClient,
  users: ImportUser[],
): Promise<Map<string, User>> {
  const byId = new Map<string, User>();
  const byEmail = await listAuthUsersByEmail(client, new Set(users.map((user) => user.email)));

  for (const user of users) {
    const { data, error } = await client.auth.admin.getUserById(user.id);
    if (error && !/not found|user not found/i.test(error.message)) {
      throw new Error(`Auth-Precheck für ${user.email} fehlgeschlagen: ${error.message}`);
    }
    const idMatch = data.user ?? null;
    const emailMatch = byEmail.get(user.email);

    if (idMatch && idMatch.email?.toLowerCase() !== user.email) {
      throw new Error(`UUID-Kollision: ${user.id} gehört bereits zu ${idMatch.email}.`);
    }
    if (emailMatch && emailMatch.id !== user.id) {
      throw new Error(`E-Mail-Kollision: ${user.email} gehört bereits zu UUID ${emailMatch.id}.`);
    }
    if (idMatch) byId.set(user.id, idMatch);
    else if (emailMatch) byId.set(user.id, emailMatch);
  }

  return byId;
}

async function membershipExists(
  client: SupabaseAdminClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .eq("user_id", userId);
  if (error) throw new Error(`Membership-Precheck fehlgeschlagen: ${error.message}`);
  return (data ?? []).length > 0;
}

async function rollbackNewAuthUser(
  client: SupabaseAdminClient,
  user: ImportUser,
): Promise<void> {
  const { error } = await client.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`KRITISCH: Auth-Rollback für ${user.email} fehlgeschlagen: ${error.message}`);

  const { data, error: verifyError } = await client.auth.admin.getUserById(user.id);
  if (verifyError && !/not found|user not found/i.test(verifyError.message)) {
    throw new Error(`KRITISCH: Auth-Rollback-Nachprüfung für ${user.email} fehlgeschlagen: ${verifyError.message}`);
  }
  if (data.user) throw new Error(`KRITISCH: Auth-Rollback für ${user.email} hat den User nicht entfernt.`);
}

async function importOne(
  client: SupabaseAdminClient,
  user: ImportUser,
  existingAuth: User | undefined,
): Promise<UserResult> {
  const differences = [
    ...(user.backupEmailDifferent ? ["E-Mail weicht vom Backup ab; aktueller Produktionswert verwendet."] : []),
    ...(user.backupHashDifferent ? ["bcrypt-Hash weicht vom Backup ab; aktueller Produktionswert verwendet."] : []),
  ];

  let authCreated = false;
  let auth: User | null = existingAuth ?? null;
  const result: UserResult = {
    id: user.id,
    email: user.email,
    auth: existingAuth ? "already-present" : "not-started",
    membership: "not-started",
    uuidRetained: existingAuth?.id === user.id,
    emailConfirmed: Boolean(existingAuth?.email_confirmed_at),
    backupDifferences: differences,
  };

  try {
    if (!auth) {
      const { data, error } = await client.auth.admin.createUser({
        id: user.id,
        email: user.email,
        password_hash: user.passwordHash,
        email_confirm: true,
        app_metadata: {
          legacy_id: user.id,
          rolle: user.rolle,
          benutzername: user.benutzername,
        },
        user_metadata: {},
      });
      if (error || !data.user) throw new Error(`auth.admin.createUser fehlgeschlagen: ${error?.message ?? "keine User-Antwort"}`);
      authCreated = true;
      auth = data.user;
      result.auth = "created";
    }

    result.uuidRetained = auth.id === user.id;
    result.emailConfirmed = Boolean(auth.email_confirmed_at);
    if (!result.uuidRetained) {
      throw new Error(`UUID-Erhaltung fehlgeschlagen: erhalten ${auth.id}, erwartet ${user.id}.`);
    }
    if (auth.email?.toLowerCase() !== user.email) {
      throw new Error(`E-Mail-Prüfung fehlgeschlagen: erhalten ${auth.email}, erwartet ${user.email}.`);
    }
    if (!result.emailConfirmed) throw new Error("email_confirmed_at ist nicht gesetzt.");

    if (await membershipExists(client, user.id)) {
      result.membership = "already-present";
      result.detail = "Auth und Membership bereits vorhanden oder Auth wurde neu erstellt; keine doppelte Membership angelegt.";
      return result;
    }

    const now = new Date().toISOString();
    const { error: membershipError } = await client.from("tenant_memberships").insert({
      tenant_id: DEFAULT_TENANT_ID,
      user_id: user.id,
      rolle: user.rolle,
      berechtigungen: {},
      aktiv: true,
      mfa_erforderlich: false,
      erstellt_am: now,
      aktualisiert_am: now,
    });
    if (membershipError) throw new Error(`Membership-Insert fehlgeschlagen: ${membershipError.message}`);

    result.membership = "created";
    result.detail = "Auth-User und Membership erfolgreich verarbeitet.";
    return result;
  } catch (error) {
    result.detail = redactError(error);
    result.membership = "failed";
    if (authCreated) {
      await rollbackNewAuthUser(client, user);
      result.auth = "rolled-back";
    }
    throw Object.assign(new Error(`Import für ${user.email} abgebrochen: ${result.detail}`), { result });
  }
}

function renderReport(
  startedAt: string,
  users: ImportUser[],
  results: UserResult[],
  fatalError?: string,
): string {
  const lines = [
    "# Etappe 9 – Produktiver Auth-Import",
    "",
    `- Ausführung gestartet: \`${startedAt}\``,
    `- Supabase-Projekt: \`${PROJECT_REF}\``,
    `- Default-Tenant: \`${DEFAULT_TENANT_ID}\` (Schneggenburger GmbH)`,
    "- Keine Passworthashes oder Service-Role-Schlüssel werden in diesem Bericht ausgegeben.",
    "- Die aktuelle app_benutzer-Quelle wurde im Lauf mit Service-Role gelesen; der produktive Orchestrator führt zusätzlich execute_sql-Pre-/Postchecks aus.",
    "",
    "## Ergebnis pro Nutzer",
    "",
    ...users.map((user) => {
      const result = results.find((candidate) => candidate.id === user.id);
      if (!result) {
        return `### ${user.email}\n- Nicht verarbeitet, weil ein vorheriger Fehler den Lauf beendet hat.`;
      }
      return [
        `### ${user.email}`,
        `- auth.users: **${result.auth}**`,
        `- UUID beibehalten: **${result.uuidRetained ? "ja" : "nein"}** (\`${result.id}\`)`,
        `- E-Mail bestätigt: **${result.emailConfirmed ? "ja" : "nein"}**`,
        `- tenant_membership: **${result.membership}**`,
        `- Backup-Abweichungen: ${result.backupDifferences.length ? result.backupDifferences.join(" ") : "keine"}`,
        ...(result.detail ? [`- Detail: ${result.detail}`] : []),
      ].join("\n");
    }),
    "",
    "## Sicherheitsumfang",
    "",
    "- AUTH_MODE wurde durch dieses Skript nicht geändert; die Anwendung bleibt im Legacy-Modus.",
    "- server/routes.ts und sonstiger Anwendungs-Login-Code werden nicht verändert.",
    "- Bei einem Membership-Fehler wird ausschließlich der im selben Durchlauf neu angelegte Auth-User sofort über auth.admin.deleteUser zurückgerollt.",
    "- Der vorbereitete Notausgang ist scripts/auth-import-rollback.ts (nur mit explizitem --execute).",
    ...(fatalError ? ["", "## Abbruch", "", `- ${fatalError}`] : []),
    "",
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  if (!options.execute) {
    console.log("Sicherheitsstopp: Ohne --execute wurden keine Schreibvorgänge ausgeführt.");
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) usage("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  const client: SupabaseAdminClient = createClient<any>(process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rawBackup = JSON.parse(await readFile(options.backupPath, "utf8")) as unknown;
  if (!Array.isArray(rawBackup)) throw new Error("Die Backup-Datei ist kein JSON-Array.");

  const { data: sourceRows, error: sourceError } = await client
    .from("app_benutzer")
    .select("id, benutzername, rolle, passwort_hash, aktiv")
    .in("id", TARGETS.map((target) => target.id))
    .order("id");
  if (sourceError) throw new Error(`Lesen von app_benutzer fehlgeschlagen: ${sourceError.message}`);

  const users = buildImportUsers((sourceRows ?? []) as CurrentLegacyUser[], rawBackup as LegacyBackupUser[]);
  const existingAuth = await assertNoAuthCollisions(client, users);
  const results: UserResult[] = [];

  try {
    for (const user of users) {
      const result = await importOne(client, user, existingAuth.get(user.id));
      results.push(result);
      console.log(`${user.email}: auth=${result.auth}, membership=${result.membership}, uuid=${result.uuidRetained ? "ok" : "fehler"}`);
    }
  } catch (error) {
    const failedResult = (error as { result?: UserResult }).result;
    if (failedResult) results.push(failedResult);
    const fatalError = redactError(error);
    await writeReport(options.reportPath, renderReport(startedAt, users, results, fatalError));
    throw error;
  }

  await writeReport(options.reportPath, renderReport(startedAt, users, results));
}

main().catch((error: unknown) => {
  console.error(`Fehler: ${redactError(error)}`);
  process.exitCode = 1;
});
