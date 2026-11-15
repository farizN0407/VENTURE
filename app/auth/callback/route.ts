import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPasswordRecoveryCallback } from "@/lib/auth-recovery";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const destination = safeNext(requestUrl.searchParams.get("next"));
  const recoveryFlow = isPasswordRecoveryCallback(requestUrl.searchParams.get("flow"), destination);

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const response = NextResponse.redirect(new URL(destination, requestUrl.origin));
        if (recoveryFlow) response.cookies.set("promptly-password-recovery", "verified", {
          httpOnly: true,
          secure: requestUrl.protocol === "https:",
          sameSite: "lax",
          path: "/reset-password",
          maxAge: 15 * 60,
        });
        return response;
      }
      console.error("Supabase auth callback exchange failed", error);
    } catch (error) {
      console.error("Supabase auth callback unavailable", error);
    }
  }

  if (recoveryFlow) return NextResponse.redirect(new URL("/reset-password?error=Link%20pemulihan%20kedaluwarsa%20atau%20tidak%20valid.%20Minta%20link%20baru.", requestUrl.origin));
  return NextResponse.redirect(new URL("/login?error=Konfirmasi%20email%20gagal.%20Coba%20daftar%20atau%20masuk%20lagi.", requestUrl.origin));
}
