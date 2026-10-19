import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Keep guest browsing and local setup errors graceful until credentials exist.
  let config: ReturnType<typeof getPublicSupabaseConfig>;
  try { config = getPublicSupabaseConfig(); }
  catch (error) {
    console.error("Supabase URL configuration is invalid", error);
    return response;
  }
  if (!config) return response;

  try {
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // Verifies session claims and refreshes expired tokens; protected pages
    // still independently verify the user and role before returning private data.
    await supabase.auth.getClaims();
  } catch (error) {
    console.error("Supabase session refresh failed", error);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
