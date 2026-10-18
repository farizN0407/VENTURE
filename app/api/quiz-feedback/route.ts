import { NextResponse } from "next/server";
import { challenges } from "@/lib/challenges";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const data = body as Record<string, unknown>;
  if (typeof data.challenge_slug !== "string" || !Number.isInteger(data.question_index) || !Number.isInteger(data.option_index)) return NextResponse.json({ error: "Invalid answer." }, { status: 400 });

  if (data.challenge_slug === "homepage-preview" && data.question_index === 0) {
    if ((data.option_index as number) < 0 || (data.option_index as number) > 3) return NextResponse.json({ error: "Question not found." }, { status: 404 });
    return NextResponse.json({ is_correct: data.option_index === 2, explanation: data.option_index === 2
      ? "Prompt yang efektif menyebutkan konteks, tujuan, audiens, dan format hasil."
      : "Prompt yang spesifik menyebutkan konteks, tujuan, dan format yang diinginkan." });
  }

  const challenge = challenges.find((item) => item.slug === data.challenge_slug);
  if (challenge) {
    const question = challenge.questions[data.question_index as number];
    if (!question || (data.option_index as number) < 0 || (data.option_index as number) >= question.options.length) return NextResponse.json({ error: "Question not found." }, { status: 404 });
    return NextResponse.json({ is_correct: data.option_index === question.correctIndex, explanation: question.explanation });
  }

  if (typeof data.question_id !== "string" || !/^[0-9a-f-]{36}$/i.test(data.question_id)) return NextResponse.json({ error: "Question not found." }, { status: 404 });
  let supabase;
  try { supabase = await createClient(); } catch { return NextResponse.json({ error: "Database grading is not configured." }, { status: 503 }); }
  const { data: feedback, error } = await supabase.rpc("grade_quiz_question", {
    p_challenge_slug: data.challenge_slug,
    p_position: (data.question_index as number) + 1,
    p_option_position: data.option_index as number,
  });
  if (error || !feedback) return NextResponse.json({ error: "Question is unavailable." }, { status: 404 });
  return NextResponse.json(feedback);
}
