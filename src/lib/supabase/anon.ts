import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/** Cookie-less anon client for public, cacheable reads. */
export function createAnonClient() {
  const { url, anonKey } = supabaseEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
