import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ESSAY_CHALLENGES, ESSAY_CRITERIA, getEssayChallenge, parseEssayEvaluation, parseEssaySubmission, resolveEssayAccess,
} from "../lib/essay-challenge.ts";
import { buildEssayEvaluationSchema, evaluateEssayPrompt } from "../lib/essay-evaluator.ts";

const requestId = "f121c834-d2b8-4e3e-8c0e-7a2825600021";
assert.deepEqual(ESSAY_CHALLENGES.map(({ slug }) => slug), ["academic-research-assistant", "data-analysis-assistant", "professional-writing"]);
assert.equal(getEssayChallenge("fact-checking"), undefined, "Fact-Checking essay must not be introduced");
assert.equal(getEssayChallenge("critical-thinking"), undefined, "Critical Thinking essay must not be introduced");
assert.equal(ESSAY_CRITERIA.length, 4);
for (const challenge of ESSAY_CHALLENGES) {
  const prompt = challenge.requirements.map(({ description }) => description).join(". ");
  const submission = parseEssaySubmission({ challenge_slug: challenge.slug, answer: prompt, request_id: requestId });
  assert.equal(submission.challengeSlug, challenge.slug, `${challenge.title} slug must parse`);
  assert.throws(() => parseEssaySubmission({ challenge_slug: "unknown", answer: prompt, request_id: requestId }), /tidak ditemukan/);
  const evidence = Object.fromEntries(challenge.requirements.map(({ key, description }) => [key, { present: true, evidence: description }]));
  const criteria = Object.fromEntries(ESSAY_CRITERIA.map(({ key }) => [key, { score: 25, feedback: `Evidence from ${challenge.title} prompt supports this score.` }]));
  const result = parseEssayEvaluation({ criteria, requirementEvidence: evidence, strengths: ["The task is covered."], weaknesses: ["Review scope."], improvements: ["Clarify edge cases."], improvedPrompt: `A stronger ${challenge.title} prompt with every requirement addressed.` }, prompt, challenge);
  assert.equal(result.totalScore, 100, `${challenge.title} can score highly when requirements and rubric are met`);
  assert.equal(result.totalScore, Object.values(result.criteria).reduce((sum, item) => sum + item.score, 0));
  assert.deepEqual(Object.keys(buildEssayEvaluationSchema(challenge).properties.requirementEvidence.properties), challenge.requirements.map(({ key }) => key));

  const weakPrompt = "Please analyze this carefully without extra detail.";
  const weakCriteria = Object.fromEntries(ESSAY_CRITERIA.map(({ key }) => [key, { score: 24, feedback: "The prompt needs more task-specific requirements." }]));
  const absentEvidence = Object.fromEntries(challenge.requirements.map(({ key }) => [key, { present: false, evidence: "" }]));
  const weak = parseEssayEvaluation({ criteria: weakCriteria, requirementEvidence: absentEvidence, strengths: ["The request is concise."], weaknesses: ["Key task details are missing."], improvements: ["Specify the task and constraints."], improvedPrompt: `A complete, responsible ${challenge.title} task prompt.` }, weakPrompt, challenge);
  assert.ok(weak.totalScore < 60, `${challenge.title} missing its configured requirements must be capped below 60`);
  assert.ok(weak.weaknesses.length && weak.improvements.length, "missing challenge requirements appear in weaknesses and actions");
  for (const value of Object.values(weak.criteria)) assert.ok(value.score <= 25);
}

const academic = ESSAY_CHALLENGES[0];
const lowPrompt = "Summarize this paper";
const low = parseEssayEvaluation({
  criteria: Object.fromEntries(ESSAY_CRITERIA.map(({ key }) => [key, { score: 25, feedback: "The request is underspecified." }])),
  requirementEvidence: { summarizePaper: { present: true, evidence: "Summarize" }, identifyKeyFindings: { present: false, evidence: "" }, explainLimitations: { present: false, evidence: "" }, paperContext: { present: false, evidence: "" }, outputStructure: { present: false, evidence: "" }, preventFabricatedCitations: { present: false, evidence: "" }, preventUnsupportedClaims: { present: false, evidence: "" } },
  strengths: ["It requests a summary."], weaknesses: ["Important requirements are absent."], improvements: ["Specify all requested outputs and safeguards."], improvedPrompt: "Summarize the supplied paper in sections and explain the limits without adding unsupported details.",
}, lowPrompt, academic);
assert.equal(low.totalScore, 20, "a bare research summary request remains appropriately low");
assert.deepEqual(Object.values(low.criteria).map(({ score }) => score), [5, 5, 5, 5]);
assert.equal(low.totalScore, Object.values(low.criteria).reduce((sum, item) => sum + item.score, 0));

