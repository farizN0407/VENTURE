import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ESSAY_CHALLENGE, ESSAY_CRITERIA, parseEssayEvaluation, parseEssaySubmission, resolveEssayAccess,
} from "../lib/essay-challenge.ts";
import { ESSAY_SCORING_GUIDANCE, evaluateEssayPrompt } from "../lib/essay-evaluator.ts";

const validAnswer = "You are an academic research assistant. Summarize the research paper, identify its key findings, and explain its limitations. Use only the supplied paper as the source. Organize the response with headings for Summary, Key findings, and Limitations. Do not invent citations or make claims unsupported by the paper.";
const requestId = "f121c834-d2b8-4e3e-8c0e-7a2825600021";
assert.equal(parseEssaySubmission({ challenge_slug: ESSAY_CHALLENGE.slug, answer: validAnswer, request_id: requestId }).answer, validAnswer);
assert.throws(() => parseEssaySubmission({ challenge_slug: ESSAY_CHALLENGE.slug, answer: validAnswer }), /ID permintaan/);
assert.throws(() => parseEssaySubmission({ challenge_slug: ESSAY_CHALLENGE.slug, answer: "short", request_id: requestId }), /sedikitnya/);
assert.throws(() => parseEssaySubmission({ challenge_slug: ESSAY_CHALLENGE.slug, answer: "x".repeat(5001), request_id: requestId }), /tidak boleh/);
assert.throws(() => parseEssaySubmission({ challenge_slug: ESSAY_CHALLENGE.slug, answer: validAnswer, request_id: requestId, total_score: 100 }), /field yang tidak didukung/);
assert.throws(() => parseEssaySubmission({ challenge_slug: "other", answer: validAnswer, request_id: requestId }), /tidak ditemukan/);

const criterionScores = Object.fromEntries(ESSAY_CRITERIA.map(({ key }, index) => [key, { score: 20 + index, feedback: `Feedback ${index}` }]));
const fullRequirementEvidence = {
  summarizePaper: { present: true, evidence: "Summarize the research paper" },
  identifyKeyFindings: { present: true, evidence: "identify its key findings" },
  explainLimitations: { present: true, evidence: "explain its limitations" },
  preventFabricatedCitations: { present: true, evidence: "Do not invent citations" },
  preventUnsupportedClaims: { present: true, evidence: "make claims unsupported by the paper" },
  paperContext: { present: true, evidence: "Use only the supplied paper as the source" },
  outputStructure: { present: true, evidence: "Organize the response with headings for Summary, Key findings, and Limitations" },
};
const validEvaluation = { criteria: criterionScores, requirementEvidence: fullRequirementEvidence, totalScore: 86, strengths: ["Clear purpose"], weaknesses: ["No explicit citation safeguard"], improvements: ["Add source-grounding rules"], improvedPrompt: "A better prompt with detailed instructions." };
assert.equal(parseEssayEvaluation(validEvaluation, validAnswer).totalScore, 86);
assert.throws(() => parseEssayEvaluation({ ...validEvaluation, totalScore: 100 }, validAnswer), /total skor/);
assert.throws(() => parseEssayEvaluation({ ...validEvaluation, criteria: { ...criterionScores, clarityInstructions: { score: "20", feedback: "Bad type" } } }, validAnswer), /Skor atau feedback/);

