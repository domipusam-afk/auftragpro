import { createClient } from "@supabase/supabase-js";
import WS from "ws";

// Fallback-Werte für Render-Deployment (werden durch ENV-Variablen überschrieben)
const SUPABASE_URL_FALLBACK = "https://rbklkyozbefdjzaufszk.supabase.co";
const SUPABASE_KEY_FALLBACK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJia2xreW96YmVmZGp6YXVmc3prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Njk1MTUsImV4cCI6MjA5NDE0NTUxNX0.gcFKMlHay24dzaWZnL0y-oLrVDjGDoFTKmt0z_sTDsc";

const url = process.env.SUPABASE_URL || SUPABASE_URL_FALLBACK;
const key = process.env.SUPABASE_ANON_KEY || SUPABASE_KEY_FALLBACK;

console.log("Supabase URL:", url.substring(0, 40) + "...");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: {
    // ws polyfill for Node < 22
    transport: WS as unknown as typeof WebSocket,
  },
});

export default supabase;
