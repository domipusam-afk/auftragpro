/** Runtime rollout switches. Values are read for every request so a deployed
 * process can use an environment change without requiring a fresh build. */
export type AuthMode = "legacy" | "supabase";
export type PolicyMode = "observe" | "enforce" | "off";

export function getAuthMode(): AuthMode {
  return process.env.AUTH_MODE === "supabase" ? "supabase" : "legacy";
}

export function isSupabaseAuthMode(): boolean {
  return getAuthMode() === "supabase";
}

export function getPolicyMode(): PolicyMode {
  if (process.env.POLICY_MODE === "off") return "off";
  if (process.env.POLICY_MODE === "enforce") return "enforce";
  return "observe";
}

// Compatibility exports for code that only needs an initial diagnostic value.
// Request middleware must use getAuthMode()/getPolicyMode() instead.
export const AUTH_MODE: AuthMode = getAuthMode();
export const POLICY_MODE: PolicyMode = getPolicyMode();
