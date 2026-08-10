/**
 * Etappe 8: Supabase Auth import rehearsal.
 *
 * Default (no flags): read the legacy backup, validate and print a complete,
 * non-secret import plan. It never writes to Supabase.
 *
 * `--live-test`: an intentionally constrained, self-cleaning proof for the
 * explicitly approved placeholder `test.muster@schneggenburger.ch` only.
 * The two real administrators are hard-blocked here. It uses the officially
 * supported GoTrue Admin API (`auth.admin.createUser`) with `password_hash`,
 * `email_confirm: true`, and the legacy UUID supplied as `id`.
 *
 * Supabase documentation:
 * https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0
 * https://supabase.com/docs/reference/javascript/auth-admin-createuser
 *
 * Do not use this script for the productive migration. Etappe 9 must be
 * separately approved. This script never creates tenant_memberships.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient, type User } from "@supabase/supabase-js";

const DEFAULT_BACKUP_PATH = "/home/user/workspace/backup_2026-08-10/app_benutzer.json";
const DEFAULT_TENANT_ID = "cbb89e60-d328-4daf-a5a5-be56f488e897";
const PROJECT_REF = "rbklkyozbefdjzaufszk";
const TEST_EMAIL = "test.muster@schneggenburger.ch";
const TEST_USER_ID = "d818704c-330e-4c22-bfc6-be903fc504fa";
const BLOCKED_ADMIN_EMAILS = new Set([
  "philipp@schneggenburger.ch",
  "domipusam@gmail.com",
]);

/**
 * The legacy backup contains historic login names. These final, confirmed
 * email addresses are deliberately an explicit migration map rather than a
 * guess from `benutzername`.
 */
const CONFIRMED_EMAIL_BY_LEGACY_ID: Record<string, string> = {
  "2782cae6-6a24-4ccb-8bf2-c6dc33b34049": "philipp@schneggenburger.ch",
  "d621e7d4-aa18-4e9f-a074-9c5b7436e035": "domipusam@gmail.com",
  "d818704c-330e-4c22-bfc6-be903fc504fa": TEST_EMAIL,
};

interface LegacyUser {
  id: string;
  benutzername?: string;
  rolle: string;
  passwort_hash: string;
  aktiv?: boolean;
}

interface ImportPlanUser {
  id: string;
  email: string;
  rolle: string;
  benutzername: string | null;
  passwordHash: string;
}

interface CliOptions {
  liveTest: boolean;
  backupPath: string;
  reportPath?: string;
}

/**
 * The migration script only uses the Auth Admin subset. Keeping this structural
 * type avoids binding the script to a generated Database schema generic.
 */
interface AuthAdminClient {
  auth: {
    admin: {
      getUserById(id: string): Promise<{ data: { user: User | null }; error: { message: string } | null }>;
      listUsers(params: { page: number; perPage: number }): Promise<{
        data: { users: User[] };
        error: { message: string } | null;
      }>;
      createUser(attributes: {
        id: string;
        email: string;
        password_hash: string;
        email_confirm: boolean;
        app_metadata: Record<string, string>;
        user_metadata: { benutzername: string | null };
      }): Promise<{ data: { user: User | null }; error: { message: string } | null }>;
      deleteUser(id: string): Promise<{ data: { user: User | null }; error: { message: string } | null }>;
    };
  };
}

function usage(message?: string): never {
  if (message) console.error(`Fehler: ${message}\n`);
  console.error(
    [
      "Verwendung:",
      "  npx tsx scripts/auth-import-rehearsal.ts [--backup <pfad>] [--report <pfad>]",
      "  SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/auth-import-rehearsal.ts --live-test [--report <pfad>]",
      "",
      "Ohne --live-test ist der Lauf rein lesend/simulierend.",
    ].join("\n"),
  );
  process.exit(2);
}

function parseOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    liveTest: false,
    backupPath: DEFAULT_BACKUP_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--live-test") {
      options.liveTest = true;
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
  // bcrypt hashes are normally 60 chars, with a supported bcrypt version,
  // two-digit cost, and 53-character payload.
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

function hashDescriptor(hash: string): string {
  const cost = hash.match(/^\$2[aby]\$(\d{2})\$/)?.[1] ?? "unbekannt";
  // Never report the bcrypt value itself, or a derivative fingerprint of it.
  return `validierter bcrypt-Hash (cost ${cost}, 60 Zeichen; Wert nicht ausgegeben)`;
}

