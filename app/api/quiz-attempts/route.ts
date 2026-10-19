import { NextResponse } from "next/server";
import { challenges } from "@/lib/challenges";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHALLENGE_TOPICS, gradeTopicQuestions, TOPIC_SLUGS, type TopicAnswer, type TopicSlug } from "@/lib/topic-quizzes";

function summarize(challenge: typeof challenges[number], answers: number[]) {
  const details = challenge.questions.map((question, index) => ({ question: index + 1, prompt: question.prompt, skill: question.skill,
    is_correct: answers[index] === question.correctIndex, selected_answer: question.options[answers[index]],
    correct_answer: question.options[question.correctIndex], explanation: question.explanation }));
  const correct = details.filter((item) => item.is_correct).length;
  const perSkill = new Map<string, { correct: number; total: number }>();
  for (const item of details) {
    const current = perSkill.get(item.skill) ?? { correct: 0, total: 0 };
    current.total += 1;
    if (item.is_correct) current.correct += 1;
    perSkill.set(item.skill, current);
  }
  return {
    correct_answers: correct,
    total_questions: details.length,
    score: Math.round(correct * 100 / details.length),
    answer_details: details,
    skill_results: [...perSkill].map(([skill, result]) => ({ skill, ...result, score: Math.round(result.correct * 100 / result.total) })),
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const data = body as Record<string, unknown>;
  if (typeof data.topic_slug === "string") {
    const topic = data.topic_slug as TopicSlug;
    if (!TOPIC_SLUGS.includes(topic) || typeof data.attempt_id !== "string" || !/^[0-9a-f-]{36}$/i.test(data.attempt_id) || !Array.isArray(data.answers)) return NextResponse.json({ error: "Invalid topic quiz result." }, { status: 400 });
    const targetChallenge = typeof data.challenge_slug === "string" && CHALLENGE_TOPICS[data.challenge_slug] === topic ? data.challenge_slug : `topic-${topic}`;
    let summary;
    try { summary = gradeTopicQuestions(topic, data.answers as TopicAnswer[]); }
    catch { return NextResponse.json({ error: "Quiz answers could not be verified." }, { status: 400 }); }

    let supabase;
    try { supabase = await createClient(); } catch { return NextResponse.json({ ...summary, saved: false, save_reason: "guest" }); }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ ...summary, saved: false, save_reason: "guest" });

    let admin;
    try { admin = createAdminClient(); } catch { return NextResponse.json({ ...summary, saved: false, save_reason: "storage_unavailable" }); }
    const record = {
      user_id: user.id,
      challenge_slug: targetChallenge,
      topic_slug: topic,
      attempt_id: data.attempt_id,
      score: summary.score,
      correct_answers: summary.correct_answers,
      total_questions: summary.total_questions,
      skill_results: summary.skill_results,
      answer_details: summary.review,
    };
    const { error } = await admin.from("quiz_attempts").insert(record);
    if (!error) return NextResponse.json({ ...summary, saved: true });

    if (error.code === "23505") {
      const { data: existing } = await admin.from("quiz_attempts").select("score,correct_answers,total_questions,skill_results,answer_details")
        .eq("user_id", user.id).eq("attempt_id", data.attempt_id).maybeSingle();
      if (existing) return NextResponse.json({ score: existing.score, correct_answers: existing.correct_answers, total_questions: existing.total_questions, skill_results: existing.skill_results, review: existing.answer_details, saved: true });
    }
    console.error("Topic quiz attempt save failed", error);
    return NextResponse.json({ ...summary, saved: false, save_reason: "storage_unavailable" });
  }

  const { challenge_slug, answers } = data;
  if (typeof challenge_slug !== "string" || !Array.isArray(answers) || !answers.every((answer) => Number.isInteger(answer))) return NextResponse.json({ error: "Invalid quiz result." }, { status: 400 });
  if (typeof data.attempt_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.attempt_id)) return NextResponse.json({ error: "Invalid quiz attempt id." }, { status: 400 });

  const staticChallenge = challenges.find((item) => item.slug === challenge_slug);
  if (staticChallenge) {
    if (answers.length !== staticChallenge.questions.length || answers.some((answer, index) => (answer as number) < 0 || (answer as number) >= staticChallenge.questions[index].options.length)) return NextResponse.json({ error: "Invalid quiz result." }, { status: 400 });
    const summary = summarize(staticChallenge, answers as number[]);
    let supabase;
    try { supabase = await createClient(); } catch {
      return NextResponse.json({ ...summary, saved: false, save_reason: "guest" });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ ...summary, saved: false, save_reason: "guest" });
    let admin;
    try { admin = createAdminClient(); } catch {
      return NextResponse.json({ ...summary, saved: false, save_reason: "storage_unavailable" });
    }
    const { error } = await admin.from("quiz_attempts").insert({ user_id: user.id, challenge_slug: staticChallenge.slug, attempt_id: data.attempt_id, score: summary.score,
      correct_answers: summary.correct_answers, total_questions: summary.total_questions, skill_results: summary.skill_results, answer_details: summary.answer_details });
    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await admin.from("quiz_attempts").select("score,correct_answers,total_questions,skill_results,answer_details")
          .eq("user_id", user.id).eq("attempt_id", data.attempt_id).maybeSingle();
        if (existing) return NextResponse.json({ score: existing.score, correct_answers: existing.correct_answers, total_questions: existing.total_questions,
          skill_results: existing.skill_results, review: existing.answer_details, saved: true });
      }
      console.error("Quiz attempt save failed", error);
      return NextResponse.json({ ...summary, saved: false, save_reason: "storage_unavailable" });
    }
    return NextResponse.json({ ...summary, saved: true });
  }

  let supabase;
  try { supabase = await createClient(); } catch { return NextResponse.json({ error: "This database challenge is unavailable." }, { status: 503 }); }
  const { data: result, error } = await supabase.rpc("submit_quiz_attempt", { p_challenge_slug: challenge_slug, p_answers: answers, p_attempt_id: data.attempt_id });
  if (error || !result) return NextResponse.json({ error: "Quiz answers could not be verified." }, { status: 400 });
  return NextResponse.json(result);
}
