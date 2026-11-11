import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ESSAY_CHALLENGE, ESSAY_CRITERIA, parseEssayEvaluation, parseEssaySubmission, resolveEssayAccess,
} from "../lib/essay-challenge.ts";
import { evaluateEssayPrompt } from "../lib/essay-evaluator.ts";

const validAnswer = "Summarize the paper and explain its key findings, limitations, and evidence.";
assert.equal(parseEssaySubmission({ challenge_slug: ESSAY_CHALLENGE.slug, answer: validAnswer }).answer, validAnswer);
assert.throws(() => parseEssaySubmission({ challenge_slug: ESSAY_CHALLENGE.slug, answer: "short" }), /sedikitnya/);
assert.throws(() => parseEssaySubmission({ challenge_slug: ESSAY_CHALLENGE.slug, answer: "x".repeat(5001) }), /tidak boleh/);
assert.throws(() => parseEssaySubmission({ challenge_slug: ESSAY_CHALLENGE.slug, answer: validAnswer, total_score: 100 }), /field yang tidak didukung/);
assert.throws(() => parseEssaySubmission({ challenge_slug: "other", answer: validAnswer }), /tidak ditemukan/);

const criterionScores = Object.fromEntries(ESSAY_CRITERIA.map(({ key }, index) => [key, { score: 20 + index, feedback: `Feedback ${index}` }]));
const validEvaluation = { criteria: criterionScores, totalScore: 86, strengths: ["Clear purpose"], improvements: ["Add source-grounding rules"], improvedPrompt: "A better prompt with detailed instructions." };
assert.equal(parseEssayEvaluation(validEvaluation).totalScore, 86);
assert.throws(() => parseEssayEvaluation({ ...validEvaluation, totalScore: 100 }), /total skor/);
assert.throws(() => parseEssayEvaluation({ ...validEvaluation, criteria: { ...criterionScores, clarityInstructions: { score: "20", feedback: "Bad type" } } }), /Skor atau feedback/);

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
assert.match(migration, /attempts < 3/i);
const route = await readFile(new URL("../app/api/essay-challenges/submit/route.ts", import.meta.url), "utf8");
assert.match(route, /auth\.getUser\(\)/);
assert.match(route, /user_id: user\.id/);
assert.doesNotMatch(route, /body\.(?:score|total_score|criteria_scores)/i, "score must be calculated and persisted only on the server");

console.log("Essay challenge validation, access rules, structured evaluator, API failure handling, and storage security checks passed.");
