import { canAccessFeature, resolvePlan, type SubscriptionRecord } from "./entitlements.ts";

export const ESSAY_CRITERIA = [
  { key: "clarityInstructions", label: "Clarity" },
  { key: "contextRelevance", label: "Context" },
  { key: "outputStructure", label: "Output Structure" },
  { key: "accuracyResponsibleAI", label: "Accuracy & Responsible AI" },
] as const;

export type EssayCriterionKey = (typeof ESSAY_CRITERIA)[number]["key"];
export type EssayRequirement = { key: string; description: string; missingAction: string; criterion: EssayCriterionKey };
export type EssayScoreCap = {
  criterion: EssayCriterionKey;
  maxScore: number;
  whenMissingAny?: readonly string[];
  whenMissingAll?: readonly string[];
  explanation: string;
};
export type EssayChallenge = {
  slug: string;
  topic: string;
  title: string;
  scenario: string;
  instructions: string;
  cardDescription: string;
  evaluationGuidance: string;
  requirements: readonly EssayRequirement[];
  scoreCaps: readonly EssayScoreCap[];
};

export const ESSAY_CHALLENGES = [
  {
    slug: "academic-research-assistant",
    topic: "Prompting",
    title: "Academic Research Assistant",
    scenario: "Turn a research paper into a grounded, useful academic summary.",
    instructions: "Write an effective prompt that instructs an AI assistant to summarize a research paper, identify its key findings, and explain its limitations. The AI must not invent citations or unsupported claims.",
    cardDescription: "Write a prompt for a reliable research-paper summary, findings, and limitations.",
    evaluationGuidance: "Evaluate a prompt for summarizing a research paper for a university student. The actual paper is supplied to the hypothetical assistant and is not required in the student's prompt.",
    requirements: [
      { key: "summarizePaper", description: "Requests a summary of the research paper", missingAction: "Explicitly request a summary of the research paper.", criterion: "clarityInstructions" },
      { key: "identifyKeyFindings", description: "Requests the paper's key findings", missingAction: "Ask for the paper's key findings.", criterion: "clarityInstructions" },
      { key: "explainLimitations", description: "Requests the research limitations", missingAction: "Ask the assistant to explain the research limitations.", criterion: "clarityInstructions" },
      { key: "paperContext", description: "Grounds the answer in the supplied paper", missingAction: "Specify that the supplied paper is the source of the response.", criterion: "contextRelevance" },
      { key: "outputStructure", description: "Requests a clear organization for the response", missingAction: "Request a clear structure that separates the summary, findings, and limitations.", criterion: "outputStructure" },
      { key: "preventFabricatedCitations", description: "Prevents invented citations", missingAction: "Explicitly prohibit invented citations.", criterion: "accuracyResponsibleAI" },
      { key: "preventUnsupportedClaims", description: "Prevents claims unsupported by the paper", missingAction: "Explicitly prohibit claims unsupported by the paper.", criterion: "accuracyResponsibleAI" },
    ],
    scoreCaps: [
      { criterion: "clarityInstructions", maxScore: 5, whenMissingAny: ["summarizePaper", "identifyKeyFindings", "explainLimitations"], explanation: "A required research task is missing." },
      { criterion: "contextRelevance", maxScore: 5, whenMissingAny: ["paperContext"], explanation: "The supplied paper is not established as the source." },
      { criterion: "outputStructure", maxScore: 5, whenMissingAny: ["outputStructure"], explanation: "No response organization is requested." },
      { criterion: "accuracyResponsibleAI", maxScore: 18, whenMissingAny: ["preventFabricatedCitations", "preventUnsupportedClaims"], explanation: "One or more research accuracy safeguards are missing." },
      { criterion: "accuracyResponsibleAI", maxScore: 5, whenMissingAll: ["preventFabricatedCitations", "preventUnsupportedClaims"], explanation: "Both research accuracy safeguards are missing." },
    ],
  },
  {
    slug: "data-analysis-assistant",
    topic: "AI for Research",
    title: "Data Analysis Assistant",
    scenario: "Ask AI to analyze a dataset without making up evidence.",
    instructions: "Write a prompt instructing an AI assistant to analyze a provided dataset, identify trends, anomalies, and key insights, explain limitations, and present findings clearly without inventing data.",
    cardDescription: "Design a data-analysis prompt that finds useful patterns and stays faithful to the dataset.",
    evaluationGuidance: "Evaluate a prompt for analyzing a dataset provided to the hypothetical assistant. Do not penalize the student for not attaching or supplying the actual dataset.",
    requirements: [
      { key: "analyzeDataset", description: "Requests analysis of the provided dataset", missingAction: "Ask the assistant to analyze the provided dataset.", criterion: "clarityInstructions" },
      { key: "identifyTrends", description: "Requests trends in the data", missingAction: "Ask for relevant trends in the dataset.", criterion: "clarityInstructions" },
      { key: "identifyAnomalies", description: "Requests anomalies or unusual observations", missingAction: "Ask the assistant to identify anomalies or unusual observations.", criterion: "clarityInstructions" },
      { key: "identifyInsights", description: "Requests key insights", missingAction: "Ask for the key insights supported by the data.", criterion: "clarityInstructions" },
      { key: "explainLimitations", description: "Requests limitations of the analysis or dataset", missingAction: "Ask the assistant to explain the dataset or analysis limitations.", criterion: "contextRelevance" },
      { key: "datasetContext", description: "Uses the provided dataset as the evidence source", missingAction: "Specify that conclusions must be grounded in the provided dataset.", criterion: "contextRelevance" },
      { key: "outputStructure", description: "Requests clear presentation of findings", missingAction: "Request a clear, organized presentation of the findings.", criterion: "outputStructure" },
      { key: "preventInventedData", description: "Prevents inventing data", missingAction: "Explicitly prohibit inventing or altering data.", criterion: "accuracyResponsibleAI" },
      { key: "preventUnsupportedClaims", description: "Prevents unsupported conclusions", missingAction: "Require conclusions to be supported by the dataset and flag uncertainty.", criterion: "accuracyResponsibleAI" },
    ],
    scoreCaps: [
      { criterion: "clarityInstructions", maxScore: 5, whenMissingAny: ["analyzeDataset", "identifyTrends", "identifyAnomalies", "identifyInsights"], explanation: "A core data analysis task is missing." },
      { criterion: "contextRelevance", maxScore: 12, whenMissingAny: ["datasetContext", "explainLimitations"], explanation: "Dataset grounding or analysis limitations are not addressed." },
      { criterion: "outputStructure", maxScore: 5, whenMissingAny: ["outputStructure"], explanation: "The prompt does not ask for clear organization." },
      { criterion: "accuracyResponsibleAI", maxScore: 18, whenMissingAny: ["preventInventedData", "preventUnsupportedClaims"], explanation: "One or more data integrity safeguards are missing." },
      { criterion: "accuracyResponsibleAI", maxScore: 5, whenMissingAll: ["preventInventedData", "preventUnsupportedClaims"], explanation: "Both data integrity safeguards are missing." },
    ],
  },
  {
    slug: "professional-writing",
    topic: "Practical Application",
    title: "Professional Writing",
    scenario: "Draft a polished message for a real audience and purpose.",
    instructions: "Write a prompt instructing an AI assistant to draft a professional email or report for a specified audience and purpose, with appropriate tone, clear structure, and no fabricated facts.",
    cardDescription: "Create a writing prompt with a clear audience, purpose, tone, and factual boundaries.",
    evaluationGuidance: "Evaluate a prompt for drafting a professional email or report. The student need not provide actual private recipient details or source facts; assess whether the prompt asks for the relevant context and handling of missing facts.",
    requirements: [
      { key: "draftEmailOrReport", description: "Specifies an email or report as the writing task", missingAction: "Specify whether the assistant should draft a professional email or report.", criterion: "clarityInstructions" },
      { key: "specifiedAudience", description: "Specifies or asks for the intended audience", missingAction: "Identify or request the intended audience.", criterion: "contextRelevance" },
      { key: "specifiedPurpose", description: "Specifies or asks for the purpose", missingAction: "Identify or request the communication's purpose.", criterion: "contextRelevance" },
      { key: "appropriateTone", description: "Requests an appropriate professional tone", missingAction: "Request a tone appropriate to the audience and situation.", criterion: "clarityInstructions" },
      { key: "outputStructure", description: "Requests a clear structure", missingAction: "Request a clear structure suited to the selected email or report.", criterion: "outputStructure" },
      { key: "preventFabricatedFacts", description: "Prevents fabricated facts", missingAction: "Explicitly prohibit fabricated facts and ask the assistant to flag missing information.", criterion: "accuracyResponsibleAI" },
    ],
    scoreCaps: [
      { criterion: "clarityInstructions", maxScore: 8, whenMissingAny: ["draftEmailOrReport", "appropriateTone"], explanation: "The writing deliverable or tone is underspecified." },
      { criterion: "contextRelevance", maxScore: 8, whenMissingAny: ["specifiedAudience", "specifiedPurpose"], explanation: "The intended audience or purpose is missing." },
      { criterion: "outputStructure", maxScore: 5, whenMissingAny: ["outputStructure"], explanation: "No clear writing structure is requested." },
      { criterion: "accuracyResponsibleAI", maxScore: 5, whenMissingAny: ["preventFabricatedFacts"], explanation: "The prompt does not prevent fabricated facts." },
    ],
  },
] as const satisfies readonly EssayChallenge[];

