"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  if (!email || !password) redirect("/login?error=Masukkan%20email%20dan%20password.");
  let supabase;
  try { supabase = await createClient(); } catch { redirect("/login?error=Autentikasi%20belum%20dikonfigurasi."); }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(next);
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) redirect("/login?error=Gunakan%20email%20valid%20dan%20password%20minimal%208%20karakter.");
  let supabase;
  try { supabase = await createClient(); } catch { redirect("/login?error=Autentikasi%20belum%20dikonfigurasi."); }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (data.session) redirect("/account");
  redirect("/login?message=Periksa%20email%20untuk%20mengonfirmasi%20akun.");
}

export async function signOut() {
  let supabase;
  try { supabase = await createClient(); } catch { redirect("/login?error=Autentikasi%20belum%20dikonfigurasi."); }
  await supabase.auth.signOut();
  redirect("/");
}
