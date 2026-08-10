import assert from "node:assert/strict";
import { createRequireAuth } from "./auth-middleware";

type InvocationResult = {
  status: number;
  body: unknown;
  nextCalled: boolean;
  auth: unknown;
};

async function invoke(
  handler: ReturnType<typeof createRequireAuth>,
  authorization?: string,
): Promise<InvocationResult> {
  let status = 200;
  let body: unknown;
  let nextCalled = false;
  const req = {
    get(name: string) {
      return name.toLowerCase() === "authorization" ? authorization : undefined;
    },
  } as any;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as any;

  await handler(req, res, () => {
    nextCalled = true;
  });

  return { status, body, nextCalled, auth: req.auth };
}

async function run(): Promise<void> {
  const missingToken = await invoke(createRequireAuth());
  assert.equal(missingToken.status, 401);
  assert.equal(missingToken.nextCalled, false);

  const invalidToken = await invoke(
    createRequireAuth({
      getClaims: async () => null,
      getActiveMembership: async () => null,
    }),
    "Bearer invalid-token",
  );
  assert.equal(invalidToken.status, 401);
  assert.equal(invalidToken.nextCalled, false);

  const noMembership = await invoke(
    createRequireAuth({
      getClaims: async () => ({ sub: "user-without-membership", email: "none@example.invalid" }),
      getActiveMembership: async () => null,
    }),
    "Bearer valid-token",
  );
  assert.equal(noMembership.status, 403);
  assert.equal(noMembership.nextCalled, false);

  const activeMembership = await invoke(
    createRequireAuth({
      getClaims: async () => ({
        sub: "7e234c0b-c872-47d6-9b83-0ba77a4c1e25",
        email: "etappe6-test@example.invalid",
        session_id: "49d2e0ee-04e0-4a40-8b2d-2f09b7d0b4cd",
      }),
      getActiveMembership: async () => ({
        tenant_id: "cbb89e60-d328-4daf-a5a5-be56f488e897",
        rolle: "admin",
        berechtigungen: { dashboard: true },
        mfa_erforderlich: true,
      }),
    }),
    "Bearer valid-token",
  );

  assert.equal(activeMembership.status, 200);
  assert.equal(activeMembership.nextCalled, true);
  assert.deepEqual(activeMembership.auth, {
    userId: "7e234c0b-c872-47d6-9b83-0ba77a4c1e25",
    email: "etappe6-test@example.invalid",
    sessionId: "49d2e0ee-04e0-4a40-8b2d-2f09b7d0b4cd",
    tenantId: "cbb89e60-d328-4daf-a5a5-be56f488e897",
    rolle: "admin",
    berechtigungen: { dashboard: true },
    mfaErforderlich: true,
  });

  const noServiceRole = await invoke(
    createRequireAuth({
      getClaims: async () => ({ sub: "verified-user" }),
      hasServiceRoleKey: () => false,
    }),
    "Bearer valid-token",
  );
  assert.equal(noServiceRole.status, 503);
  assert.equal(noServiceRole.nextCalled, false);

  console.log("Auth middleware checks passed (401, 403, successful req.auth, 503).");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
