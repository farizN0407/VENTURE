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
  weaknesses: string[];
  improvements: string[];
  improvedPrompt: string;
};
export type EssayRequirementEvidence = Record<
  "summarizePaper" | "identifyKeyFindings" | "explainLimitations" | "preventFabricatedCitations" | "preventUnsupportedClaims" | "paperContext" | "outputStructure",
  { present: boolean; evidence: string }
>;
export type EssayAttemptRecord = {
  id: string;
  answer: string;
  criteria_scores: EssayEvaluation["criteria"];
  total_score: number;
  feedback: Pick<EssayEvaluation, "strengths" | "improvements" | "improvedPrompt"> & { weaknesses?: string[] };
  submitted_at: string;
};

export function parseEssaySubmission(value: unknown): { challengeSlug: typeof ESSAY_CHALLENGE.slug; answer: string; requestId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Kirim data essay yang valid.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["challenge_slug", "answer", "request_id"].includes(key))) throw new Error("Permintaan berisi field yang tidak didukung.");
  if (body.challenge_slug !== ESSAY_CHALLENGE.slug) throw new Error("Essay challenge tidak ditemukan.");
  if (typeof body.answer !== "string") throw new Error("Jawaban harus berupa teks.");
  if (typeof body.request_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)) throw new Error("ID permintaan tidak valid. Muat ulang halaman dan coba lagi.");
  const answer = body.answer.trim();
  if (answer.length < ESSAY_MIN_LENGTH) throw new Error(`Prompt harus berisi sedikitnya ${ESSAY_MIN_LENGTH} karakter.`);
  if (answer.length > ESSAY_MAX_LENGTH) throw new Error(`Prompt tidak boleh lebih dari ${ESSAY_MAX_LENGTH} karakter.`);
  return { challengeSlug: ESSAY_CHALLENGE.slug, answer, requestId: body.request_id };
}

function cleanFeedbackText(value: string, max: number): string {
  let normalized = "";
  for (const character of value.trim()) {
    const code = character.charCodeAt(0);
    const isUnpairedSurrogate = character.length === 1 && code >= 0xd800 && code <= 0xdfff;
    if (character === "\u0000" || isUnpairedSurrogate) continue;
    if (normalized.length + character.length > max) break;
    normalized += character;
  }
  return normalized.trim();
}

function normalizeFeedbackText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") throw new Error(`Feedback AI untuk ${label} tidak valid.`);
  const normalized = cleanFeedbackText(value, max);
  if (!normalized) throw new Error(`Feedback AI untuk ${label} kosong.`);
  return normalized;
}

function normalizeFeedbackList(value: unknown, maxItemLength: number, label: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5 || !value.every((item) => typeof item === "string")) {
    throw new Error(`Daftar feedback AI untuk ${label} tidak valid.`);
  }
  const normalized = value
    .map((item) => cleanFeedbackText(item as string, maxItemLength))
    .filter(Boolean);
  if (normalized.length === 0) throw new Error(`Daftar feedback AI untuk ${label} kosong.`);
  return normalized;
}