function buildPlan(raw: unknown): ImportPlanUser[] {
  if (!Array.isArray(raw)) throw new Error("Backup muss ein JSON-Array von app_benutzer-Datensätzen sein.");

  const plans = raw.map((candidate, index) => {
    const user = candidate as Partial<LegacyUser>;
    if (!user.id || !user.rolle || !user.passwort_hash) {
      throw new Error(`Backup-Datensatz ${index} hat keine vollständigen Pflichtfelder.`);
    }
    const email = CONFIRMED_EMAIL_BY_LEGACY_ID[user.id];
    if (!email) throw new Error(`Keine endgültig bestätigte E-Mail-Zuordnung für Legacy-ID ${user.id}.`);
    if (!isBcryptHash(user.passwort_hash)) {
      throw new Error(`Legacy-ID ${user.id} enthält keinen akzeptierten bcrypt-Hash.`);
    }

    return {
      id: user.id,
      email,
      rolle: user.rolle,
      benutzername: user.benutzername ?? null,
      passwordHash: user.passwort_hash,
    };
  });

  if (plans.length !== 3) throw new Error(`Erwartet genau 3 Legacy-Nutzer, erhalten: ${plans.length}.`);
  if (new Set(plans.map((user) => user.id)).size !== plans.length) {
    throw new Error("Doppelte Legacy-ID im Backup.");
  }
  if (new Set(plans.map((user) => user.email)).size !== plans.length) {
    throw new Error("Doppelte Ziel-E-Mail in der bestätigten Zuordnung.");
  }

  for (const id of Object.keys(CONFIRMED_EMAIL_BY_LEGACY_ID)) {
    if (!plans.some((user) => user.id === id)) throw new Error(`Erwartete Legacy-ID fehlt: ${id}.`);
  }

  return plans.sort((left, right) => left.email.localeCompare(right.email));
}

function redactError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (serviceRoleKey) message = message.replaceAll(serviceRoleKey, "[REDACTED]");
  if (supabaseUrl) message = message.replaceAll(supabaseUrl, "[REDACTED_URL]");
  return message;
}

