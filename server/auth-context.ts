/**
 * Auth rollout switch.
 *
 * Supabase Auth is intentionally not connected to the existing request chain
 * in Stage 6. Keeping the default fail-closed prevents an accidental deploy
 * configuration from changing the legacy username/password login.
 */
export type AuthMode = "legacy" | "supabase";
export type PolicyMode = "observe" | "enforce" | "off";

export const AUTH_MODE: AuthMode =
  process.env.AUTH_MODE === "supabase" ? "supabase" : "legacy";

export const isSupabaseAuthMode = AUTH_MODE === "supabase";

/**
 * Policy rollout switch.
 *
 * The Stage-10 default is deliberately observe-only. "enforce" is reserved
 * for a later, separately reviewed rollout and intentionally does not block
 * requests yet.
 */
export const POLICY_MODE: PolicyMode =
  process.env.POLICY_MODE === "off"
    ? "off"
    : process.env.POLICY_MODE === "enforce"
      ? "enforce"
      : "observe";
