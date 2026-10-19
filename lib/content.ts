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
  module_slug?: string | null;
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
type PublicChallengeRow = { slug: string; module_slug: string | null; title: string; category: string; description: string; learning_objective?: string; difficulty: string; challenge_questions?: PublicQuestionRow[] };

export class PublishedContentError extends Error {
  constructor(kind: "materi" | "challenge") {
    super(`Daftar ${kind} dari Supabase belum dapat dimuat. Periksa koneksi, izin SELECT, dan kebijakan RLS untuk konten published.`);
    this.name = "PublishedContentError";
  }
}

async function publicContentClient(kind: "materi" | "challenge") {
  try {
    return await createClient();
  } catch (error) {
    console.error(`Published ${kind} query could not connect to Supabase`, error);
    throw new PublishedContentError(kind);
  }
}

function toLesson(row: ModuleRow): Lesson {
  return { slug: row.slug, title: row.title, summary: row.summary, principle: row.principle,
    example: row.example, practice: row.practice, challengeSlug: row.challenge_slug ?? "",
    nextSlug: row.next_slug ?? "" };
}

export async function getPublishedModules(): Promise<Lesson[]> {
  const supabase = await publicContentClient("materi");
  const { data, error } = await supabase.from("learning_modules")
    .select("slug,title,summary,principle,example,practice,challenge_slug,next_slug")
    .eq("published", true).order("title");
  if (error) {
    console.error("Published learning modules query failed", error);
    throw new PublishedContentError("materi");
  }
  return ((data ?? []) as ModuleRow[]).map(toLesson);
}

export async function getPublishedModule(slug: string): Promise<Lesson | undefined> {
  const supabase = await publicContentClient("materi");
  const { data, error } = await supabase.from("learning_modules")
    .select("slug,title,summary,principle,example,practice,challenge_slug,next_slug")
    .eq("slug", slug).eq("published", true).maybeSingle();
  if (error) {
    console.error("Published learning module query failed", error);
    throw new PublishedContentError("materi");
  }
  return data ? toLesson(data as ModuleRow) : undefined;
}

export async function getPublishedChallenges(): Promise<PublicChallenge[]> {
  const supabase = await publicContentClient("challenge");
  const { data, error } = await supabase.from("challenges")
    .select("slug,module_slug,title,category,description,learning_objective,difficulty,challenge_questions(id,position,prompt,skill,challenge_options(position,body))")
    .eq("published", true).order("title");
  if (error) {
    console.error("Published challenges query failed", error);
    throw new PublishedContentError("challenge");
  }
  return ((data ?? []) as PublicChallengeRow[]).map(toPublicChallenge);
}

export async function getPublishedChallenge(slug: string): Promise<PublicChallenge | undefined> {
  const supabase = await publicContentClient("challenge");
  const { data, error } = await supabase.from("challenges")
    .select("slug,module_slug,title,category,description,learning_objective,difficulty,challenge_questions(id,position,prompt,skill,challenge_options(position,body))")
    .eq("slug", slug).eq("published", true).maybeSingle();
  if (error) {
    console.error("Published challenge query failed", error);
    throw new PublishedContentError("challenge");
  }
  return data ? toPublicChallenge(data as PublicChallengeRow) : undefined;
}

function toPublicChallenge(row: PublicChallengeRow): PublicChallenge {
  return {
    slug: row.slug, module_slug: row.module_slug, title: row.title, category: row.category, description: row.description,
    learning_objective: row.learning_objective, difficulty: row.difficulty,
    questions: [...(row.challenge_questions ?? [])].sort((a, b) => a.position - b.position).map((question) => ({
      id: question.id, prompt: question.prompt, skill: question.skill,
      options: [...(question.challenge_options ?? [])].sort((a, b) => a.position - b.position).map((option) => option.body),
    })),
  };
}