export type EssayChallengeSlug = (typeof ESSAY_CHALLENGES)[number]["slug"];
export const ESSAY_CHALLENGE = ESSAY_CHALLENGES[0];
export const ESSAY_MAX_LENGTH = 5000;
export const ESSAY_MIN_LENGTH = 20;
export type EssayCriterionScore = { score: number; feedback: string };
export type EssayEvaluation = {
  criteria: Record<EssayCriterionKey, EssayCriterionScore>;
  totalScore: number;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  improvedPrompt: string;
};
export type EssayRequirementEvidence = Record<string, { present: boolean; evidence: string }>;
export type EssayAttemptRecord = {
  id: string;
  answer: string;
  challenge_slug: string;
  criteria_scores: EssayEvaluation["criteria"];
  total_score: number;
  feedback: Pick<EssayEvaluation, "strengths" | "improvements" | "improvedPrompt"> & { weaknesses?: string[] };
  submitted_at: string;
};
export type EssayQuota = { successfulAttempts: number; reservedAttempts: number; dailyLimit: 3 | 15 };

export function parseEssayQuota(value: unknown): EssayQuota | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const quota = row as Record<string, unknown>;
  const successfulAttempts = quota.successful_attempts ?? quota.successfulAttempts;
  const reservedAttempts = quota.reserved_attempts ?? quota.reservedAttempts;
  const dailyLimit = quota.daily_limit ?? quota.dailyLimit;
  if (!Number.isInteger(successfulAttempts) || !Number.isInteger(reservedAttempts) ||
      !Number.isInteger(dailyLimit) || (dailyLimit !== 3 && dailyLimit !== 15) ||
      (successfulAttempts as number) < 0 ||
      (reservedAttempts as number) < 0 || (reservedAttempts as number) > dailyLimit) return null;
  return {
    successfulAttempts: successfulAttempts as number,
    reservedAttempts: reservedAttempts as number,
    dailyLimit: dailyLimit as 3 | 15,
  };
}

