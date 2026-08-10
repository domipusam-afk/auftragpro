/**
 * Etappe 9 emergency rollback.
 *
 * Deletes only the three fixed Etappe-9 target memberships in the default
 * tenant, then deletes the matching auth.users entries via the Auth Admin API.
 * It is intentionally a no-op without --execute.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run auth:import:rollback -- --execute
 */

import { createClient, type User } from "@supabase/supabase-js";
import WebSocket from "ws";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}

type SupabaseAdminClient = ReturnType<typeof createClient<any>>;

const PROJECT_REF = "rbklkyozbefdjzaufszk";
const DEFAULT_SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const DEFAULT_TENANT_ID = "cbb89e60-d328-4daf-a5a5-be56f488e897";
const TARGETS = [
  { id: "2782cae6-6a24-4ccb-8bf2-c6dc33b34049", email: "philipp@schneggenburger.ch" },
  { id: "d621e7d4-aa18-4e9f-a074-9c5b7436e035", email: "domipusam@gmail.com" },
  { id: "d818704c-330e-4c22-bfc6-be903fc504fa", email: "test.muster@schneggenburger.ch" },
] as const;

function redactError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) message = message.replaceAll(serviceRoleKey, "[REDACTED]");
  return message;
}

function usage(message?: string): never {
  if (message) console.error(`Fehler: ${message}\n`);
  console.error(
    [
      "Verwendung:",
      "  SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/auth-import-rollback.ts --execute",
      "",
      "Ohne --execute werden keine Daten gelöscht.",
    ].join("\n"),
  );
  process.exit(2);
}

async function userExists(client: SupabaseAdminClient, id: string): Promise<User | null> {
  const { data, error } = await client.auth.admin.getUserById(id);
  if (error && !/not found|user not found/i.test(error.message)) {
    throw new Error(`Auth-Nachschau für ${id} fehlgeschlagen: ${error.message}`);
  }
  return data.user ?? null;
}

async function main(): Promise<void> {
  const execute = process.argv.slice(2).length === 1 && process.argv[2] === "--execute";
  if (!execute) usage("Dieser Notausgang benötigt das explizite Flag --execute.");

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) usage("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  const client: SupabaseAdminClient = createClient<any>(process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ids = TARGETS.map((target) => target.id);

  // Delete the concrete tenant rows first. This is also safe when auth.users
  // has already cascaded a row away in a partial manual rollback.
  const { error: membershipDeleteError } = await client
    .from("tenant_memberships")
    .delete()
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .in("user_id", ids);
  if (membershipDeleteError) throw new Error(`Membership-Rollback fehlgeschlagen: ${membershipDeleteError.message}`);

  for (const target of TARGETS) {
    const before = await userExists(client, target.id);
    if (before && before.email?.toLowerCase() !== target.email) {
      throw new Error(`Sicherheitsstopp: ${target.id} gehört zu ${before.email}, nicht zu ${target.email}.`);
    }
    if (before) {
      const { error } = await client.auth.admin.deleteUser(target.id);
      if (error) throw new Error(`Auth-Rollback für ${target.email} fehlgeschlagen: ${error.message}`);
    }
  }

  const { data: remainingMemberships, error: membershipCheckError } = await client
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_id", DEFAULT_TENANT_ID)
    .in("user_id", ids);
  if (membershipCheckError) throw new Error(`Membership-Rollback-Nachprüfung fehlgeschlagen: ${membershipCheckError.message}`);
  if ((remainingMemberships ?? []).length > 0) {
    throw new Error("KRITISCH: Mindestens eine Etappe-9-Membership ist nach dem Rollback noch vorhanden.");
  }

  for (const target of TARGETS) {
    if (await userExists(client, target.id)) {
      throw new Error(`KRITISCH: Auth-User ${target.email} ist nach dem Rollback noch vorhanden.`);
    }
  }

  console.log("Rollback bestätigt: 3 Ziel-Memberships und 3 Ziel-auth.users-Einträge sind gelöscht bzw. nicht mehr vorhanden.");
}

main().catch((error: unknown) => {
  console.error(`Fehler: ${redactError(error)}`);
  process.exitCode = 1;
});