const now = Date.now();
assert.equal(resolveEssayAccess("user", null, false, now).allowed, false);
assert.equal(resolveEssayAccess("admin", null, false, now).allowed, false);
assert.equal(resolveEssayAccess("admin", null, true, now).allowed, true);
assert.equal(resolveEssayAccess("user", { status: "active", current_period_end: new Date(now + 60_000).toISOString() }, false, now).allowed, true);

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "test-placeholder-not-a-real-key";
for (const challenge of ESSAY_CHALLENGES) {
  const prompt = challenge.requirements.map(({ description }) => description).join(". ");
  const schema = buildEssayEvaluationSchema(challenge);
  const structuredOutput = {
    criteria: Object.fromEntries(ESSAY_CRITERIA.map(({ key }) => [key, { score: 21, feedback: `This criterion is supported for ${challenge.title}.` }])),
    requirementEvidence: Object.fromEntries(challenge.requirements.map(({ key, description }) => [key, { present: true, evidence: description }])),
    strengths: ["The task is explicit."], weaknesses: ["One detail may be clarified."], improvements: ["Clarify the output sequence."], improvedPrompt: `An improved ${challenge.title} prompt with all requirements.`,
  };
  globalThis.fetch = async (_url, options) => {
    const requestBody = JSON.parse(options.body);
    assert.equal(requestBody.response_format.json_schema.strict, true);
    assert.deepEqual(requestBody.response_format.json_schema.schema, schema);
    assert.match(requestBody.messages[0].content, /untrusted data/i);
    assert.equal(JSON.parse(requestBody.messages[1].content).submitted_prompt, prompt);
    return Response.json({ choices: [{ message: { content: JSON.stringify(structuredOutput) } }] });
  };
  assert.equal((await evaluateEssayPrompt(prompt, challenge)).totalScore, 84, `structured output for ${challenge.slug} passes validation`);
}
globalThis.fetch = async () => new Response("unavailable", { status: 503 });
await assert.rejects(() => evaluateEssayPrompt("A long enough prompt for an unavailable evaluator."), /gagal memproses/);
globalThis.fetch = async () => Response.json({ choices: [{ message: { content: "not-json" } }] });
await assert.rejects(() => evaluateEssayPrompt("A long enough prompt for an invalid evaluator response."), /JSON yang tidak valid/);
globalThis.fetch = originalFetch;
if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = originalKey;

const challengeMigration = await readFile(new URL("../supabase/migrations/20261111_promptly_essay_challenges.sql", import.meta.url), "utf8");
const quotaMigration = await readFile(new URL("../supabase/migrations/20261115_essay_quota_reservations.sql", import.meta.url), "utf8");
const hardeningMigration = await readFile(new URL("../supabase/migrations/20261115120000_essay_quota_hardening.sql", import.meta.url), "utf8");
const expansionMigration = await readFile(new URL("../supabase/migrations/20261120120000_promptly_essay_challenges_expand.sql", import.meta.url), "utf8");
assert.match(challengeMigration, /alter table public\.essay_attempts enable row level security/i);
assert.match(challengeMigration, /auth\.uid\(\) = user_id/i);
assert.match(quotaMigration, /attempts \+ v_reserved >= 3/i);
assert.match(quotaMigration, /primary key \(user_id, request_id\)/i);
assert.match(quotaMigration, /create function public\.reserve_promptly_essay_attempt\(p_request_id uuid, p_lease_token uuid\)/i);
const reservationRpc = quotaMigration.split("create function public.reserve_promptly_essay_attempt")[1].split("create function public.release_promptly_essay_attempt")[0];
assert.doesNotMatch(reservationRpc.slice(0, reservationRpc.indexOf("returns text")), /challenge/i, "daily quota reservation is shared across challenge slugs");
assert.match(reservationRpc, /reserved = reserved \+ 1/i);
assert.doesNotMatch(reservationRpc, /attempts = attempts \+ 1/i, "failed or merely reserved work does not consume successful quota");
assert.match(quotaMigration, /reserved = reserved - 1, attempts = attempts \+ 1/i, "only finalization counts a successful evaluation");
assert.match(hardeningMigration, /if found and v_status = 'reserved' then return 'in_progress'/i, "same in-flight request cannot launch duplicate AI work");
assert.match(hardeningMigration, /raise exception 'Essay reservation lease is stale\.'/i);
assert.match(hardeningMigration, /if not public\.is_promptly_admin\(\) and not public\.is_promptly_pro\(\)/i);
assert.match(expansionMigration, /'data-analysis-assistant'/i);
assert.match(expansionMigration, /'professional-writing'/i);
assert.doesNotMatch(expansionMigration, /'fact-checking'|'critical-thinking'/i);
assert.match(expansionMigration, /p_challenge_slug not in \('academic-research-assistant', 'data-analysis-assistant', 'professional-writing'\)/i);
assert.match(expansionMigration, /where slug = p_challenge_slug and published = true/i);
assert.match(expansionMigration, /revoke all on function public\.finalize_promptly_essay_attempt[\s\S]*from public, anon, authenticated/i);
assert.match(expansionMigration, /grant execute on function public\.finalize_promptly_essay_attempt[\s\S]*to service_role/i);
assert.doesNotMatch(expansionMigration, /\b(drop table|delete from|truncate)\b/i);
const route = await readFile(new URL("../app/api/essay-challenges/submit/route.ts", import.meta.url), "utf8");
assert.match(route, /reserve_promptly_essay_attempt/);
assert.match(route, /release_promptly_essay_attempt/);
assert.match(route, /evaluateEssayPrompt\(submission\.answer, challenge\)/);
assert.match(route, /p_challenge_slug: submission\.challengeSlug/);
assert.equal((route.match(/select\("id,answer,challenge_slug,criteria_scores,total_score,feedback,submitted_at"\)/g) ?? []).length, 2, "saved history responses retain the correct challenge title on the client");
assert.match(route, /p_user_id: user\.id/);
assert.match(route, /supabase\.rpc\("is_promptly_admin"\)/);
assert.match(route, /catch \(error\)[\s\S]*?release_promptly_essay_attempt/);
assert.ok(route.indexOf("reserve_promptly_essay_attempt") < route.indexOf("evaluateEssayPrompt(submission.answer, challenge)"), "reservation precedes the AI request for every challenge");
assert.doesNotMatch(route, /body\.(?:score|total_score|criteria_scores)/i);
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
assert.match(page, /ESSAY_CHALLENGES\.map/);
const form = await readFile(new URL("../app/components/EssayChallengeForm.tsx", import.meta.url), "utf8");
assert.match(form, /challenge_slug: challenge\.slug/);

console.log("Three essay challenge rubrics, dynamic output validation, shared quota protections, access checks, and additive RPC migration passed (static/unit checks; no live provider or PostgreSQL database used).");
