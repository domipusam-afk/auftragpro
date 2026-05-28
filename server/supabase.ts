import { createClient } from "@supabase/supabase-js";
import WS from "ws";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment");
}

const supabase = createClient(url || "", key || "", {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: {
    // ws polyfill for Node < 22
    transport: WS as unknown as typeof WebSocket,
  },
});

export default supabase;
