import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CHALLENGE_TOPICS, selectTopicQuestions, TOPIC_SLUGS, type TopicSlug } from "@/lib/topic-quizzes";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const data = body as Record<string, unknown>;
  if (typeof data.topic_slug !== "string" || !TOPIC_SLUGS.includes(data.topic_slug as TopicSlug)) return NextResponse.json({ error: "Learning topic not found." }, { status: 404 });
  if (data.challenge_slug !== undefined && typeof data.challenge_slug !== "string") return NextResponse.json({ error: "Invalid challenge." }, { status: 400 });
  if (typeof data.challenge_slug === "string" && CHALLENGE_TOPICS[data.challenge_slug] !== data.topic_slug) return NextResponse.json({ error: "Challenge and learning topic do not match." }, { status: 400 });
  const clientExcluded = Array.isArray(data.excluded_question_ids) ? data.excluded_question_ids.filter((value): value is string => typeof value === "string").slice(0, 1000) : [];
  const excluded = new Set<string>();
  let guestAttemptTracking = true;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      guestAttemptTracking = false;
      const { data: attempts } = await supabase.from("quiz_attempts").select("answer_details")
        .eq("user_id", user.id).eq("topic_slug", data.topic_slug).order("created_at", { ascending: false }).limit(1000);
      for (const attempt of attempts ?? []) {
        if (Array.isArray(attempt.answer_details)) {
          for (const answer of attempt.answer_details) {
            if (answer && typeof answer === "object" && typeof (answer as Record<string, unknown>).question_id === "string") excluded.add((answer as Record<string, unknown>).question_id as string);
          }
        }
      }
    } else {
      for (const id of clientExcluded) excluded.add(id);
    }
  } catch {
    // Guest quizzes remain available without Supabase. The browser tracks its completed guest attempts locally.
    for (const id of clientExcluded) excluded.add(id);
  }

  const quiz = selectTopicQuestions(data.topic_slug as TopicSlug, [...excluded]);
  return NextResponse.json({ attempt_id: quiz.attemptId, topic_slug: data.topic_slug, questions: quiz.questions, total_questions: 5, guest_attempt_tracking: guestAttemptTracking });
}
