import { NextResponse } from "next/server";
import { challenges } from "@/lib/challenges";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { challenge_slug, correct_answers, total_questions } = body as Record<string, unknown>;
  const challenge = challenges.find((item) => item.slug === challenge_slug);
  if (!challenge || !Number.isInteger(correct_answers) || !Number.isInteger(total_questions) || total_questions !== challenge.questions.length || (correct_answers as number) < 0 || (correct_answers as number) > (total_questions as number)) {
    return NextResponse.json({ error: "Invalid quiz result." }, { status: 400 });
  }
  let supabase;
  try { supabase = await createClient(); } catch { return NextResponse.json({ error: "Supabase belum dikonfigurasi." }, { status: 503 }); }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Masuk untuk menyimpan hasil." }, { status: 401 });
  const { error } = await supabase.from("quiz_attempts").insert({ user_id: user.id, challenge_slug: challenge.slug, score: Math.round(((correct_answers as number) / challenge.questions.length) * 100), total_questions: challenge.questions.length, correct_answers });
  if (error) {
    console.error("Quiz attempt save failed", error);
    return NextResponse.json({ error: "Hasil tidak dapat disimpan. Pastikan schema Supabase sudah diterapkan." }, { status: 503 });
  }
  return NextResponse.json({ saved: true }, { status: 201 });
}
