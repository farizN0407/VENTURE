import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export function createClient() {
  const config = getPublicSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  return createBrowserClient(config.url, config.key);
}
