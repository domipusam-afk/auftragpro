import { AsyncLocalStorage } from "node:async_hooks";

export const DEFAULT_TENANT_SLUG = "schneggenburger";
const SCHNEGGENBURGER_TENANT_ID = "cbb89e60-d328-4daf-a5a5-be56f488e897";

export type TenancyMode = "observe" | "enforce";

// Stage 5 is deliberately non-enforcing. Unknown values also fall back to
// observe so a deployment cannot accidentally enable filtering.
export const TENANCY_MODE: TenancyMode =
  process.env.TENANCY_MODE === "enforce" ? "enforce" : "observe";

// The server uses the anonymous Supabase key and the tenants table is
// service-role-only, so a startup lookup would be blocked by RLS. Keep the
// Stage-4 verified ID centrally here, while allowing an environment override
// for a later migration or a non-production deployment.
const defaultTenantId = process.env.DEFAULT_TENANT_ID?.trim() || SCHNEGGENBURGER_TENANT_ID;

export function getDefaultTenantId(): string {
  if (!defaultTenantId) {
    throw new Error(
      "Default tenant context is not initialized. Set DEFAULT_TENANT_ID or initialize it before accepting requests.",
    );
  }
  return defaultTenantId;
}

export interface TenantReadObservation {
  readQueries: number;
  tenantIdPresent: number;
  tenantIdNull: number;
  tenantIdUnavailable: number;
}

const tenantReadObservation = new AsyncLocalStorage<TenantReadObservation>();

export function runWithTenantReadObservation<T>(
  callback: (observation: TenantReadObservation) => T,
): T {
  const observation: TenantReadObservation = {
    readQueries: 0,
    tenantIdPresent: 0,
    tenantIdNull: 0,
    tenantIdUnavailable: 0,
  };
  return tenantReadObservation.run(observation, () => callback(observation));
}

export function recordTenantReadObservation(
  present: number,
  missing: number,
  unavailable: number,
): void {
  const observation = tenantReadObservation.getStore();
  if (!observation) return;

  observation.readQueries += 1;
  observation.tenantIdPresent += present;
  observation.tenantIdNull += missing;
  observation.tenantIdUnavailable += unavailable;
}
