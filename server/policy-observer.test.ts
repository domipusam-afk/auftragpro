import assert from "node:assert/strict";
import {
  createLegacySessionContext,
  createLegacySessionValue,
  getLegacySessionUserId,
  LEGACY_SESSION_COOKIE,
  setLegacySessionCookie,
} from "./legacy-session";
import { createPolicyObserver } from "./policy-observer";

async function invokeLegacyContext(cookie?: string) {
  let nextCalled = false;
  const handler = createLegacySessionContext({
    secret: "test-secret",
    getActiveUser: async (userId) => userId === "employee-1"
      ? { id: userId, rolle: "mitarbeiter", berechtigungen: { auftraege_anzeigen: true } }
      : null,
  });
  const req = {
    method: "GET",
    path: "/api/auftraege/123",
    get(name: string) {
      return name.toLowerCase() === "cookie" ? cookie : undefined;
    },
  } as any;
  await handler(req, {} as any, () => {
    nextCalled = true;
  });
  return { req, nextCalled };
}

function invokeObserver(mode: "observe" | "enforce" | "off", req: any, logs: string[]): boolean {
  let nextCalled = false;
  createPolicyObserver({
    mode,
    log: (line) => logs.push(line),
    now: () => new Date("2026-08-10T18:00:00.000Z"),
  })(req, {} as any, () => {
    nextCalled = true;
  });
  return nextCalled;
}

async function run(): Promise<void> {
  const signedCookie = createLegacySessionValue("employee-1", "test-secret");
  assert.equal(getLegacySessionUserId(signedCookie, "test-secret"), "employee-1");
  assert.equal(getLegacySessionUserId(`${signedCookie}tampered`, "test-secret"), null);
  let cookieName = "";
  let cookieValue = "";
  let cookieOptions: unknown;
  setLegacySessionCookie({
    cookie(name: string, value: string, options: unknown) {
      cookieName = name;
      cookieValue = value;
      cookieOptions = options;
    },
  } as any, "employee-1");
  assert.equal(cookieName, LEGACY_SESSION_COOKIE);
  assert.equal(getLegacySessionUserId(cookieValue), "employee-1");
  assert.deepEqual(cookieOptions, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });

  const context = await invokeLegacyContext(`other=value; ap_legacy_session=${signedCookie}`);
  assert.equal(context.nextCalled, true);
  assert.deepEqual(context.req.legacyAuth, {
    userId: "employee-1",
    rolle: "mitarbeiter",
    berechtigungen: { auftraege_anzeigen: true },
  });

  const discrepancyLogs: string[] = [];
  assert.equal(invokeObserver("observe", context.req, discrepancyLogs), true);
  assert.equal(discrepancyLogs.length, 1);
  const discrepancy = JSON.parse(discrepancyLogs[0].replace("[POLICY_OBSERVE] ", ""));
  assert.deepEqual(discrepancy.expected, {
    access: "permissions",
    permissions: ["auftraege_anzeigen", "auftraege_preise_sichtbar"],
  });
  assert.equal(discrepancy.hasAccess, false);
  assert.equal(discrepancy.matchesLegacy, false);
  assert.equal(discrepancy.path, "/api/auftraege/123");

  const adminRequest = {
    method: "GET",
    path: "/api/auftraege/123",
    legacyAuth: { userId: "admin-1", rolle: "admin", berechtigungen: null },
  };
  const offLogs: string[] = [];
  assert.equal(invokeObserver("off", adminRequest, offLogs), true);
  assert.equal(offLogs.length, 0);
  const enforceLogs: string[] = [];
  assert.equal(invokeObserver("enforce", adminRequest, enforceLogs), true);
  assert.equal(enforceLogs.length, 0);

  const summaryLogs: string[] = [];
  let clock = new Date("2026-08-10T18:00:00.000Z");
  const summaryObserver = createPolicyObserver({
    mode: "observe",
    log: (line) => summaryLogs.push(line),
    now: () => clock,
    summaryIntervalMs: 1,
  });
  summaryObserver(adminRequest as any, {} as any, () => {});
  clock = new Date("2026-08-10T18:00:00.002Z");
  summaryObserver(adminRequest as any, {} as any, () => {});
  assert.equal(summaryLogs.length, 1);
  assert.deepEqual(JSON.parse(summaryLogs[0].replace("[POLICY_OBSERVE] ", "")), {
    type: "summary",
    matchedRequests: 2,
    timestamp: "2026-08-10T18:00:00.002Z",
  });

  console.log("Policy observer checks passed (signed secure cookie, dynamic path, discrepancy, off/enforce pass-through).");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
