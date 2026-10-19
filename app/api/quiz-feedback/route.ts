import { NextResponse } from "next/server";
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

  return NextResponse.json({ error: "Jawaban dan penjelasan akan dibuka setelah seluruh quiz dikirim." }, { status: 409 });
}