function renderPlan(users: ImportPlanUser[], createdAt: string, mode: "rehearsal" | "live-test"): string {
  const userLines = users.map((user) => [
    `### ${user.email}`,
    `- **auth.users.id:** \`${user.id}\` (Legacy-ID beibehalten)`,
    `- **email:** \`${user.email}\``,
    `- **encrypted_password:** ${hashDescriptor(user.passwordHash)}; Original-bcrypt wird an \`password_hash\` übergeben und von GoTrue als \`encrypted_password\` gespeichert.`,
    `- **email_confirmed_at:** durch \`email_confirm: true\` serverseitig beim Import gesetzt (Planzeit: \`${createdAt}\`).`,
    `- **app_metadata:** \`{"rolle":"${user.rolle}","app_benutzer_id":"${user.id}"}\``,
    `- **raw_user_meta_data:** \`{"benutzername":${JSON.stringify(user.benutzername)}}\``,
    `- **Geplante tenant_membership (nur Etappe 9, in diesem Skript nie geschrieben):** \`user_id=${user.id}\`, \`tenant_id=${DEFAULT_TENANT_ID}\`, \`rolle=${user.rolle}\`, \`aktiv=true\`.`,
  ].join("\n")).join("\n\n");

  return [
    "# Etappe 8 – Auth-Import Rehearsal",
    "",
    `- Ausführung: \`${createdAt}\``,
    `- Modus: **${mode}**`,
    `- Supabase-Projekt: \`${PROJECT_REF}\``,
    `- Default-Tenant: \`${DEFAULT_TENANT_ID}\` (Schneggenburger GmbH)`,
    "- Sensible bcrypt-Werte werden absichtlich weder ausgegeben noch in diesen Report geschrieben.",
    "",
    "## Offiziell gewählte Importmethode",
    "",
    "Supabase dokumentiert `auth.admin.createUser({ email, password_hash, email_confirm: true })` für die Migration von bcrypt-Hashes. Die installierte `@supabase/auth-js`-Typdefinition unterstützt zusätzlich `id`, sodass die Legacy-UUID explizit beibehalten werden kann. Diese Admin-API ist gegenüber einem direkten `INSERT` in `auth.users` bevorzugt, weil sie die GoTrue-Validierung und zugehörige Auth-Nebenwirkungen übernimmt.",
    "",
    "Quellen:",
    "- https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0",
    "- https://supabase.com/docs/reference/javascript/auth-admin-createuser",
    "- https://supabase.com/docs/guides/auth/password-security",
    "",
    "## Vollständiger Importplan",
    "",
    userLines,
    "",
    "## Sicherheitsgrenzen dieser Etappe",
    "",
    "- Ohne `--live-test` erfolgen keinerlei Schreibvorgänge.",
    "- Auch mit `--live-test` darf ausschließlich `test.muster@schneggenburger.ch` angelegt und wieder gelöscht werden.",
    "- `philipp@schneggenburger.ch` und `domipusam@gmail.com` werden in dieser Etappe unter keinen Umständen geschrieben, aktualisiert oder gelöscht.",
    "- `tenant_memberships` werden in diesem Skript nie erstellt.",
    "",
    "## Empfehlung für Etappe 9",
    "",
    "1. Vorab `SUPABASE_SERVICE_ROLE_KEY` ausschließlich in einer kontrollierten serverseitigen Ausführungsumgebung bereitstellen; nie im Browser, Repository oder Report.",
    "2. Alle Nutzer zuerst mit `auth.admin.createUser({ id, email, password_hash, email_confirm: true, app_metadata, user_metadata })` importieren und pro Nutzer die zurückgelieferte UUID gegen die Legacy-ID prüfen.",
    "3. Erst danach die `tenant_memberships` schreiben: `tenant_memberships.user_id` besitzt einen Foreign Key auf `auth.users.id`.",
    "4. Nach jedem Batch per privilegierter, aber hash-freier SQL-Abfrage prüfen: UUID, E-Mail, `email_confirmed_at IS NOT NULL`, `encrypted_password IS NOT NULL`, Metadata und Membership-Anzahl. Einen Login-Test nur ausführen, wenn ein autorisierter Klartext-Testwert vorhanden ist.",
    "",
    "## Offene Risiken / Fragen",
    "",
    "- Der Produktiv-Import darf erst stattfinden, wenn die service-role-Ausführungsumgebung verfügbar ist und ein Testlauf die UUID-Erhaltung tatsächlich bestätigt.",
    "- Der Admin-API-User-Response offenbart `encrypted_password` nicht. Eine bytegenaue Hash-Gleichheitsprüfung braucht deshalb eine eng begrenzte, privilegierte Datenbankprüfung oder einen bekannten Klartext-Testwert.",
    "- Die im Backup gespeicherten `benutzername`-Werte für die zwei Admins weichen von den bestätigten Ziel-E-Mails ab; die explizite, im Skript verankerte Zuordnung ist maßgeblich.",
    "",
  ].join("\n");
}

async function writeReport(reportPath: string | undefined, text: string): Promise<void> {
  if (!reportPath) return;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, text, { encoding: "utf8", mode: 0o600 });
  console.log(`Report geschrieben: ${reportPath}`);
}

