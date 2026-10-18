import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Lesson } from "@/lib/learning";

export type PublicQuestion = {
  id?: string;
  prompt: string;
  options: string[];
  skill: string;
};

export type PublicChallenge = {
  slug: string;
  title: string;
  category: string;
  description: string;
  learning_objective?: string;
  difficulty: string;
  questions: PublicQuestion[];
};

type ModuleRow = {
  slug: string; title: string; summary: string; principle: string; example: string;
  practice: string; challenge_slug: string | null; next_slug: string | null;
};
type PublicQuestionRow = { id: string; position: number; prompt: string; skill: string; challenge_options?: { position: number; body: string }[] };
type PublicChallengeRow = { slug: string; title: string; category: string; description: string; learning_objective?: string; difficulty: string; challenge_questions?: PublicQuestionRow[] };

function toLesson(row: ModuleRow): Lesson {
  return { slug: row.slug, title: row.title, summary: row.summary, principle: row.principle,
    example: row.example, practice: row.practice, challengeSlug: row.challenge_slug ?? "",
    nextSlug: row.next_slug ?? "" };
}

export async function getPublishedModules(): Promise<Lesson[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("learning_modules")
      .select("slug,title,summary,principle,example,practice,challenge_slug,next_slug")
      .eq("published", true).order("title");
    if (error) return [];
    return ((data ?? []) as ModuleRow[]).map(toLesson);
  } catch { return []; }
}

export async function getPublishedModule(slug: string): Promise<Lesson | undefined> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("learning_modules")
      .select("slug,title,summary,principle,example,practice,challenge_slug,next_slug")
      .eq("slug", slug).eq("published", true).maybeSingle();
    if (error || !data) return undefined;
    return toLesson(data as ModuleRow);
  } catch { return undefined; }
}

export async function getPublishedChallenges(): Promise<PublicChallenge[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("challenges")
      .select("slug,title,category,description,learning_objective,difficulty,challenge_questions(id,position,prompt,skill,challenge_options(position,body))")
      .eq("published", true).order("title");
    if (error) return [];
    return ((data ?? []) as PublicChallengeRow[]).map((row) => ({
      slug: row.slug, title: row.title, category: row.category, description: row.description, learning_objective: row.learning_objective, difficulty: row.difficulty,
      questions: [...(row.challenge_questions ?? [])].sort((a, b) => a.position - b.position).map((question) => ({
        id: question.id, prompt: question.prompt, skill: question.skill,
        options: [...(question.challenge_options ?? [])].sort((a, b) => a.position - b.position).map((option) => option.body),
      })),
    }));
  } catch { return []; }
}

export async function getPublishedChallenge(slug: string): Promise<PublicChallenge | undefined> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("challenges")
      .select("slug,title,category,description,learning_objective,difficulty,challenge_questions(id,position,prompt,skill,challenge_options(position,body))")
      .eq("slug", slug).eq("published", true).maybeSingle();
    if (error || !data) return undefined;
    const row = data as PublicChallengeRow;
    return {
      slug: row.slug, title: row.title, category: row.category, description: row.description, learning_objective: row.learning_objective, difficulty: row.difficulty,
      questions: [...(row.challenge_questions ?? [])].sort((a, b) => a.position - b.position).map((question) => ({
        id: question.id, prompt: question.prompt, skill: question.skill,
        options: [...(question.challenge_options ?? [])].sort((a, b) => a.position - b.position).map((option) => option.body),
      })),
    };
  } catch { return undefined; }
}
