"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/account";
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
  let userId: string | undefined;
  try { const result = await supabase.auth.signInWithPassword({ email, password }); error = result.error; userId = result.data.user?.id; }
  catch { redirect("/login?error=Layanan%20autentikasi%20tidak%20dapat%20dihubungi."); }
  if (error) redirect("/login?error=Email%20atau%20password%20tidak%20sesuai.");
  if (userId && (next === "/account" || next === "/")) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profile?.role === "admin") redirect("/admin");
  }
  redirect(next);
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!validEmail(email) || password.length < 8) redirect("/register?error=Gunakan%20email%20valid%20dan%20password%20minimal%208%20karakter.");
  let supabase;
  try { supabase = await createClient(); } catch { redirect("/register?error=Autentikasi%20belum%20dikonfigurasi."); }
  let data: Awaited<ReturnType<typeof supabase.auth.signUp>>["data"];
  let error: { message: string } | null;
  try { ({ data, error } = await supabase.auth.signUp({ email, password })); }
  catch { redirect("/register?error=Layanan%20autentikasi%20tidak%20dapat%20dihubungi."); }
  if (error) redirect("/register?error=Akun%20tidak%20dapat%20dibuat.%20Periksa%20data%20dan%20coba%20lagi.");
  if (data.session) redirect("/account");
  redirect("/login?message=Periksa%20email%20untuk%20mengonfirmasi%20akun.");
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