const bareAnswer = "Summarize this paper";
const bareEvidence = { summarizePaper: { present: true, evidence: "Summarize" }, identifyKeyFindings: { present: false, evidence: "" }, explainLimitations: { present: false, evidence: "" }, preventFabricatedCitations: { present: false, evidence: "" }, preventUnsupportedClaims: { present: false, evidence: "" }, paperContext: { present: false, evidence: "" }, outputStructure: { present: false, evidence: "" } };
const lowEvaluation = { ...validEvaluation, criteria: { clarityInstructions: { score: 20, feedback: "The task is vague." }, contextRelevance: { score: 12, feedback: "No source boundary." }, outputStructure: { score: 10, feedback: "No output structure." }, accuracyResponsibleAI: { score: 8, feedback: "No safeguards." } }, requirementEvidence: bareEvidence, totalScore: 50 };
const lowResult = parseEssayEvaluation(lowEvaluation, bareAnswer);
assert.equal(lowResult.totalScore, 20, "even an overgenerous model score for a bare request must be capped to 20");
assert.deepEqual(Object.values(lowResult.criteria).map((item) => item.score), [5, 5, 5, 5]);
assert.match(lowResult.criteria.accuracyResponsibleAI.feedback, /invented citations and unsupported claims/);
assert.ok(lowResult.weaknesses.length > 0 && lowResult.improvements.length > 0, "missing requirements must be explained and actionable");
const middleAnswer = "Summarize this paper, identify the key findings, and explain its limitations. Use only the research paper as the source. Organize the response as a short summary followed by bullets.";
const middleEvidence = { summarizePaper: { present: true, evidence: "Summarize this paper" }, identifyKeyFindings: { present: true, evidence: "identify the key findings" }, explainLimitations: { present: true, evidence: "explain its limitations" }, preventFabricatedCitations: { present: false, evidence: "" }, preventUnsupportedClaims: { present: false, evidence: "" }, paperContext: { present: true, evidence: "Use only the research paper as the source" }, outputStructure: { present: true, evidence: "Organize the response as a short summary followed by bullets" } };
const middleEvaluation = { ...validEvaluation, criteria: { clarityInstructions: { score: 18, feedback: "Tasks are mostly clear." }, contextRelevance: { score: 16, feedback: "Academic context is present." }, outputStructure: { score: 14, feedback: "Basic format is named." }, accuracyResponsibleAI: { score: 12, feedback: "Safeguards are incomplete." } }, requirementEvidence: middleEvidence, totalScore: 60 };
assert.ok(parseEssayEvaluation(middleEvaluation, middleAnswer).totalScore >= 45 && parseEssayEvaluation(middleEvaluation, middleAnswer).totalScore <= 70, "partly complete prompts should remain in the intermediate band");
const highEvaluation = { ...validEvaluation, criteria: { clarityInstructions: { score: 24, feedback: "All tasks are explicit." }, contextRelevance: { score: 22, feedback: "The paper is the source." }, outputStructure: { score: 23, feedback: "Separate sections are requested." }, accuracyResponsibleAI: { score: 24, feedback: "Both safeguards are explicit." } }, totalScore: 93 };
assert.equal(parseEssayEvaluation(highEvaluation, validAnswer).totalScore, 93, "complete prompts may score high");
assert.throws(() => parseEssayEvaluation(validEvaluation, "Summarize this paper"), /Bukti persyaratan tidak ditemukan/);
for (const expected of ["0–5", "23–25", "summarize the research paper", "key findings", "research limitations", "fabricated citations", "unsupported claims", "not expected to provide", "Do not award points just for length"]) assert.ok(ESSAY_SCORING_GUIDANCE.includes(expected), `rubric guidance must include ${expected}`);

const now = Date.now();
assert.equal(resolveEssayAccess("user", null, false, now).allowed, false, "free accounts must be blocked");
assert.equal(resolveEssayAccess("admin", null, false, now).allowed, false, "admin preview must require its explicit server flag");
assert.equal(resolveEssayAccess("admin", null, true, now).allowed, true, "admin test access must work when enabled");
assert.equal(resolveEssayAccess("user", { status: "active", current_period_end: new Date(now + 60_000).toISOString() }, false, now).allowed, true);
assert.equal(resolveEssayAccess("user", { status: "active", current_period_end: new Date(now - 60_000).toISOString() }, false, now).allowed, false);

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "test-placeholder-not-a-real-key";
globalThis.fetch = async (_url, options) => {
  const requestBody = JSON.parse(options.body);
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.match(requestBody.messages[0].content, /untrusted data/i);
  assert.match(requestBody.messages[0].content, /5–20 overall/i);
  assert.equal(JSON.parse(requestBody.messages[1].content).submitted_prompt, validAnswer);
  return Response.json({ choices: [{ message: { content: JSON.stringify(validEvaluation) } }] });
};
assert.equal((await evaluateEssayPrompt(validAnswer)).totalScore, 86, "valid structured AI result should pass server validation");
globalThis.fetch = async () => new Response("unavailable", { status: 503 });
await assert.rejects(() => evaluateEssayPrompt(validAnswer), /gagal memproses/);
globalThis.fetch = async () => Response.json({ choices: [{ message: { content: "not-json" } }] });
await assert.rejects(() => evaluateEssayPrompt(validAnswer), /JSON yang tidak valid/);
globalThis.fetch = originalFetch;
if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = originalKey;