export function getEssayChallenge(slug: unknown): (typeof ESSAY_CHALLENGES)[number] | undefined {
  return typeof slug === "string" ? ESSAY_CHALLENGES.find((challenge) => challenge.slug === slug) : undefined;
}

export function parseEssaySubmission(value: unknown): { challengeSlug: EssayChallengeSlug; answer: string; requestId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Kirim data essay yang valid.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["challenge_slug", "answer", "request_id"].includes(key))) throw new Error("Permintaan berisi field yang tidak didukung.");
  const challenge = getEssayChallenge(body.challenge_slug);
  if (!challenge) throw new Error("Essay challenge tidak ditemukan.");
  if (typeof body.answer !== "string") throw new Error("Jawaban harus berupa teks.");
  if (typeof body.request_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)) throw new Error("ID permintaan tidak valid. Muat ulang halaman dan coba lagi.");
  const answer = body.answer.trim();
  if (answer.length < ESSAY_MIN_LENGTH) throw new Error(`Prompt harus berisi sedikitnya ${ESSAY_MIN_LENGTH} karakter.`);
  if (answer.length > ESSAY_MAX_LENGTH) throw new Error(`Prompt tidak boleh lebih dari ${ESSAY_MAX_LENGTH} karakter.`);
  return { challengeSlug: challenge.slug, answer, requestId: body.request_id };
}

