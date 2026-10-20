"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidUsername, normalizeUsername } from "@/lib/username";

function safeNext(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  if (!validEmail(email) || !password) redirect("/login?error=Periksa%20format%20email%20dan%20password.");
  let supabase;
  try { supabase = await createClient(); } catch { redirect("/login?error=Autentikasi%20belum%20dikonfigurasi."); }
  let error: { message: string } | null;
  try { ({ error } = await supabase.auth.signInWithPassword({ email, password })); }
  catch { redirect("/login?error=Layanan%20autentikasi%20tidak%20dapat%20dihubungi."); }
  if (error) redirect("/login?error=Email%20atau%20password%20tidak%20sesuai.");
  redirect(next);
}

export async function signUp(formData: FormData) {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  if (!isValidUsername(username)) redirect("/register?error=Username%20harus%203%E2%80%9324%20karakter%3A%20huruf%2C%20angka%2C%20atau%20underscore.");
  if (!validEmail(email) || password.length < 8) redirect("/register?error=Gunakan%20email%20valid%20dan%20password%20minimal%208%20karakter.");
  let supabase;
  try { supabase = await createClient(); } catch { redirect("/register?error=Autentikasi%20belum%20dikonfigurasi."); }
  let data: Awaited<ReturnType<typeof supabase.auth.signUp>>["data"];
  let error: { message: string } | null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  let emailRedirectTo: string | undefined;
  if (siteUrl) {
    try {
      const callbackUrl = new URL("/auth/callback", siteUrl);
      callbackUrl.searchParams.set("next", next);
      emailRedirectTo = callbackUrl.toString();
    }
    catch { redirect("/register?error=URL%20situs%20tidak%20valid.%20Periksa%20NEXT_PUBLIC_SITE_URL."); }
  }
  try {
    ({ data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username }, ...(emailRedirectTo ? { emailRedirectTo } : {}) },
    }));
  }
  catch { redirect("/register?error=Layanan%20autentikasi%20tidak%20dapat%20dihubungi."); }
  if (error) {
    if (/username|profiles_username|duplicate key|unique constraint/i.test(error.message)) redirect("/register?error=Username%20sudah%20digunakan.%20Pilih%20username%20lain.");
    redirect("/register?error=Akun%20tidak%20dapat%20dibuat.%20Periksa%20email%2C%20username%2C%20dan%20coba%20lagi.");
  }
  if (data.session) redirect(next);
  redirect("/login?message=Periksa%20email%20untuk%20mengonfirmasi%20akun.");
}

export async function updateUsername(formData: FormData) {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  if (!isValidUsername(username)) redirect("/account?error=Username%20harus%203%E2%80%9324%20karakter%3A%20huruf%2C%20angka%2C%20atau%20underscore.");
  let supabase;
  try { supabase = await createClient(); } catch { redirect("/login?next=%2Faccount"); }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount");
  const { data, error } = await supabase.from("profiles").update({ username }).eq("id", user.id).select("username").single();
  if (error) {
    if (error.code === "23505" || /profiles_username_lower/i.test(error.message)) redirect("/account?error=Username%20sudah%20digunakan.%20Pilih%20username%20lain.");
    if (error.code === "42703" || error.code === "PGRST204") redirect("/account?error=Kolom%20username%20belum%20tersedia.%20Jalankan%20migrasi%20username%20Promptly%20di%20Supabase.");
    console.error("Username update failed", { code: error.code, message: error.message });
    redirect("/account?error=Username%20gagal%20diperbarui.%20Periksa%20koneksi%20dan%20coba%20lagi.");
  }
  if (data?.username !== username) redirect("/account?error=Perubahan%20username%20belum%20dapat%20diverifikasi.");
  redirect("/account?saved=username");
}

export async function signOut() {
  let supabase;
  try { supabase = await createClient(); } catch { redirect("/login?error=Autentikasi%20belum%20dikonfigurasi."); }
  let error: { message: string } | null;
  try { ({ error } = await supabase.auth.signOut()); }
  catch { redirect(`/login?error=${encodeURIComponent("Tidak dapat keluar. Silakan coba lagi.")}`); }
  if (error) redirect(`/login?error=${encodeURIComponent("Tidak dapat keluar. Silakan coba lagi.")}`);
  redirect("/");
}