const migration = await readFile(new URL("../supabase/migrations/20261111_promptly_essay_challenges.sql", import.meta.url), "utf8");
assert.match(migration, /alter table public\.essay_attempts enable row level security/i);
assert.match(migration, /auth\.uid\(\) = user_id/i);
assert.match(migration, /grant all on public\.essay_challenges, public\.essay_attempts, public\.essay_usage_limits to service_role/i);
const quotaMigration = await readFile(new URL("../supabase/migrations/20261115_essay_quota_reservations.sql", import.meta.url), "utf8");
assert.match(quotaMigration, /attempts \+ v_reserved >= 3/i);
assert.match(quotaMigration, /for update/i);
assert.match(quotaMigration, /primary key \(user_id, request_id\)/i);
assert.match(quotaMigration, /status = 'released'/i);
assert.match(quotaMigration, /status = 'succeeded'/i);
assert.match(quotaMigration, /create or replace function public\.reserve_promptly_essay_attempt/i);
assert.match(quotaMigration, /create or replace function public\.release_promptly_essay_attempt/i);
assert.match(quotaMigration, /create or replace function public\.finalize_promptly_essay_attempt/i);
assert.match(quotaMigration, /revoke all on function public\.consume_promptly_essay_attempt\(\) from public, anon, authenticated/i);
const reserveFunction = quotaMigration.split("create or replace function public.reserve_promptly_essay_attempt")[1].split("create or replace function public.release_promptly_essay_attempt")[0];
assert.match(reserveFunction, /reserved = reserved \+ 1/i);
assert.doesNotMatch(reserveFunction, /attempts = attempts \+ 1/i, "reservation alone must not consume a successful attempt");
const finalizeFunction = quotaMigration.split("create or replace function public.finalize_promptly_essay_attempt")[1];
assert.match(finalizeFunction, /reserved = reserved - 1, attempts = attempts \+ 1/i);
assert.match(reserveFunction, /for update/i, "quota row lock must serialize concurrent reservations");
assert.match(reserveFunction, /if found and v_status = 'reserved' then return 'in_progress'/i, "duplicate in-flight request must not call OpenAI twice");
const route = await readFile(new URL("../app/api/essay-challenges/submit/route.ts", import.meta.url), "utf8");
assert.match(route, /auth\.getUser\(\)/);
assert.match(route, /reserve_promptly_essay_attempt/);
assert.match(route, /release_promptly_essay_attempt/);
assert.match(route, /finalize_promptly_essay_attempt/);
assert.match(route, /p_user_id: user\.id/);
assert.match(route, /p_request_id: submission\.requestId/);
assert.doesNotMatch(route, /body\.(?:score|total_score|criteria_scores)/i, "score must be calculated and persisted only on the server");
const reservePosition = route.indexOf("reserve_promptly_essay_attempt");
const evaluationPosition = route.indexOf("evaluateEssayPrompt(submission.answer)");
const finalizePosition = route.indexOf("finalize_promptly_essay_attempt");
assert.ok(reservePosition >= 0 && reservePosition < evaluationPosition && evaluationPosition < finalizePosition, "the request must reserve, evaluate, then atomically finalize");
assert.match(route.slice(evaluationPosition, finalizePosition), /release_promptly_essay_attempt/, "failed evaluation must release the reservation");

console.log("Essay rubric calibration, validation, access rules, evaluator failures, and reservation/finalization storage checks passed.");
