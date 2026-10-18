import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const bank = JSON.parse(fs.readFileSync(path.join(root, "lib/topic-question-bank.json"), "utf8"));
const topicSlugs = Object.keys(bank);
const promptSet = new Set();
const allIds = new Set();
const skills = new Set(["Prompting", "Critical Thinking", "Fact Checking", "AI Knowledge", "Practical Application"]);

for (const [topic, questions] of Object.entries(bank)) {
  assert.equal(questions.length, 10, `${topic} has a ten-question pool`);
  const positions = new Set();
  const difficulties = new Set();
  for (const question of questions) {
    assert.ok(question.id && !allIds.has(question.id), `unique id ${question.id}`);
    allIds.add(question.id);
    const normalized = question.prompt.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    assert.ok(normalized.length > 24, `${question.id} has a meaningful prompt`);
    assert.ok(!promptSet.has(normalized), `no duplicate prompt: ${question.prompt}`);
    promptSet.add(normalized);
    assert.equal(question.options.length, 4, `${question.id} has four options`);
    assert.equal(new Set(question.options).size, 4, `${question.id} has distinct options`);
    assert.ok(Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < question.options.length, `${question.id} has one valid answer index`);
    assert.ok(question.explanation.trim().length >= 30, `${question.id} has a useful explanation`);
    assert.ok(skills.has(question.skill), `${question.id} has a known skill`);
    positions.add(question.correctIndex);
    difficulties.add(question.difficulty);
  }
  assert.ok(positions.size >= 3, `${topic} varies correct answer positions`);
  assert.ok(difficulties.size >= 2, `${topic} varies difficulty`);
}

function loadTypeScript(relativePath, aliases = {}) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (specifier) => aliases[specifier] ? aliases[specifier]() : originalRequire(specifier);
  loaded._compile(output, filename);
  return loaded.exports;
}

const engine = loadTypeScript("lib/topic-quizzes.ts", { "@/lib/topic-question-bank.json": () => require(path.join(root, "lib/topic-question-bank.json")) });
const progress = loadTypeScript("lib/progress.ts");
const randomFromSeed = (seed) => (max) => { seed = (seed * 48271) % 2147483647; return seed % max; };

for (const topic of topicSlugs) {
  const first = engine.selectTopicQuestions(topic, [], randomFromSeed(17));
  assert.equal(first.questions.length, 5, `${topic} serves exactly five questions`);
  assert.equal(new Set(first.questions.map((question) => question.id)).size, 5, `${topic} selects unique questions`);
  assert.ok(first.questions.every((question) => question.options.length === 4), `${topic} options are shuffled and complete`);
  assert.ok(first.questions.every((question) => !("correctIndex" in question) && !("correct_answer" in question)), `${topic} hides answer keys from the public payload`);
  const next = engine.selectTopicQuestions(topic, first.questions.map((question) => question.id), randomFromSeed(31));
  assert.equal(next.questions.length, 5);
  assert.equal(first.questions.filter((question) => next.questions.some((item) => item.id === question.id)).length, 0, `${topic} avoids repeats while at least five unseen questions remain`);

  const sourceById = new Map(bank[topic].map((question) => [question.id, question]));
  const allCorrect = first.questions.map((question) => ({ question_id: question.id, option_id: sourceById.get(question.id).options[sourceById.get(question.id).correctIndex] }));
  const correctGrade = engine.gradeTopicQuestions(topic, allCorrect);
  assert.equal(correctGrade.correct_answers, 5, `${topic} scores all correct answers after option shuffling`);
  assert.equal(correctGrade.score, 100);
  const allIncorrect = first.questions.map((question) => {
    const expected = sourceById.get(question.id);
    const wrong = expected.correctIndex === 0 ? 1 : 0;
    return { question_id: question.id, option_id: expected.options[wrong] };
  });
  const wrongGrade = engine.gradeTopicQuestions(topic, allIncorrect);
  assert.equal(wrongGrade.correct_answers, 0, `${topic} marks wrong answers accurately after option shuffling`);
  assert.equal(wrongGrade.score, 0);
  assert.throws(() => engine.gradeTopicQuestions(topic, allCorrect.slice(0, 4)), /exactly five/);
  assert.throws(() => engine.gradeTopicQuestions(topic, [...allCorrect.slice(0, 4), allCorrect[0]]), /duplicated/);
}

const freshProfile = progress.calculateLiteracyProfile([]);
assert.equal(freshProfile.overallScore, 0);
assert.equal(freshProfile.status, "Baru memulai");
assert.equal(freshProfile.completedAttempts, 0);
assert.ok(freshProfile.skills.length === 5 && freshProfile.skills.every((skill) => skill.score === 0 && skill.total === 0));
const updatedProfile = progress.calculateLiteracyProfile([
  { score: 80, skill_results: [{ skill: "Prompting", correct: 4, total: 5, score: 80 }] },
  { score: 60, skill_results: [{ skill: "Fact Checking", correct: 3, total: 5, score: 60 }, { skill: "Prompting", correct: 2, total: 5, score: 40 }] },
]);
assert.equal(updatedProfile.overallScore, 70, "overall score is the mean of completed quiz scores");
assert.equal(updatedProfile.skills.find((skill) => skill.name === "Prompting").score, 60, "skill score is correct answers divided by all questions for that skill");
assert.equal(updatedProfile.skills.find((skill) => skill.name === "Critical Thinking").score, 0, "unattempted skills remain zero");

const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
assert.match(schema, /quiz_attempts_user_attempt_id[\s\S]+?where attempt_id is not null/i, "completed user attempts are idempotent by unique user and attempt id");

console.log(`PASS ${topicSlugs.length} topics, ${allIds.size} unique questions, randomized scoring, five-question selection, repeat avoidance, and zero-start profile checks`);
