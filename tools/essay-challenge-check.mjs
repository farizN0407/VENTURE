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
const mismatchedModelTotal = parseEssayEvaluation({ ...validEvaluation, totalScore: 1 }, validAnswer);
assert.equal(mismatchedModelTotal.totalScore, 86, "regression: a model total that disagrees with its criterion sum must not reject valid feedback; the server computes the total");
assert.equal(mismatchedModelTotal.totalScore, Object.values(mismatchedModelTotal.criteria).reduce((sum, item) => sum + item.score, 0));
const normalizedFeedback = parseEssayEvaluation({
  ...validEvaluation,
  totalScore: -50,
  criteria: Object.fromEntries(ESSAY_CRITERIA.map(({ key }) => [key, { score: 20, feedback: `  ${"Reason ".repeat(100)}  ` }])),
  strengths: ["  Clear purpose  ", "   "],
  weaknesses: ["  Missing a safeguard  "],
  improvements: ["  State a source boundary  "],
  improvedPrompt: `  ${"Use the paper. ".repeat(500)}  `,
}, validAnswer);
assert.equal(normalizedFeedback.totalScore, 80);
assert.equal(normalizedFeedback.criteria.clarityInstructions.feedback.length, 600, "criterion feedback is trimmed and bounded before saving");
assert.deepEqual(normalizedFeedback.strengths, ["Clear purpose"], "blank feedback items are filtered during normalization");
assert.equal(normalizedFeedback.improvedPrompt.length, 5000, "example prompt is bounded to the application/history limit");
const unicodeSafeFeedback = parseEssayEvaluation({
  ...validEvaluation,
  criteria: Object.fromEntries(ESSAY_CRITERIA.map(({ key }) => [key, { score: 20, feedback: `${"x".repeat(599)}😀tail\u0000` }])),
}, validAnswer);
assert.equal(unicodeSafeFeedback.criteria.clarityInstructions.feedback.length, 599, "text truncation does not split a surrogate pair");
assert.doesNotMatch(unicodeSafeFeedback.criteria.clarityInstructions.feedback, /\u0000/, "persisted JSON feedback excludes PostgreSQL-incompatible NUL characters");
assert.throws(() => parseEssayEvaluation({ ...validEvaluation, improvedPrompt: "   " }, validAnswer), /contoh prompt kosong/);
assert.throws(() => parseEssayEvaluation({ ...validEvaluation, criteria: { ...criterionScores, clarityInstructions: { score: "20", feedback: "Bad type" } } }, validAnswer), /Skor atau feedback/);

