import { createClient } from "@supabase/supabase-js";

// These are public Supabase project settings. Vite only exposes variables
// prefixed with VITE_ to browser code, so they intentionally have a separate
// public name from the server's SUPABASE_* settings. The fallback matches the
// existing anonymous project configuration in server/supabase.ts and is never
// a service-role credential.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://rbklkyozbefdjzaufszk.supabase.co";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJia2xreW96YmVmZGp6YXVmc3prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Njk1MTUsImV4cCI6MjA5NDE0NTUxNX0.gcFKMlHay24dzaWZnL0y-oLrVDjGDoFTKmt0z_sTDsc";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
