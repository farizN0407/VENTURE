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

function challengeSaveErrorMessage(error: unknown) {
  const details = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
  const code = typeof details.code === "string" ? details.code : "";
  const message = typeof details.message === "string" ? details.message : "";
  if (code === "42501" || /admin access required|row-level security|permission denied/i.test(message)) {
    return "Supabase menolak penyimpanan. Pastikan sesi login memiliki role admin dan policy RLS admin aktif.";
  }
  if (code === "23503") {
    return "Slug materi terkait tidak ditemukan. Kosongkan atau gunakan slug materi yang sudah tersimpan.";
  }
  if (code === "PGRST202" || code === "PGRST203" || code === "42883") {
    return "RPC admin_save_challenge tidak cocok dengan fungsi yang tersedia di Supabase. Periksa nama parameter p_payload dan schema cache.";
  }
  if (code === "23514" || code === "22P02" || /questions|correct option|slug/i.test(message)) {
    return "Supabase menolak data challenge. Periksa slug custom, tingkat kesulitan, format JSON soal, dan jawaban benar.";
  }
  return "Challenge gagal disimpan. Periksa log server Promptly untuk detail error Supabase.";
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
  try {
    const { error } = await supabase.rpc("admin_save_challenge", { p_payload: payload });
    if (error) {
      console.error("Admin challenge RPC returned an error", { code: error.code, message: error.message, details: error.details, hint: error.hint });
      backWithError(challengeSaveErrorMessage(error));
    }
  } catch (error) {
    // Supabase returns database errors in the response, but network/transport
    // failures can reject the promise. Keep those from escaping as an invalid
    // Server Action response.
    // Next redirect signals are intentionally allowed through unchanged.
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
    console.error("Admin challenge RPC request failed", error);
    backWithError("Challenge gagal disimpan karena layanan Supabase tidak dapat dihubungi.");
  }

  // The SQL function returns void, so a successful RPC has no row payload.
  // Verify the persisted challenge and its question count before reporting success.
  try {
    const [{ data: savedChallenge, error: verifyError }, { count: questionCount, error: questionError }] = await Promise.all([
      supabase.from("challenges").select("slug,published,module_slug").eq("slug", slug).maybeSingle(),
      supabase.from("challenge_questions").select("id", { count: "exact", head: true }).eq("challenge_slug", slug),
    ]);
    if (verifyError || questionError) {
      const verificationError = verifyError ?? questionError;
      console.error("Admin challenge persistence verification failed", { code: verificationError?.code, message: verificationError?.message });
      backWithError("RPC berhasil merespons, tetapi hasil simpan belum dapat diverifikasi. Periksa izin baca admin dan coba muat ulang daftar.");
    }
    if (!savedChallenge || savedChallenge.published !== payload.published || savedChallenge.module_slug !== payload.module_slug || questionCount !== validQuestions.length) {
      console.error("Admin challenge persistence verification mismatch", { slug, expectedQuestions: validQuestions.length, actualQuestions: questionCount, expectedPublished: payload.published, actualPublished: savedChallenge?.published });
      backWithError("Challenge belum tersimpan lengkap. Daftar challenge dan jumlah soalnya tidak cocok dengan data form.");
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
    console.error("Admin challenge persistence verification request failed", error);
    backWithError("Challenge mungkin sudah diproses, tetapi verifikasi Supabase gagal. Muat ulang daftar sebelum mencoba menyimpan lagi.");
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
