export function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;

  let parsedUrl: URL;
  try { parsedUrl = new URL(url); }
  catch { throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL."); }
  const localHttpHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && localHttpHosts.has(parsedUrl.hostname))) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS, except for a local Supabase development URL.");
  }
  return { url, key };
}
