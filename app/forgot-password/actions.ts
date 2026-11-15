"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createRecoveryRedirectUrl } from "@/lib/auth-recovery";

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!validEmail(email)) redirect("/forgot-password?error=Masukkan%20alamat%20email%20yang%20valid.");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) redirect("/forgot-password?error=URL%20situs%20belum%20dikonfigurasi.%20Hubungi%20administrator.");
  let redirectTo: string;
  try { redirectTo = createRecoveryRedirectUrl(siteUrl); }
  catch { redirect("/forgot-password?error=URL%20situs%20tidak%20valid.%20Hubungi%20administrator."); }

  let supabase;
  try { supabase = await createClient(); }
  catch { redirect("/forgot-password?error=Autentikasi%20belum%20dikonfigurasi."); }
  let recoveryError: { message: string } | null;
  try { ({ error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })); }
  catch { redirect("/forgot-password?error=Layanan%20autentikasi%20tidak%20dapat%20dihubungi."); }
  if (recoveryError) {
    console.error("Password recovery request failed", { message: recoveryError.message });
    redirect("/forgot-password?error=Email%20pemulihan%20belum%20dapat%20dikirim.%20Periksa%20konfigurasi%20Supabase%20Auth.");
  }

  // Keep the response generic so the form does not reveal whether an email is registered.
  redirect("/forgot-password?message=Jika%20akun%20dengan%20email%20tersebut%20tersedia%2C%20email%20pemulihan%20akan%20dikirim.%20Periksa%20kotak%20masuk%20dan%20spam.");
}
