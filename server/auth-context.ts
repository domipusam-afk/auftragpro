/**
 * Auth rollout switch.
 *
 * Supabase Auth is intentionally not connected to the existing request chain
 * in Stage 6. Keeping the default fail-closed prevents an accidental deploy
 * configuration from changing the legacy username/password login.
 */
export type AuthMode = "legacy" | "supabase";

export const AUTH_MODE: AuthMode =
  process.env.AUTH_MODE === "supabase" ? "supabase" : "legacy";

export const isSupabaseAuthMode = AUTH_MODE === "supabase";
