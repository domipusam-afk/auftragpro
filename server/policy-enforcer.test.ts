import assert from "node:assert/strict";
import { createPolicyObserver } from "./policy-observer";

function invoke(req: any) {
  let status = 200;
  let body: any;
  let nextCalled = false;
  const res = {
    status(code: number) { status = code; return this; },
    json(payload: unknown) { body = payload; return this; },
  } as any;
  createPolicyObserver({ mode: "enforce" })(req, res, () => { nextCalled = true; });
  return { status, body, nextCalled };
}

const initialAuthMode = process.env.AUTH_MODE;
try {
  process.env.AUTH_MODE = "legacy";
  const missing = invoke({ method: "GET", path: "/api/auftraege/123" });
  assert.equal(missing.status, 401);
  assert.deepEqual(missing.body, { ok: false, message: "Authentifizierung erforderlich" });
  assert.equal(missing.nextCalled, false);

  const denied = invoke({
    method: "GET",
    path: "/api/auftraege/123",
    legacyAuth: { userId: "employee", rolle: "mitarbeiter", berechtigungen: { auftraege_anzeigen: true } },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.ok, false);
  assert.equal(denied.body.message, "Fehlende Berechtigung");
  assert.equal(denied.body.requiredPermission, "auftraege_anzeigen, auftraege_preise_sichtbar");
  assert.equal(denied.nextCalled, false);

  const publicRoute = invoke({ method: "GET", path: "/api/ping" });
  assert.equal(publicRoute.nextCalled, true);

  process.env.AUTH_MODE = "supabase";
  const supabaseAdmin = invoke({
    method: "GET",
    path: "/api/auftraege/123",
    auth: { userId: "admin", rolle: "admin", berechtigungen: null },
  });
  assert.equal(supabaseAdmin.nextCalled, true);
  assert.equal(supabaseAdmin.status, 200);

  console.log("Policy enforcer checks passed (401, 403, public pass-through, Supabase JWT context).");
} finally {
  if (initialAuthMode === undefined) delete process.env.AUTH_MODE;
  else process.env.AUTH_MODE = initialAuthMode;
}
