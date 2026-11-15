"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateNewPassword } from "@/lib/auth-recovery";

export async function updateRecoveredPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");
  const validationError = validateNewPassword(password, confirmation);
  if (validationError) redirect(`/reset-password?error=${encodeURIComponent(validationError)}`);

  const cookieStore = await cookies();
  if (cookieStore.get("promptly-password-recovery")?.value !== "verified") {
    redirect("/reset-password?error=Sesi%20pemulihan%20tidak%20valid.%20Minta%20link%20pemulihan%20baru.");
  }

  let supabase;
  try { supabase = await createClient(); }
  catch { redirect("/reset-password?error=Autentikasi%20belum%20dikonfigurasi."); }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/reset-password?error=Sesi%20pemulihan%20sudah%20kedaluwarsa.%20Minta%20link%20baru.");

  let updateError: { message: string } | null;
  try { ({ error: updateError } = await supabase.auth.updateUser({ password })); }
  catch { redirect("/reset-password?error=Layanan%20autentikasi%20tidak%20dapat%20dihubungi.%20Coba%20lagi."); }
  if (updateError) {
    console.error("Password update failed", { message: updateError.message });
    redirect("/reset-password?error=Password%20belum%20dapat%20diperbarui.%20Periksa%20ketentuan%20password%20dan%20coba%20lagi.");
  }

  cookieStore.set("promptly-password-recovery", "", { httpOnly: true, sameSite: "lax", path: "/reset-password", maxAge: 0 });
  try { await supabase.auth.signOut({ scope: "local" }); }
  catch { /* Password was updated; sign-out is best-effort. */ }
  redirect("/login?message=Password%20berhasil%20diperbarui.%20Silakan%20masuk%20dengan%20password%20baru.");
}
