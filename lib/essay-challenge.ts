import { canAccessFeature, resolvePlan, type SubscriptionRecord } from "./entitlements.ts";

export const ESSAY_CHALLENGE = {
  slug: "academic-research-assistant",
  topic: "Prompting",
  title: "Academic Research Assistant",
  instructions: "Write an effective prompt that instructs an AI assistant to summarize a research paper, identify its key findings, and explain its limitations. The AI must not invent citations or unsupported claims.",
} as const;

export const ESSAY_MAX_LENGTH = 5000;
export const ESSAY_MIN_LENGTH = 20;
export const ESSAY_CRITERIA = [
  { key: "clarityInstructions", label: "Clarity & Instructions" },
  { key: "contextRelevance", label: "Context & Relevance" },
  { key: "outputStructure", label: "Output Structure" },
  { key: "accuracyResponsibleAI", label: "Accuracy & Responsible AI" },
] as const;

export type EssayCriterionKey = (typeof ESSAY_CRITERIA)[number]["key"];
export type EssayCriterionScore = { score: number; feedback: string };
export type EssayEvaluation = {
  criteria: Record<EssayCriterionKey, EssayCriterionScore>;
  totalScore: number;
  strengths: string[];
  improvements: string[];
  improvedPrompt: string;
};
export type EssayAttemptRecord = {
  id: string;
  answer: string;
  criteria_scores: EssayEvaluation["criteria"];
  total_score: number;
  feedback: Pick<EssayEvaluation, "strengths" | "improvements" | "improvedPrompt">;
  submitted_at: string;
};

export function parseEssaySubmission(value: unknown): { challengeSlug: typeof ESSAY_CHALLENGE.slug; answer: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Kirim data essay yang valid.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["challenge_slug", "answer"].includes(key))) throw new Error("Permintaan berisi field yang tidak didukung.");
  if (body.challenge_slug !== ESSAY_CHALLENGE.slug) throw new Error("Essay challenge tidak ditemukan.");
  if (typeof body.answer !== "string") throw new Error("Jawaban harus berupa teks.");
  const answer = body.answer.trim();
  if (answer.length < ESSAY_MIN_LENGTH) throw new Error(`Prompt harus berisi sedikitnya ${ESSAY_MIN_LENGTH} karakter.`);
  if (answer.length > ESSAY_MAX_LENGTH) throw new Error(`Prompt tidak boleh lebih dari ${ESSAY_MAX_LENGTH} karakter.`);
  return { challengeSlug: ESSAY_CHALLENGE.slug, answer };
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export function parseEssayEvaluation(value: unknown): EssayEvaluation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI mengembalikan hasil dengan format yang tidak valid.");
  const result = value as Record<string, unknown>;
  if (!result.criteria || typeof result.criteria !== "object" || Array.isArray(result.criteria)) throw new Error("AI tidak mengembalikan skor rubrik yang valid.");
  const rawCriteria = result.criteria as Record<string, unknown>;
  if (Object.keys(rawCriteria).length !== ESSAY_CRITERIA.length) throw new Error("Jumlah kriteria evaluasi tidak valid.");
  const criteria = {} as EssayEvaluation["criteria"];
  let computedTotal = 0;
  for (const { key } of ESSAY_CRITERIA) {
    const item = rawCriteria[key];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("AI mengembalikan kriteria yang tidak lengkap.");
    const criterion = item as Record<string, unknown>;
    if (!Number.isInteger(criterion.score) || (criterion.score as number) < 0 || (criterion.score as number) > 25 || !boundedText(criterion.feedback, 600)) {
      throw new Error("Skor atau feedback rubrik AI tidak valid.");
    }
    criteria[key] = { score: criterion.score as number, feedback: criterion.feedback as string };
    computedTotal += criterion.score as number;
  }
  if (result.totalScore !== computedTotal || !Array.isArray(result.strengths) || !Array.isArray(result.improvements) ||
      result.strengths.length > 5 || result.improvements.length > 5 ||
      !result.strengths.every((item) => boundedText(item, 400)) ||
      !result.improvements.every((item) => boundedText(item, 400)) || !boundedText(result.improvedPrompt, 5000)) {
    throw new Error("Feedback atau total skor AI tidak valid.");
  }
  return {
    criteria,
    totalScore: computedTotal,
    strengths: result.strengths as string[],
    improvements: result.improvements as string[],
    improvedPrompt: result.improvedPrompt,
  };
}

export function resolveEssayAccess(
  role: string | null | undefined,
  subscription: SubscriptionRecord,
  adminTestEnabled: boolean,
  now = Date.now(),
) {
  const isAdminTest = role === "admin" && adminTestEnabled;
  const isPro = canAccessFeature("advanced_content", resolvePlan(subscription, now));
  return { allowed: isAdminTest || isPro, isAdminTest, isPro };
}