function cleanFeedbackText(value: string, max: number): string {
  let normalized = "";
  for (const character of value.trim()) {
    const code = character.charCodeAt(0);
    if (character === "\u0000" || (character.length === 1 && code >= 0xd800 && code <= 0xdfff)) continue;
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
  if (!Array.isArray(value) || value.length < 1 || value.length > 5 || !value.every((item) => typeof item === "string")) throw new Error(`Daftar feedback AI untuk ${label} tidak valid.`);
  const normalized = value.map((item) => cleanFeedbackText(item as string, maxItemLength)).filter(Boolean);
  if (!normalized.length) throw new Error(`Daftar feedback AI untuk ${label} kosong.`);
  return normalized;
}

function normalizeEvidenceForMatch(value: string): string {
  return value.normalize("NFKC").replace(/\p{White_Space}+/gu, " ").trim().toLocaleLowerCase("en-US");
}

function hasExactEvidence(submittedPrompt: string, evidence: string): boolean {
  const normalizedPrompt = normalizeEvidenceForMatch(submittedPrompt);
  const normalizedEvidence = normalizeEvidenceForMatch(evidence);
  return Boolean(normalizedEvidence) && normalizedPrompt.includes(normalizedEvidence);
}

export function parseEssayEvaluation(value: unknown, submittedPrompt: string, challenge: EssayChallenge = ESSAY_CHALLENGE): EssayEvaluation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI mengembalikan hasil dengan format yang tidak valid.");
  const result = value as Record<string, unknown>;
  const rawEvidence = result.requirementEvidence && typeof result.requirementEvidence === "object" && !Array.isArray(result.requirementEvidence)
    ? result.requirementEvidence as Record<string, unknown>
    : {};
  const evidence: EssayRequirementEvidence = {};
  for (const { key } of challenge.requirements) {
    const item = rawEvidence[key];
    const entry = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : null;
    const quote = entry?.evidence;
    const validEvidence = entry?.present === true && typeof quote === "string" && quote.length <= 500 && hasExactEvidence(submittedPrompt, quote);
    evidence[key] = { present: validEvidence, evidence: validEvidence ? quote : "" };
  }
  if (!result.criteria || typeof result.criteria !== "object" || Array.isArray(result.criteria)) throw new Error("AI tidak mengembalikan skor rubrik yang valid.");
  const rawCriteria = result.criteria as Record<string, unknown>;
  if (Object.keys(rawCriteria).length !== ESSAY_CRITERIA.length) throw new Error("Jumlah kriteria evaluasi tidak valid.");
  const criteria = {} as EssayEvaluation["criteria"];
  for (const { key } of ESSAY_CRITERIA) {
    const item = rawCriteria[key];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("AI mengembalikan kriteria yang tidak lengkap.");
    const criterion = item as Record<string, unknown>;
    if (!Number.isInteger(criterion.score) || (criterion.score as number) < 0 || (criterion.score as number) > 25 || typeof criterion.feedback !== "string") throw new Error("Skor atau feedback rubrik AI tidak valid.");
    criteria[key] = { score: criterion.score as number, feedback: normalizeFeedbackText(criterion.feedback, 600, `kriteria ${key}`) };
  }
  const caps = new Map<EssayCriterionKey, { score: number; explanations: string[] }>();
  for (const rule of challenge.scoreCaps) {
    const anyMissing = rule.whenMissingAny?.some((key) => !evidence[key]?.present) ?? false;
    const allMissing = rule.whenMissingAll?.every((key) => !evidence[key]?.present) ?? false;
    if (!anyMissing && !allMissing) continue;
    const existing = caps.get(rule.criterion);
    caps.set(rule.criterion, { score: Math.min(existing?.score ?? 25, rule.maxScore), explanations: [...(existing?.explanations ?? []), rule.explanation] });
  }
  for (const [key, cap] of caps) if (criteria[key].score > cap.score) criteria[key] = { score: cap.score, feedback: `Skor dibatasi ${cap.score}/25. ${[...new Set(cap.explanations)].join(" ")}` };

  const strengths = normalizeFeedbackList(result.strengths, 400, "strengths");
  const weaknessesFromAI = normalizeFeedbackList(result.weaknesses, 400, "weaknesses");
  const improvementsFromAI = normalizeFeedbackList(result.improvements, 400, "improvements");
  const improvedPrompt = normalizeFeedbackText(result.improvedPrompt, 5000, "contoh prompt");
  const missingActions = challenge.requirements.filter(({ key }) => !evidence[key].present).map(({ missingAction }) => missingAction);
  return {
    criteria,
    totalScore: Object.values(criteria).reduce((sum, item) => sum + item.score, 0),
    strengths,
    weaknesses: [...new Set([...missingActions, ...weaknessesFromAI])].slice(0, 5),
    improvements: [...new Set([...missingActions, ...improvementsFromAI])].slice(0, 5),
    improvedPrompt,
  };
}

export function resolveEssayAccess(role: string | null | undefined, subscription: SubscriptionRecord, adminTestEnabled: boolean, now = Date.now()) {
  const isAdminTest = role === "admin" && adminTestEnabled;
  const isPro = canAccessFeature("advanced_content", resolvePlan(subscription, now));
  const isAdmin = role === "admin";
  return { allowed: isAdmin || isPro, isAdminTest, isPro, isAdmin };
}