export function parseEssayEvaluation(value: unknown, submittedPrompt: string): EssayEvaluation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI mengembalikan hasil dengan format yang tidak valid.");
  const result = value as Record<string, unknown>;
  if (!result.requirementEvidence || typeof result.requirementEvidence !== "object" || Array.isArray(result.requirementEvidence)) throw new Error("AI tidak mengembalikan pemeriksaan persyaratan yang valid.");
  const rawEvidence = result.requirementEvidence as Record<string, unknown>;
  const requirementKeys = ["summarizePaper", "identifyKeyFindings", "explainLimitations", "preventFabricatedCitations", "preventUnsupportedClaims", "paperContext", "outputStructure"] as const;
  if (Object.keys(rawEvidence).length !== requirementKeys.length) throw new Error("Jumlah pemeriksaan persyaratan tidak valid.");
  const requirements = {} as EssayRequirementEvidence;
  for (const key of requirementKeys) {
    const item = rawEvidence[key];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Bukti persyaratan AI tidak lengkap.");
    const evidence = item as Record<string, unknown>;
    if (typeof evidence.present !== "boolean" || typeof evidence.evidence !== "string" || evidence.evidence.length > 500 ||
        (evidence.present && (!evidence.evidence.trim() || !submittedPrompt.toLocaleLowerCase().includes(evidence.evidence.toLocaleLowerCase()))) ||
        (!evidence.present && evidence.evidence.length > 0)) {
      throw new Error("Bukti persyaratan tidak ditemukan secara persis pada prompt.");
    }
    requirements[key] = { present: evidence.present, evidence: evidence.evidence };
  }
  if (!result.criteria || typeof result.criteria !== "object" || Array.isArray(result.criteria)) throw new Error("AI tidak mengembalikan skor rubrik yang valid.");
  const rawCriteria = result.criteria as Record<string, unknown>;
  if (Object.keys(rawCriteria).length !== ESSAY_CRITERIA.length) throw new Error("Jumlah kriteria evaluasi tidak valid.");
  const criteria = {} as EssayEvaluation["criteria"];
  for (const { key } of ESSAY_CRITERIA) {
    const item = rawCriteria[key];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("AI mengembalikan kriteria yang tidak lengkap.");
    const criterion = item as Record<string, unknown>;
    if (!Number.isInteger(criterion.score) || (criterion.score as number) < 0 || (criterion.score as number) > 25 || typeof criterion.feedback !== "string") {
      throw new Error("Skor atau feedback rubrik AI tidak valid.");
    }
    criteria[key] = {
      score: criterion.score as number,
      feedback: normalizeFeedbackText(criterion.feedback, 600, `kriteria ${key}`),
    };
  }
  // totalScore is derived below from the final capped criteria; never trust arithmetic supplied by the model.
  const strengths = normalizeFeedbackList(result.strengths, 400, "strengths");
  const weaknessesFromAI = normalizeFeedbackList(result.weaknesses, 400, "weaknesses");
  const improvementsFromAI = normalizeFeedbackList(result.improvements, 400, "improvements");
  const improvedPrompt = normalizeFeedbackText(result.improvedPrompt, 5000, "contoh prompt");
  const caps: Partial<Record<EssayCriterionKey, number>> = {};
  const requiredTaskKeys = ["summarizePaper", "identifyKeyFindings", "explainLimitations"] as const;
  const missingTaskKeys = requiredTaskKeys.filter((key) => !requirements[key].present);
  if (missingTaskKeys.length) caps.clarityInstructions = 5;
  if (!requirements.paperContext.present) caps.contextRelevance = 5;
  if (!requirements.outputStructure.present) caps.outputStructure = 5;
  const safeguardCount = Number(requirements.preventFabricatedCitations.present) + Number(requirements.preventUnsupportedClaims.present);
  if (safeguardCount === 0) caps.accuracyResponsibleAI = 5;
  else if (safeguardCount === 1) caps.accuracyResponsibleAI = 18;

  const cappedCriteria = { ...criteria };
  for (const [key, cap] of Object.entries(caps) as [EssayCriterionKey, number][]) {
    if (cappedCriteria[key].score > cap) {
      const reason = key === "clarityInstructions"
        ? `Missing explicit requests for: ${missingTaskKeys.map((item) => ({ summarizePaper: "summarization", identifyKeyFindings: "key findings", explainLimitations: "research limitations" })[item]).join(", ")}.`
        : key === "contextRelevance"
          ? "The prompt does not explicitly ground the answer in the supplied paper as its source."
          : key === "outputStructure"
            ? "The prompt does not explicitly request an output format or organization."
            : `The prompt is missing explicit safeguards against ${[
              !requirements.preventFabricatedCitations.present ? "invented citations" : null,
              !requirements.preventUnsupportedClaims.present ? "unsupported claims" : null,
            ].filter(Boolean).join(" and ")}.`;
      cappedCriteria[key] = {
        score: cap,
        feedback: `Score limited to ${cap}/25. ${reason}`,
      };
    }
  }
  const missingRequirementFeedback: Record<(typeof requirementKeys)[number], string> = {
    summarizePaper: "Explicitly request a summary of the research paper.",
    identifyKeyFindings: "Explicitly ask for the paper's key findings.",
    explainLimitations: "Explicitly ask for the paper's limitations.",
    preventFabricatedCitations: "Explicitly prohibit invented citations.",
    preventUnsupportedClaims: "Explicitly prohibit claims unsupported by the paper.",
    paperContext: "Specify that the research paper is the source and context.",
    outputStructure: "Request a clear structure for the summary, findings, and limitations.",
  };
  const missing = requirementKeys.filter((key) => !requirements[key].present);
  const weaknesses = [...new Set([...missing.slice(0, 5).map((key) => missingRequirementFeedback[key]), ...weaknessesFromAI])].slice(0, 5);
  const improvements = [...new Set([...missing.slice(0, 5).map((key) => missingRequirementFeedback[key]), ...improvementsFromAI])].slice(0, 5);
  return {
    criteria: cappedCriteria,
    totalScore: Object.values(cappedCriteria).reduce((sum, item) => sum + item.score, 0),
    strengths,
    weaknesses,
    improvements,
    improvedPrompt,
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
