import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const destination = safeNext(requestUrl.searchParams.get("next"));

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(destination, requestUrl.origin));
      console.error("Supabase auth callback exchange failed", error);
    } catch (error) {
      console.error("Supabase auth callback unavailable", error);
    }
  }

  return NextResponse.redirect(new URL("/login?error=Konfirmasi%20email%20gagal.%20Coba%20daftar%20atau%20masuk%20lagi.", requestUrl.origin));
}