async function assertNoExistingTarget(
  admin: AuthAdminClient,
  target: ImportPlanUser,
): Promise<User | null> {
  const { data, error } = await admin.auth.admin.getUserById(target.id);
  if (error && !/not found|user not found/i.test(error.message)) {
    throw new Error(`Vorprüfung nach UUID fehlgeschlagen: ${error.message}`);
  }
  if (data.user && data.user.email !== target.email) {
    throw new Error(
      `Abbruch: Legacy-UUID ${target.id} gehört bereits zu einer anderen E-Mail (${data.user.email}).`,
    );
  }

  // listUsers is needed because getUserById cannot tell us whether this email
  // is already occupied by a different UUID.
  const { data: listData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw new Error(`Vorprüfung nach E-Mail fehlgeschlagen: ${listError.message}`);
  const emailUser = listData.users.find((user) => user.email?.toLowerCase() === target.email);
  if (emailUser && emailUser.id !== target.id) {
    throw new Error(
      `Abbruch: Test-E-Mail ${target.email} existiert bereits mit abweichender UUID (${emailUser.id}).`,
    );
  }

  return data.user ?? emailUser ?? null;
}

async function runLiveTest(target: ImportPlanUser): Promise<string[]> {
  if (target.email !== TEST_EMAIL || target.id !== TEST_USER_ID || BLOCKED_ADMIN_EMAILS.has(target.email)) {
    throw new Error("Live-Test-Schutz ausgelöst: nur der explizite Testplatzhalter ist zulässig.");
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? `https://${PROJECT_REF}.supabase.co`;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY fehlt. Kein Live-Test ausgeführt; die service-role darf weder aus dem Repo noch aus einer Client-Konfiguration stammen.",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const events: string[] = [];
  const existing = await assertNoExistingTarget(admin, target);
  if (existing) {
    events.push(`Abbruch ohne Mutation: ${TEST_EMAIL} bestand bereits (id=${existing.id}) und wurde nicht berührt.`);
    return events;
  }

  let created = false;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      id: target.id,
      email: target.email,
      password_hash: target.passwordHash,
      email_confirm: true,
      app_metadata: {
        rolle: target.rolle,
        app_benutzer_id: target.id,
      },
      user_metadata: {
        benutzername: target.benutzername,
      },
    });
    if (error || !data.user) throw new Error(`createUser fehlgeschlagen: ${error?.message ?? "keine User-Antwort"}`);
    created = true;
    events.push(`auth.admin.createUser erfolgreich; zurückgelieferte id=${data.user.id}.`);

    const { data: verified, error: verifyError } = await admin.auth.admin.getUserById(target.id);
    if (verifyError || !verified.user) throw new Error(`getUserById fehlgeschlagen: ${verifyError?.message ?? "kein User"}`);
    if (verified.user.id !== target.id) throw new Error(`UUID wurde nicht beibehalten (${verified.user.id}).`);
    if (verified.user.email !== target.email) throw new Error(`E-Mail stimmt nicht (${verified.user.email}).`);
    if (!verified.user.email_confirmed_at) throw new Error("email_confirmed_at ist nicht gesetzt.");
    events.push("Nachprüfung erfolgreich: User existiert, UUID identisch, E-Mail bestätigt.");
    events.push(
      "Kein Klartext-Passwort vorhanden: signInWithPassword wurde bewusst nicht ausgeführt. Die Admin-API gibt encrypted_password nicht zurück; dessen bytegenaue SQL-Prüfung erfordert eine separat autorisierte, privilegierte Datenbankabfrage.",
    );
  } finally {
    if (created) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
      if (deleteError) {
        throw new Error(`KRITISCH: Bereinigung fehlgeschlagen: ${deleteError.message}`);
      }
      const { data: afterDelete, error: afterDeleteError } = await admin.auth.admin.getUserById(target.id);
      if (afterDeleteError && !/not found|user not found/i.test(afterDeleteError.message)) {
        throw new Error(`Nachprüfung der Bereinigung fehlgeschlagen: ${afterDeleteError.message}`);
      }
      if (afterDelete.user) throw new Error("KRITISCH: Testuser verblieb in auth.users.");
      events.push("auth.admin.deleteUser erfolgreich; abschließende getUserById-Nachprüfung: 0 Testuser.");
    }
  }

  return events;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const raw = JSON.parse(await readFile(options.backupPath, "utf8")) as unknown;
  const users = buildPlan(raw);
  const now = new Date().toISOString();
  let report = renderPlan(users, now, options.liveTest ? "live-test" : "rehearsal");

  if (options.liveTest) {
    const target = users.find((user) => user.email === TEST_EMAIL);
    if (!target) throw new Error(`Testplatzhalter ${TEST_EMAIL} nicht im Backup-Plan gefunden.`);
    report += "\n## Ergebnis des eingeschränkten Live-Tests\n\n";
    try {
      const events = await runLiveTest(target);
      report += `${events.map((event) => `- ${event}`).join("\n")}\n`;
    } catch (error) {
      report += `- Nicht ausgeführt/fehlgeschlagen: ${redactError(error)}\n`;
      await writeReport(options.reportPath, report);
      console.error(report);
      process.exitCode = 1;
      return;
    }
  } else {
    report += "\n## Ergebnis des Trockenlaufs\n\n- Alle drei bestätigten Nutzer wurden validiert und geplant. Es erfolgten keine Schreibvorgänge und keine Mitgliedschafts-Erstellung.\n";
  }

  await writeReport(options.reportPath, report);
  console.log(report);
}

main().catch(async (error: unknown) => {
  console.error(`Unerwarteter Fehler: ${redactError(error)}`);
  process.exitCode = 1;
});
