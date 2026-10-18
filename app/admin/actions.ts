"use server";

import { redirect } from "next/navigation";
import { challenges as staticChallenges } from "@/lib/challenges";
import { createClient } from "@/lib/supabase/server";

const slugPattern = /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const skills = new Set(["Prompting", "Critical Thinking", "Fact Checking", "AI Knowledge", "Practical Application"]);

async function requireAdmin() {
  let supabase;
  try { supabase = await createClient(); } catch { redirect("/login?next=%2Fadmin"); }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fadmin");
  const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error || profile?.role !== "admin") redirect("/account");
  return { supabase, user };
}

function field(form: FormData, name: string, max: number) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function backWithError(message: string): never {
  redirect(`/admin?error=${encodeURIComponent(message)}`);
}

export async function saveModule(form: FormData) {
  const { supabase, user } = await requireAdmin();
  const row = {
    slug: field(form, "slug", 100), title: field(form, "title", 120), summary: field(form, "summary", 500),
    principle: field(form, "principle", 5000), example: field(form, "example", 5000), practice: field(form, "practice", 5000),
    challenge_slug: field(form, "challenge_slug", 100) || null, next_slug: field(form, "next_slug", 100) || null,
    published: form.get("published") === "on", created_by: user.id, updated_at: new Date().toISOString(),
  };
  if (!slugPattern.test(row.slug) || !row.title || !row.summary || !row.principle || !row.example || !row.practice) backWithError("Lengkapi semua isi materi dan gunakan slug custom-kebab-case.");
  const { error } = await supabase.from("learning_modules").upsert(row, { onConflict: "slug" });
  if (error) backWithError("Materi gagal disimpan. Periksa slug, database, dan kebijakan admin.");
  redirect("/admin?saved=module");
}

export async function deleteModule(form: FormData) {
  const { supabase } = await requireAdmin();
  const slug = field(form, "slug", 100);
  if (!slugPattern.test(slug)) backWithError("Slug materi tidak valid.");
  const { error } = await supabase.from("learning_modules").delete().eq("slug", slug);
  if (error) backWithError("Materi gagal dihapus.");
  redirect("/admin?saved=deleted");
}

export async function saveChallenge(form: FormData) {
  const { supabase } = await requireAdmin();
  const slug = field(form, "slug", 100);
  const title = field(form, "title", 120);
  const category = field(form, "category", 80);
  const description = field(form, "description", 500);
  const learningObjective = field(form, "learning_objective", 1000);
  const difficulty = field(form, "difficulty", 20);
  const moduleSlug = field(form, "module_slug", 100);
  if (!slugPattern.test(slug) || !title || !category || !description || !learningObjective || !["Pemula", "Menengah", "Lanjutan"].includes(difficulty)) backWithError("Data challenge tidak valid atau belum lengkap.");
  let questions: unknown;
  try { questions = JSON.parse(field(form, "questions", 50000)); } catch { backWithError("Questions harus berupa JSON yang valid."); }
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 50) backWithError("Challenge harus memiliki 1–50 pertanyaan.");
  const validQuestions = questions.map((question) => {
    if (!question || typeof question !== "object") return null;
    const item = question as Record<string, unknown>;
    if (typeof item.prompt !== "string" || !item.prompt.trim() || item.prompt.length > 2000 || typeof item.explanation !== "string" || !item.explanation.trim() || item.explanation.length > 3000 || typeof item.skill !== "string" || !skills.has(item.skill)) return null;
    if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 10 || !item.options.every((option) => typeof option === "string" && option.trim().length > 0 && option.length <= 1000)) return null;
    if (!Number.isInteger(item.correctIndex) || (item.correctIndex as number) < 0 || (item.correctIndex as number) >= item.options.length) return null;
    return { prompt: item.prompt.trim(), options: item.options.map((option: string) => option.trim()), correctIndex: item.correctIndex, explanation: item.explanation.trim(), skill: item.skill };
  });
  if (validQuestions.some((question) => question === null)) backWithError("Periksa prompt, opsi, correctIndex, explanation, dan skill setiap soal.");
  const payload = { slug, title, category, description, learning_objective: learningObjective, difficulty, module_slug: moduleSlug || null, published: form.get("published") === "on", questions: validQuestions };
  const { error } = await supabase.rpc("admin_save_challenge", { p_payload: payload });
  if (error) {
    console.error("Admin challenge save failed", error);
    backWithError("Challenge gagal disimpan. Pastikan migrasi schema sudah diterapkan dan admin terverifikasi.");
  }
  redirect("/admin?saved=challenge");
}

export async function deleteChallenge(form: FormData) {
  const { supabase } = await requireAdmin();
  const slug = field(form, "slug", 100);
  if (!slugPattern.test(slug) || staticChallenges.some((challenge) => challenge.slug === slug)) backWithError("Slug challenge tidak valid.");
  const { error } = await supabase.from("challenges").delete().eq("slug", slug);
  if (error) backWithError("Challenge gagal dihapus.");
  redirect("/admin?saved=deleted");
}