const bareAnswer = "Summarize this paper";
const bareEvidence = { summarizePaper: { present: true, evidence: "Summarize" }, identifyKeyFindings: { present: false, evidence: "" }, explainLimitations: { present: false, evidence: "" }, preventFabricatedCitations: { present: false, evidence: "" }, preventUnsupportedClaims: { present: false, evidence: "" }, paperContext: { present: false, evidence: "" }, outputStructure: { present: false, evidence: "" } };
const lowEvaluation = { ...validEvaluation, criteria: { clarityInstructions: { score: 20, feedback: "The task is vague." }, contextRelevance: { score: 12, feedback: "No source boundary." }, outputStructure: { score: 10, feedback: "No output structure." }, accuracyResponsibleAI: { score: 8, feedback: "No safeguards." } }, requirementEvidence: bareEvidence, totalScore: 50 };
const lowResult = parseEssayEvaluation(lowEvaluation, bareAnswer);
assert.equal(lowResult.totalScore, 20, "even an overgenerous model score for a bare request must be capped to 20");
assert.deepEqual(Object.values(lowResult.criteria).map((item) => item.score), [5, 5, 5, 5]);
assert.equal(lowResult.totalScore, Object.values(lowResult.criteria).reduce((sum, item) => sum + item.score, 0), "total is recalculated after caps");
assert.match(lowResult.criteria.accuracyResponsibleAI.feedback, /invented citations and unsupported claims/);
assert.ok(lowResult.weaknesses.length > 0 && lowResult.improvements.length > 0, "missing requirements must be explained and actionable");
const middleAnswer = "Summarize this paper, identify the key findings, and explain its limitations. Use only the research paper as the source. Organize the response as a short summary followed by bullets.";
const middleEvidence = { summarizePaper: { present: true, evidence: "Summarize this paper" }, identifyKeyFindings: { present: true, evidence: "identify the key findings" }, explainLimitations: { present: true, evidence: "explain its limitations" }, preventFabricatedCitations: { present: false, evidence: "" }, preventUnsupportedClaims: { present: false, evidence: "" }, paperContext: { present: true, evidence: "Use only the research paper as the source" }, outputStructure: { present: true, evidence: "Organize the response as a short summary followed by bullets" } };
const middleEvaluation = { ...validEvaluation, criteria: { clarityInstructions: { score: 18, feedback: "Tasks are mostly clear." }, contextRelevance: { score: 16, feedback: "Academic context is present." }, outputStructure: { score: 14, feedback: "Basic format is named." }, accuracyResponsibleAI: { score: 12, feedback: "Safeguards are incomplete." } }, requirementEvidence: middleEvidence, totalScore: 60 };
assert.ok(parseEssayEvaluation(middleEvaluation, middleAnswer).totalScore >= 45 && parseEssayEvaluation(middleEvaluation, middleAnswer).totalScore <= 70, "partly complete prompts should remain in the intermediate band");
const highEvaluation = { ...validEvaluation, criteria: { clarityInstructions: { score: 24, feedback: "All tasks are explicit." }, contextRelevance: { score: 22, feedback: "The paper is the source." }, outputStructure: { score: 23, feedback: "Separate sections are requested." }, accuracyResponsibleAI: { score: 24, feedback: "Both safeguards are explicit." } }, totalScore: 93 };
assert.equal(parseEssayEvaluation(highEvaluation, validAnswer).totalScore, 93, "complete prompts may score high");
for (const [name, result] of [
  ["full", parseEssayEvaluation(validEvaluation, validAnswer)],
  ["bare/capped", lowResult],
  ["intermediate", parseEssayEvaluation(middleEvaluation, middleAnswer)],
  ["comprehensive", parseEssayEvaluation(highEvaluation, validAnswer)],
]) {
  assert.equal(result.totalScore, Object.values(result.criteria).reduce((sum, item) => sum + item.score, 0), `${name} total must equal the final criteria after caps`);
}
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
const structuredOutput = { ...validEvaluation };
delete structuredOutput.totalScore;
process.env.OPENAI_API_KEY = "test-placeholder-not-a-real-key";
globalThis.fetch = async (_url, options) => {
  const requestBody = JSON.parse(options.body);
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.equal(requestBody.response_format.json_schema.schema.required.includes("totalScore"), false, "the model does not produce an aggregate score");
  assert.equal(Object.hasOwn(requestBody.response_format.json_schema.schema.properties, "totalScore"), false);
  assert.match(requestBody.messages[0].content, /untrusted data/i);
  assert.match(requestBody.messages[0].content, /5–20 overall/i);
  assert.equal(JSON.parse(requestBody.messages[1].content).submitted_prompt, validAnswer);
  return Response.json({ choices: [{ message: { content: JSON.stringify(structuredOutput) } }] });
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
const hardeningMigration = await readFile(new URL("../supabase/migrations/20261115120000_essay_quota_hardening.sql", import.meta.url), "utf8");
const authMigration = await readFile(new URL("../supabase/migrations/20261021_usernames.sql", import.meta.url), "utf8");
assert.match(quotaMigration, /attempts \+ v_reserved >= 3/i);
assert.match(quotaMigration, /for update/i);
assert.match(quotaMigration, /primary key \(user_id, request_id\)/i);
assert.match(quotaMigration, /status = 'released'/i);
assert.match(quotaMigration, /status = 'succeeded'/i);
assert.match(quotaMigration, /drop function if exists public\.reserve_promptly_essay_attempt\(uuid\)/i, "upgrade replaces the earlier reservation RPC signature");
assert.match(quotaMigration, /drop function if exists public\.release_promptly_essay_attempt\(uuid, uuid\)/i, "upgrade replaces the earlier release RPC signature");
assert.match(quotaMigration, /drop function if exists public\.finalize_promptly_essay_attempt\(uuid, uuid, text, text, jsonb, integer, jsonb\)/i, "upgrade replaces the earlier finalization RPC signature");
assert.match(quotaMigration, /create function public\.reserve_promptly_essay_attempt\(p_request_id uuid, p_lease_token uuid\)/i);
assert.match(quotaMigration, /create function public\.release_promptly_essay_attempt\(p_user_id uuid, p_request_id uuid, p_lease_token uuid\)/i);
assert.match(quotaMigration, /create function public\.finalize_promptly_essay_attempt\([\s\S]*?p_lease_token uuid/i);
assert.doesNotMatch(quotaMigration, /jsonb_object_length\s*\(/i, "use the PostgreSQL-supported jsonb_object_keys function");
assert.match(quotaMigration, /from jsonb_object_keys\(p_criteria_scores\)/i);
assert.match(quotaMigration, /lease_token = p_lease_token/i, "only the current lease may release or finalize a reservation");
assert.match(quotaMigration, /revoke all on function public\.reserve_promptly_essay_attempt\(uuid, uuid\) from public, anon, authenticated/i);
assert.match(quotaMigration, /grant execute on function public\.reserve_promptly_essay_attempt\(uuid, uuid\) to authenticated/i);
assert.match(quotaMigration, /grant execute on function public\.release_promptly_essay_attempt\(uuid, uuid, uuid\) to service_role/i);
assert.match(quotaMigration, /grant execute on function public\.finalize_promptly_essay_attempt\(uuid, uuid, uuid, text, text, jsonb, integer, jsonb\) to service_role/i);
assert.match(quotaMigration, /revoke all on function public\.consume_promptly_essay_attempt\(\) from public, anon, authenticated/i);
assert.match(quotaMigration, /alter function public\.is_promptly_pro\(\) set search_path = pg_catalog/i);
assert.equal((quotaMigration.match(/set search_path = pg_catalog\s*as \$\$/gi) ?? []).length, 3, "new SECURITY DEFINER functions use a restricted search_path");
const reserveFunction = quotaMigration.split("create function public.reserve_promptly_essay_attempt")[1].split("create function public.release_promptly_essay_attempt")[0];
assert.match(reserveFunction, /reserved = reserved \+ 1/i);
assert.doesNotMatch(reserveFunction, /attempts = attempts \+ 1/i, "reservation alone must not consume a successful attempt");
const finalizeFunction = quotaMigration.split("create function public.finalize_promptly_essay_attempt")[1];
assert.match(finalizeFunction, /reserved = reserved - 1, attempts = attempts \+ 1/i);
assert.match(reserveFunction, /for update/i, "quota row lock must serialize concurrent reservations");
assert.match(reserveFunction, /if found and v_status = 'reserved' then return 'in_progress'/i, "duplicate in-flight request must not call OpenAI twice");
assert.match(reserveFunction, /reserved_at < now\(\) - interval '5 minutes'/i, "abandoned reservations expire");
assert.match(quotaMigration, /raise exception 'Essay reservation lease is stale\.'/i, "expired workers must not finalize a renewed reservation");
const route = await readFile(new URL("../app/api/essay-challenges/submit/route.ts", import.meta.url), "utf8");
assert.match(route, /auth\.getUser\(\)/);
assert.match(route, /reserve_promptly_essay_attempt/);
assert.match(route, /release_promptly_essay_attempt/);
assert.match(route, /finalize_promptly_essay_attempt/);
assert.match(route, /p_user_id: user\.id/);
assert.match(route, /p_request_id: submission\.requestId/);
assert.match(route, /p_lease_token: leaseToken/g);
assert.match(route, /p_criteria_scores: evaluation\.criteria/);
assert.match(route, /p_total_score: evaluation\.totalScore/);
assert.match(route, /p_feedback: \{ strengths: evaluation\.strengths, weaknesses: evaluation\.weaknesses, improvements: evaluation\.improvements, improvedPrompt: evaluation\.improvedPrompt \}/, "normalized feedback is sent as the JSON object expected by the database");
assert.match(route, /randomUUID\(\)/);
assert.match(route, /supabase\.rpc\("is_promptly_admin"\)/, "API admin access must use the canonical database role function");
assert.doesNotMatch(route, /from\("profiles"\)\.select\("role"\)/, "API must not authorize admin from a directly selected editable profile field");
assert.doesNotMatch(route, /body\.(?:score|total_score|criteria_scores)/i, "score must be calculated and persisted only on the server");
const reservePosition = route.indexOf("reserve_promptly_essay_attempt");
const evaluationPosition = route.indexOf("evaluateEssayPrompt(submission.answer)");
const finalizePosition = route.indexOf("finalize_promptly_essay_attempt");
assert.ok(reservePosition >= 0 && reservePosition < evaluationPosition && evaluationPosition < finalizePosition, "the request must reserve, evaluate, then atomically finalize");
assert.match(route.slice(evaluationPosition, finalizePosition), /release_promptly_essay_attempt/, "failed evaluation must release the reservation");
assert.match(route.slice(route.indexOf("let evaluation"), finalizePosition), /catch \(error\)[\s\S]*?release_promptly_essay_attempt/, "invalid evaluator output must take the same quota-release path as provider failures");

// Production hardening contract checks. These are source checks, not PostgreSQL integration tests.
assert.match(hardeningMigration, /create or replace function public\.reserve_promptly_essay_attempt/i);
assert.match(hardeningMigration, /perform pg_advisory_xact_lock\(hashtextextended\(v_user_id::text, 0\)\)/i, "serialize per-user quota changes across midnight and request IDs");
assert.match(hardeningMigration, /select max\(last_attempt_at\)[\s\S]*?where user_id = v_user_id/i, "30-second cost throttle spans daily quota rows");
const staleCleanup = hardeningMigration.split("-- Lock every affected daily counter")[1].split("select attempts, reserved into v_attempts")[0];
assert.match(staleCleanup, /select distinct usage_date[\s\S]*?status = 'reserved'[\s\S]*?reserved_at < now\(\) - interval '5 minutes'/i, "stale reservations from any prior date are considered");
assert.match(staleCleanup, /order by usage_date/i, "daily counter rows are locked in deterministic order");
assert.match(staleCleanup, /group by usage_date/i, "stale counts are reconciled per original quota date");
assert.match(staleCleanup, /limits\.reserved - expired_by_date\.reservation_count/i);
assert.match(staleCleanup, /limits\.reserved >= expired_by_date\.reservation_count/i, "counter underflow aborts cleanup instead of silently clamping");
assert.match(staleCleanup, /v_reconciled_group_count <> v_stale_group_count[\s\S]*?raise exception/i, "missing or inconsistent quota rows roll back cleanup atomically");
const hardenedFinalize = hardeningMigration.split("create or replace function public.finalize_promptly_essay_attempt")[1];
const leaseCheckPosition = hardenedFinalize.indexOf("if v_current_lease_token is distinct from p_lease_token");
const successPosition = hardenedFinalize.indexOf("if v_status = 'succeeded'");
assert.ok(leaseCheckPosition >= 0 && successPosition > leaseCheckPosition, "lease fencing is validated before returning a saved success");
assert.match(hardenedFinalize, /v_status is distinct from 'reserved'/i, "a released or expired lease cannot be finalized");
assert.match(hardeningMigration, /if not public\.is_promptly_admin\(\) and not public\.is_promptly_pro\(\)/i, "SQL uses the canonical admin function and server-verified subscription state");
assert.match(hardeningMigration, /alter function public\.is_promptly_admin\(\) set search_path = pg_catalog/i);
assert.match(authMigration, /revoke update \(id, role, created_at\) on public\.profiles from public,\s*anon,\s*authenticated/i, "authenticated users cannot edit their admin role");
assert.match(hardeningMigration, /create or replace function public\.reserve_promptly_essay_attempt\(p_request_id uuid, p_lease_token uuid\)/i, "hardening preserves the deployed reservation RPC signature");
assert.match(hardeningMigration, /create or replace function public\.release_promptly_essay_attempt\(p_user_id uuid, p_request_id uuid, p_lease_token uuid\)/i);
assert.match(hardeningMigration, /create or replace function public\.finalize_promptly_essay_attempt\([\s\S]*?p_lease_token uuid/i);
assert.match(hardeningMigration, /grant execute on function public\.reserve_promptly_essay_attempt\(uuid, uuid\) to authenticated/i);
assert.match(hardeningMigration, /grant execute on function public\.release_promptly_essay_attempt\(uuid, uuid, uuid\) to service_role/i);
assert.match(hardeningMigration, /grant execute on function public\.finalize_promptly_essay_attempt\(uuid, uuid, uuid, text, text, jsonb, integer, jsonb\) to service_role/i);
const releaseFunction = hardeningMigration.split("create or replace function public.release_promptly_essay_attempt")[1].split("create or replace function public.finalize_promptly_essay_attempt")[0];
assert.match(releaseFunction, /pg_advisory_xact_lock\(hashtextextended\(p_user_id::text, 0\)\)/i, "release serializes against all per-user reservation changes");
assert.match(hardenedFinalize, /pg_advisory_xact_lock\(hashtextextended\(p_user_id::text, 0\)\)/i, "finalize serializes against retries and stale cleanup");
assert.match(hardenedFinalize, /v_reserved_at timestamptz/i);
assert.match(hardenedFinalize, /feedback, submitted_at\)[\s\S]*?p_feedback, v_reserved_at/i, "the persisted attempt date matches the quota reservation date across midnight");
assert.doesNotMatch(hardeningMigration, /\b(drop table|delete from|truncate)\b/i, "hardening migration must preserve stored user and quiz data");

console.log("Essay rubric, API authorization, retry/quota SQL invariants, validation, and evaluator failure checks passed (static checks; no database was available).");
