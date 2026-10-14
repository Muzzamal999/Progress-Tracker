import { createBrowserClient } from "@supabase/ssr";

// NEXT_PUBLIC_* values must be referenced literally so they are inlined in the browser bundle.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
