import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ESSAY_CHALLENGES, ESSAY_CRITERIA, getEssayChallenge, parseEssayEvaluation, parseEssayEvaluationWithDiagnostics, parseEssaySubmission, resolveEssayAccess,
  parseEssayQuota,
} from "../lib/essay-challenge.ts";
import { buildEssayEvaluationSchema, buildEssayScoringGuidance, evaluateEssayPrompt } from "../lib/essay-evaluator.ts";

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

for (const challenge of ESSAY_CHALLENGES) {
  const prompt = challenge.requirements.map(({ description }) => description).join(". ");
  const criteria = Object.fromEntries(ESSAY_CRITERIA.map(({ key }) => [key, { score: 25, feedback: "All challenge requirements are present." }]));
  const makePayload = (requirementEvidence) => ({
    criteria, requirementEvidence,
    strengths: ["The prompt covers the task."], weaknesses: ["Review the details."],
    improvements: ["Clarify any remaining details."], improvedPrompt: `A complete ${challenge.title} prompt.`,
  });
  const exactEvidence = Object.fromEntries(challenge.requirements.map(({ key, description }) => [key, { present: true, evidence: description }]));
  const firstRequirement = challenge.requirements[0];
  const firstRequirementCap = Math.min(...challenge.scoreCaps
    .filter(({ whenMissingAny = [], whenMissingAll = [] }) => whenMissingAny.includes(firstRequirement.key) || whenMissingAll.includes(firstRequirement.key))
    .map(({ maxScore }) => maxScore));

  const paraphrasedEvidence = { ...exactEvidence, [firstRequirement.key]: { present: true, evidence: "A paraphrase that does not appear in the submitted prompt." } };
  const paraphraseResult = parseEssayEvaluation(makePayload(paraphrasedEvidence), prompt, challenge);
  assert.ok(paraphraseResult.criteria[firstRequirement.criterion].score <= firstRequirementCap, `${challenge.slug} paraphrased evidence is treated as unproven and capped`);
  assert.equal(paraphraseResult.totalScore, Object.values(paraphraseResult.criteria).reduce((sum, item) => sum + item.score, 0), `${challenge.slug} total is recomputed after invalid evidence caps`);

  const missingEvidence = { ...exactEvidence };
  delete missingEvidence[firstRequirement.key];
  const missingResult = parseEssayEvaluation(makePayload(missingEvidence), prompt, challenge);
  assert.ok(missingResult.criteria[firstRequirement.criterion].score <= firstRequirementCap, `${challenge.slug} missing evidence is unproven and capped`);

  const unicodePrompt = `${firstRequirement.description.replace(" ", "\u00a0")} — café\n${challenge.requirements.slice(1).map(({ description }) => description).join(". ")}`;
  const unicodeEvidence = Object.fromEntries(challenge.requirements.map(({ key, description }) => [key, { present: true, evidence: description }]));
  unicodeEvidence[firstRequirement.key] = { present: true, evidence: `${firstRequirement.description} — cafe\u0301` };
  const unicodeResult = parseEssayEvaluation(makePayload(unicodeEvidence), unicodePrompt, challenge);
  assert.equal(unicodeResult.criteria[firstRequirement.criterion].score, 25, `${challenge.slug} exact evidence survives harmless whitespace and canonical Unicode differences`);
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

const professionalWriting = getEssayChallenge("professional-writing");
assert.ok(professionalWriting);
assert.match(buildEssayScoringGuidance(professionalWriting), /equivalent natural phrasing/i);
assert.match(buildEssayScoringGuidance(professionalWriting), /verbatim quote[\s\S]*never a paraphrase/i);
assert.match(buildEssayScoringGuidance(professionalWriting), /headings are optional/i);
assert.equal(buildEssayEvaluationSchema(professionalWriting).properties.requirementEvidence.properties.specifiedAudience.properties.evidence.type, "string");
assert.equal("maxLength" in buildEssayEvaluationSchema(professionalWriting).properties.requirementEvidence.properties.specifiedAudience.properties.evidence, false, "OpenAI Structured Outputs schema avoids unsupported string length keywords; the server still validates quote length");
function professionalWritingPayload(quoteByRequirement, criterionScores) {
  const requirementEvidence = Object.fromEntries(professionalWriting.requirements.map(({ key }) => {
    const quote = quoteByRequirement[key];
    return [key, quote ? { present: true, evidence: quote } : { present: false, evidence: "" }];
  }));
  const criteria = Object.fromEntries(ESSAY_CRITERIA.map(({ key }, index) => [key, { score: criterionScores[index], feedback: "The score reflects the submitted communication prompt." }]));
  return {
    criteria, requirementEvidence, strengths: ["The prompt sets a communication goal."],
    weaknesses: ["Some directions could be clearer."], improvements: ["Add any missing task details."],
    improvedPrompt: "Draft a professional message using the requested context and factual safeguards.",
  };
}
function professionalWritingResult(prompt, quoteByRequirement, criterionScores) {
  return parseEssayEvaluation(professionalWritingPayload(quoteByRequirement, criterionScores), prompt, professionalWriting);
}

const weakWritingPrompt = "Write a professional email.";
const weakWriting = professionalWritingResult(weakWritingPrompt, {
  draftEmailOrReport: "professional email",
}, [2, 2, 1, 1]);
assert.equal(weakWriting.totalScore, 6, "the weak live example remains low when the mock AI assigns low raw scores");
assert.equal(weakWriting.totalScore, Object.values(weakWriting.criteria).reduce((sum, item) => sum + item.score, 0));
const weakWritingDiagnostics = parseEssayEvaluationWithDiagnostics(professionalWritingPayload({ draftEmailOrReport: "professional email" }, [24, 24, 24, 24]), weakWritingPrompt, professionalWriting).diagnostics;
assert.deepEqual(weakWritingDiagnostics.appliedCaps.map(({ criterion }) => criterion), ["clarityInstructions", "contextRelevance", "outputStructure", "accuracyResponsibleAI"]);
assert.equal(weakWritingDiagnostics.totalScore, 26);
assert.deepEqual(Object.values(weakWritingDiagnostics.finalCriterionScores), [8, 8, 5, 5], "when all four caps trigger, their maximum combined score is 26");
assert.ok(weakWritingDiagnostics.requirements.some(({ id, claimedPresent, evidenceValid }) => id === "specifiedAudience" && !claimedPresent && !evidenceValid));
assert.equal(JSON.stringify(weakWritingDiagnostics).includes(weakWritingPrompt), false, "scoring diagnostics never include the submitted prompt");
assert.ok(weakWritingDiagnostics.requirements.every(({ failureReason }) => failureReason === "not_claimed" || failureReason === null));

const intermediateWritingPrompt = "Draft a respectful email to my project supervisor asking to extend the report deadline by one week.";
const intermediateWriting = professionalWritingResult(intermediateWritingPrompt, {
  draftEmailOrReport: "Draft a respectful email",
  specifiedAudience: "my project supervisor",
  specifiedPurpose: "asking to extend the report deadline by one week",
  appropriateTone: "respectful",
}, [18, 18, 12, 10]);
assert.ok(intermediateWriting.totalScore > 26 && intermediateWriting.totalScore < 80, "an intermediate prompt with alternate wording earns credit for evidence it explicitly contains");

const detailedDeadlinePrompt = "Please draft an email to my project supervisor explaining that integration testing is taking longer than planned and asking to move the release deadline from 14 May to 21 May. Keep the tone respectful, confident, and concise. Organize it with a clear opening, brief context, the new date, and a courteous close. Do not invent project status or commitments; if details are missing, use bracketed placeholders and ask me before adding them.";
const detailedDeadlineEvidence = {
  draftEmailOrReport: "draft an email",
  specifiedAudience: "my project supervisor",
  specifiedPurpose: "asking to move the release deadline from 14 May to 21 May",
  appropriateTone: "respectful, confident, and concise",
  outputStructure: "clear opening, brief context, the new date, and a courteous close",
  preventFabricatedFacts: "Do not invent project status or commitments; if details are missing, use bracketed placeholders and ask me before adding them.",
};
const detailedDeadline = professionalWritingResult(detailedDeadlinePrompt, detailedDeadlineEvidence, [23, 22, 22, 23]);
const detailedDeadlineDiagnostics = parseEssayEvaluationWithDiagnostics(professionalWritingPayload(detailedDeadlineEvidence, [23, 22, 22, 23]), detailedDeadlinePrompt, professionalWriting).diagnostics;
assert.equal(detailedDeadline.totalScore, 90, "a detailed paragraph-style deadline extension prompt can earn a high score without headings");
assert.equal(detailedDeadlineDiagnostics.appliedCaps.length, 0);
assert.ok(detailedDeadlineDiagnostics.requirements.every(({ evidenceValid }) => evidenceValid));
const wrappedDeadlineEvidence = Object.fromEntries(Object.entries(detailedDeadlineEvidence).map(([key, quote]) => [key, `“${quote}”`]));
wrappedDeadlineEvidence.outputStructure = `"${detailedDeadlineEvidence.outputStructure}"`;
const wrappedDeadline = parseEssayEvaluationWithDiagnostics(professionalWritingPayload(wrappedDeadlineEvidence, [23, 22, 22, 23]), detailedDeadlinePrompt, professionalWriting);
assert.equal(wrappedDeadline.evaluation.totalScore, detailedDeadline.totalScore, "outer quote marks are stripped while inner evidence remains an exact substring");
assert.ok(wrappedDeadline.diagnostics.requirements.every(({ evidenceValid, quoteWrapperRemoved }) => evidenceValid && quoteWrapperRemoved));

const sponsorshipHeadingPrompt = "Draft a professional sponsorship email to the local robotics club's director to request funding for the student showcase. Use a courteous, enthusiastic tone. Structure it with Subject, Greeting, Event overview, Sponsorship request, Benefits, and Sign-off. Use only provided event details; do not invent amounts, dates, sponsors, or promises. Leave [amount] and [date] placeholders for missing details.";
const sponsorshipEvidence = {
  draftEmailOrReport: "professional sponsorship email",
  specifiedAudience: "the local robotics club's director",
  specifiedPurpose: "to request funding for the student showcase",
  appropriateTone: "courteous, enthusiastic tone",
  outputStructure: "Subject, Greeting, Event overview, Sponsorship request, Benefits, and Sign-off",
  preventFabricatedFacts: "do not invent amounts, dates, sponsors, or promises. Leave [amount] and [date] placeholders for missing details.",
};
const sponsorshipHeading = professionalWritingResult(sponsorshipHeadingPrompt, sponsorshipEvidence, [25, 25, 25, 25]);
assert.equal(sponsorshipHeading.totalScore, 100, "the headed sponsorship case retains its expected score when exact evidence is valid");

const itDelayParagraphPrompt = "Write an email to the client project lead explaining our software rollout is delayed because the migration test found an unresolved data issue. The purpose is to propose a revised go-live date and request approval for an extra testing window. Keep the message calm, accountable, and professional. Begin with a concise status summary, explain the impact and next steps, then end with the requested decision and a polite sign-off. Do not invent metrics, causes, or commitments beyond these facts; use [placeholder] for missing details and ask before asserting them.";
const itDelayEvidence = {
  draftEmailOrReport: "Write an email",
  specifiedAudience: "the client project lead",
  specifiedPurpose: "propose a revised go-live date and request approval for an extra testing window",
  appropriateTone: "calm, accountable, and professional",
  outputStructure: "Begin with a concise status summary, explain the impact and next steps, then end with the requested decision and a polite sign-off",
  preventFabricatedFacts: "Do not invent metrics, causes, or commitments beyond these facts; use [placeholder] for missing details and ask before asserting them.",
};
const itDelayParagraph = professionalWritingResult(itDelayParagraphPrompt, itDelayEvidence, [23, 23, 22, 22]);
const itDelayDiagnostics = parseEssayEvaluationWithDiagnostics(professionalWritingPayload(itDelayEvidence, [23, 23, 22, 22]), itDelayParagraphPrompt, professionalWriting).diagnostics;
assert.equal(itDelayParagraph.totalScore, 90, "a paragraph-style IT delay prompt with an explicit sequence is not penalized for lacking headings");
assert.equal(itDelayDiagnostics.appliedCaps.length, 0);
assert.ok(itDelayDiagnostics.requirements.every(({ evidenceValid }) => evidenceValid));
assert.equal(detailedDeadline.totalScore, itDelayParagraph.totalScore, "equivalent paragraph-style requests are not capped differently from heading-based structure");
assert.ok(detailedDeadlineDiagnostics.requirements.every(({ exactQuoteMatch }) => exactQuoteMatch));
assert.ok(itDelayDiagnostics.requirements.every(({ exactQuoteMatch }) => exactQuoteMatch));

const itDelayHeadingPrompt = "Write an email to the client project lead. Purpose: explain our software rollout is delayed because the migration test found an unresolved data issue; propose a revised go-live date and request approval for an extra testing window. Tone: calm, accountable, and professional. Structure: begin with a concise status summary, explain the impact and next steps, then end with the requested decision and a polite sign-off. Accuracy: do not invent metrics, causes, or commitments beyond these facts; use [placeholder] for missing details and ask before asserting them.";
const itDelayHeadingEvidence = {
  draftEmailOrReport: "Write an email",
  specifiedAudience: "the client project lead",
  specifiedPurpose: "propose a revised go-live date and request approval for an extra testing window",
  appropriateTone: "calm, accountable, and professional",
  outputStructure: "begin with a concise status summary, explain the impact and next steps, then end with the requested decision and a polite sign-off",
  preventFabricatedFacts: "do not invent metrics, causes, or commitments beyond these facts; use [placeholder] for missing details and ask before asserting them.",
};
const itDelayHeading = professionalWritingResult(itDelayHeadingPrompt, itDelayHeadingEvidence, [23, 23, 22, 22]);
const itDelayHeadingDiagnostics = parseEssayEvaluationWithDiagnostics(professionalWritingPayload(itDelayHeadingEvidence, [23, 23, 22, 22]), itDelayHeadingPrompt, professionalWriting).diagnostics;
assert.equal(itDelayHeading.totalScore, itDelayParagraph.totalScore, "same IT-delay request receives the same score in headings and natural paragraphs");
assert.equal(itDelayHeadingDiagnostics.appliedCaps.length, 0);
assert.ok(itDelayHeadingDiagnostics.requirements.every(({ evidenceValid }) => evidenceValid));

const now = Date.now();
assert.equal(resolveEssayAccess("user", null, false, now).allowed, false);
assert.equal(resolveEssayAccess("admin", null, false, now).allowed, true, "admin role grants access without Pro subscription or a UI test flag");
assert.equal(resolveEssayAccess("admin", null, true, now).allowed, true);
assert.equal(resolveEssayAccess("user", { status: "active", current_period_end: new Date(now + 60_000).toISOString() }, false, now).allowed, true);
assert.deepEqual(parseEssayQuota([{ successful_attempts: 2, reserved_attempts: 1, daily_limit: 3 }]), { successfulAttempts: 2, reservedAttempts: 1, dailyLimit: 3 });
assert.deepEqual(parseEssayQuota([{ successful_attempts: 3, reserved_attempts: 0, daily_limit: 15 }]), { successfulAttempts: 3, reservedAttempts: 0, dailyLimit: 15 }, "three preexisting admin successes remain counted after raising the cap");
assert.deepEqual(parseEssayQuota({ successfulAttempts: 4, reservedAttempts: 0, dailyLimit: 15 }), { successfulAttempts: 4, reservedAttempts: 0, dailyLimit: 15 });
assert.deepEqual(parseEssayQuota([{ successful_attempts: 18, reserved_attempts: 0, daily_limit: 15 }]), { successfulAttempts: 18, reservedAttempts: 0, dailyLimit: 15 }, "historical counts above a cap remain visible without overflowing the bounded counter");
assert.deepEqual(parseEssayQuota({ successful_attempts: 4, reserved_attempts: 0, daily_limit: 3 }), { successfulAttempts: 4, reservedAttempts: 0, dailyLimit: 3 }, "a role change can display already-used results above the new lower cap");

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "test-placeholder-not-a-real-key";
for (const challenge of ESSAY_CHALLENGES) {
  const prompt = challenge.requirements.map(({ description }) => description).join("\n\n");
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
    assert.equal(requestBody.messages[1].content, prompt, "the model receives the exact submitted text, including real line breaks, without JSON escape sequences");
    return Response.json({ choices: [{ message: { content: JSON.stringify(structuredOutput) } }] });
  };
  let recordedDiagnostics;
  assert.equal((await evaluateEssayPrompt(prompt, challenge, (value) => { recordedDiagnostics = value; })).totalScore, 84, `structured output for ${challenge.slug} passes validation`);
  assert.ok(recordedDiagnostics.requirements.every(({ evidenceValid }) => evidenceValid));
  assert.equal(JSON.stringify(recordedDiagnostics).includes(prompt), false, "evaluator diagnostics omit submitted prompt content");
  const firstRequirement = challenge.requirements[0];
  structuredOutput.requirementEvidence[firstRequirement.key] = { present: true, evidence: "A paraphrase that is not a quote from the submitted prompt." };
  let invalidDiagnostics;
  const invalidEvidenceResult = await evaluateEssayPrompt(prompt, challenge, (value) => { invalidDiagnostics = value; });
  const applicableCap = Math.min(...challenge.scoreCaps
    .filter(({ whenMissingAny = [], whenMissingAll = [] }) => whenMissingAny.includes(firstRequirement.key) || whenMissingAll.includes(firstRequirement.key))
    .map(({ maxScore }) => maxScore));
  assert.ok(invalidEvidenceResult.criteria[firstRequirement.criterion].score <= applicableCap, `OpenAI paraphrased evidence for ${challenge.slug} is capped instead of failing evaluation`);
  assert.equal(invalidEvidenceResult.totalScore, Object.values(invalidEvidenceResult.criteria).reduce((sum, item) => sum + item.score, 0));
  assert.deepEqual(invalidDiagnostics.requirements.find(({ id }) => id === firstRequirement.key), {
    id: firstRequirement.key, claimedPresent: true, quoteProvided: true,
    quoteLength: "A paraphrase that is not a quote from the submitted prompt.".length,
    quoteWrapperRemoved: false, exactQuoteMatch: false, evidenceValid: false, failureReason: "not_exact_substring",
  });
  assert.equal(JSON.stringify(invalidDiagnostics).includes("A paraphrase"), false, "diagnostic logs expose quote validity, not user or model quote text");
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
const adminQuotaMigration = await readFile(new URL("../supabase/migrations/20261120150000_promptly_admin_essay_quota.sql", import.meta.url), "utf8");
const quotaHardeningMigration = await readFile(new URL("../supabase/migrations/20261120180000_promptly_admin_essay_quota_hardening.sql", import.meta.url), "utf8");
const quotaFinalizer = quotaHardeningMigration.split("create or replace function public.finalize_promptly_essay_attempt")[1].split("create or replace function public.get_promptly_essay_quota")[0];
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
assert.match(adminQuotaMigration, /drop constraint if exists essay_usage_limits_attempts_check/i);
assert.match(adminQuotaMigration, /attempts between 0 and 15 and reserved between 0 and 15 and attempts \+ reserved <= 15/i);
assert.match(adminQuotaMigration, /coalesce\(public\.is_promptly_admin\(\), false\)/i, "admin cap uses the canonical database authorization helper");
assert.match(adminQuotaMigration, /v_daily_limit := 15/i);
assert.match(adminQuotaMigration, /v_daily_limit := 3/i);
assert.match(adminQuotaMigration, /elsif coalesce\(public\.is_promptly_pro\(\), false\)/i, "non-admins still require verified Pro access");
assert.match(adminQuotaMigration, /pg_advisory_xact_lock\(hashtextextended\(v_user_id::text, 0\)\)/i, "per-user reservation lock prevents concurrent limit bypass");
assert.match(adminQuotaMigration, /for update/i, "quota and reservation rows are locked during concurrent submissions");
assert.match(adminQuotaMigration, /if found and v_status = 'reserved' then return 'in_progress'/i, "duplicate in-flight requests cannot reserve another evaluation");
assert.match(adminQuotaMigration, /if found and v_status = 'succeeded' then return 'already_succeeded'/i, "duplicate successful requests return existing results");
assert.match(adminQuotaMigration, /interval '30 seconds'/i, "30-second cooldown remains enforced");
assert.match(adminQuotaMigration, /interval '5 minutes'/i, "stale leases continue to expire");
assert.match(adminQuotaMigration, /select count\(\*\)::integer into v_successful_attempts[\s\S]*from public\.essay_attempts[\s\S]*submitted_at::date = current_date/i, "existing successes from every essay challenge count toward the expanded admin limit");
assert.match(adminQuotaMigration, /set attempts = v_successful_attempts/i, "usage counter is reconciled from persisted successes rather than reset");
assert.match(adminQuotaMigration, /v_attempts \+ v_reserved >= v_daily_limit/i, "both successful and in-flight work share the role-specific daily cap");
assert.match(adminQuotaMigration, /set reserved = reserved - 1, attempts = attempts \+ 1/i, "only successful finalization consumes quota");
assert.match(adminQuotaMigration, /get_promptly_essay_quota\(\)/i);
assert.match(adminQuotaMigration, /grant execute on function public\.get_promptly_essay_quota\(\) to authenticated/i);
assert.doesNotMatch(adminQuotaMigration, /\b(delete from|truncate|drop table)\b/i, "migration retains user history and usage rows");
assert.match(quotaHardeningMigration, /create or replace function public\.promptly_essay_daily_limit_for_user\(p_user_id uuid\)/i);
assert.match(quotaHardeningMigration, /select role into v_role from public\.profiles where id = p_user_id for share/i, "finalization rechecks and locks the authoritative current admin role");
assert.match(quotaHardeningMigration, /select status, current_period_end[\s\S]*from public\.subscriptions where user_id = p_user_id for share/i, "finalization rechecks and locks the current subscription");
assert.match(quotaHardeningMigration, /v_current_period_end > clock_timestamp\(\)/i);
assert.match(quotaHardeningMigration, /v_daily_limit := public\.promptly_essay_daily_limit_for_user\(p_user_id\)/i, "finalization uses current role/subscription limit, not the role at reservation time");
assert.match(quotaHardeningMigration, /if v_successful_attempts >= v_daily_limit then/i, "a downgraded Pro user cannot finalize above three successes");
assert.match(quotaHardeningMigration, /least\(15::bigint, v_successful_attempts\)::integer/i, "oversized historical counts are safely bounded in the integer counter");
assert.doesNotMatch(quotaFinalizer, /v_successful_attempts \+ v_reserved/i, "finalization checks the uncapped persisted history count, not a bounded counter");
assert.doesNotMatch(quotaHardeningMigration, /attempts \+ reserved <= 15/i, "inconsistent over-limit history and active reservations do not make reconciliation fail");
assert.match(quotaHardeningMigration, /select count\(\*\) into v_active_reservations[\s\S]*from public\.essay_attempt_reservations[\s\S]*status = 'reserved'/i, "reservation counters reconcile to active lease rows before applying the cap");
assert.match(quotaHardeningMigration, /reserved = least\(15::bigint, v_active_reservations\)::integer/i);
assert.match(quotaFinalizer, /attempts = least\(15::bigint, v_successful_attempts \+ 1\)::integer/i);
assert.match(quotaHardeningMigration, /v_today := \(v_now at time zone 'UTC'\)::date/i);
assert.match(quotaHardeningMigration, /v_date_start := v_today::timestamp at time zone 'UTC'/i);
assert.match(quotaHardeningMigration, /v_date_end := \(v_today \+ 1\)::timestamp at time zone 'UTC'/i);
assert.match(quotaHardeningMigration, /submitted_at >= v_date_start and submitted_at < v_date_end/i, "daily successes use a half-open UTC interval");
assert.match(quotaHardeningMigration, /v_date_start := v_usage_date::timestamp at time zone 'UTC'/i, "finalization stays on the reservation's UTC day after midnight");
assert.doesNotMatch(quotaHardeningMigration, /current_date|submitted_at::date/i, "all quota date logic avoids session-timezone-dependent casts");
assert.match(quotaHardeningMigration, /perform pg_advisory_xact_lock[\s\S]*?v_now := clock_timestamp\(\)[\s\S]*?v_today :=/i, "reservation chooses its UTC date after lock waiting, including midnight crossings");
assert.match(quotaHardeningMigration, /set timezone = 'UTC'/i);
assert.match(quotaHardeningMigration, /v_current_lease_token is distinct from p_lease_token[\s\S]*?if v_status = 'succeeded'/i, "lease fencing still precedes idempotent return");
assert.match(quotaHardeningMigration, /pg_advisory_xact_lock\(hashtextextended\(p_user_id::text, 0\)\)/i);
assert.match(quotaHardeningMigration, /revoke all on function public\.promptly_essay_daily_limit_for_user\(uuid\) from public, anon, authenticated/i);
assert.match(quotaHardeningMigration, /grant execute on function public\.promptly_essay_daily_limit_for_user\(uuid\) to service_role/i);
assert.doesNotMatch(quotaHardeningMigration, /\b(delete from|truncate|drop table)\b/i);
const route = await readFile(new URL("../app/api/essay-challenges/submit/route.ts", import.meta.url), "utf8");
assert.match(route, /reserve_promptly_essay_attempt/);
assert.match(route, /release_promptly_essay_attempt/);
assert.match(route, /evaluateEssayPrompt\(submission\.answer, challenge, \(diagnostics\) =>/);
assert.match(route, /console\.info\("Promptly essay evaluation diagnostics", diagnostics\)/);
assert.match(route, /never prompt text or evidence quotes/i);
assert.match(route, /p_challenge_slug: submission\.challengeSlug/);
assert.equal((route.match(/select\("id,answer,challenge_slug,criteria_scores,total_score,feedback,submitted_at"\)/g) ?? []).length, 2, "saved history responses retain the correct challenge title on the client");
assert.match(route, /p_user_id: user\.id/);
assert.match(route, /supabase\.rpc\("is_promptly_admin"\)/);
assert.match(route, /catch \(error\)[\s\S]*?release_promptly_essay_attempt/);
assert.match(route, /get_promptly_essay_quota/);
assert.match(route, /access\.isAdmin \? 15 : 3/);
const finalizeFailure = route.slice(route.indexOf("if (finalizeError || !attemptId)"), route.indexOf("const { data: saved", route.indexOf("if (finalizeError || !attemptId)")));
assert.match(finalizeFailure, /release_promptly_essay_attempt/);
assert.match(finalizeFailure, /finalizeError\?\.code === "42501"/);
assert.match(finalizeFailure, /finalizeError\?\.code === "P0001"/);
assert.ok(route.indexOf("reserve_promptly_essay_attempt") < route.indexOf("evaluateEssayPrompt(submission.answer, challenge,"), "reservation precedes the AI request for every challenge");
assert.doesNotMatch(route, /body\.(?:score|total_score|criteria_scores)/i);
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
assert.match(page, /ESSAY_CHALLENGES\.map/);
const form = await readFile(new URL("../app/components/EssayChallengeForm.tsx", import.meta.url), "utf8");
assert.match(form, /challenge_slug: challenge\.slug/);
assert.match(form, /Kuota hari ini: \$\{quota\.successfulAttempts\}\/\$\{quota\.dailyLimit\}/);

console.log("Three essay challenge rubrics, dynamic output validation, shared quota protections, access checks, and additive RPC migration passed (static/unit checks; no live provider or PostgreSQL database used).");
