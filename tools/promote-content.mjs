#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import envTools from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = envTools;

const args = process.argv.slice(2);
const mode = args.shift();
const flags = Object.fromEntries(args.filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, ...rest] = arg.slice(2).split("=");
  return [key, rest.join("=") || true];
}));
const parseList = (value) => typeof value === "string" ? [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))] : [];
const fail = (message) => { console.error(message); process.exitCode = 1; };

function loadSelectedEnvironment() {
  if (!["development", "production"].includes(flags.environment)) throw new Error("Choose --environment=development or --environment=production explicitly to avoid using the wrong Supabase project.");
  loadEnvConfig(process.cwd(), flags.environment === "development");
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and the server-only SUPABASE_SECRET_KEY in this environment.");
  const expectedRef = flags["project-ref"];
  let configuredRef = "";
  try { configuredRef = new URL(url).hostname.split(".")[0]; } catch { /* Keep the generic project mismatch error below. */ }
  if (typeof expectedRef !== "string" || !/^[a-z0-9]{15,30}$/.test(expectedRef) || configuredRef !== expectedRef) {
    throw new Error("The configured Supabase project does not match --project-ref. Check the project reference in Supabase without sharing API keys.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function checked(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function selectedSlugs(value, option) {
  const slugs = parseList(value);
  if (slugs.some((slug) => !/^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) throw new Error(`${option} accepts comma-separated custom-* slugs only.`);
  return slugs;
}

async function exportContent() {
  const moduleSlugs = selectedSlugs(flags.modules, "--modules");
  const challengeSlugs = selectedSlugs(flags.challenges, "--challenges");
  if (!moduleSlugs.length && !challengeSlugs.length) throw new Error("Select at least one --modules or --challenges slug. Export never selects all CMS content implicitly.");
  const db = client();
  const modules = moduleSlugs.length ? await checked(db.from("learning_modules")
    .select("slug,title,summary,principle,example,practice,content_domain,challenge_slug,next_slug,published")
    .in("slug", moduleSlugs).eq("published", true).eq("content_domain", "ai_literacy"), "Read selected AI Literacy modules") : [];
  if (modules.length !== moduleSlugs.length) throw new Error("One or more selected modules are missing, unpublished, or outside the AI Literacy domain.");

  const challenges = [];
  for (const slug of challengeSlugs) {
    const row = await checked(db.from("challenges")
      .select("slug,title,category,description,learning_objective,difficulty,content_domain,module_slug,published")
      .eq("slug", slug).eq("published", true).eq("content_domain", "ai_literacy").maybeSingle(), `Read selected challenge ${slug}`);
    if (!row) throw new Error(`Selected challenge ${slug} is missing, unpublished, or outside the AI Literacy domain.`);
    const questions = await checked(db.from("challenge_questions").select("id,position,prompt,skill")
      .eq("challenge_slug", slug).order("position"), `Read questions for ${slug}`);
    if (!questions.length) throw new Error(`Challenge ${slug} has no questions.`);
    const serializedQuestions = [];
    for (const question of questions) {
      const options = await checked(db.from("challenge_options").select("id,position,body")
        .eq("question_id", question.id).order("position"), `Read options for ${slug}`);
      const keys = await checked(db.from("quiz_answer_keys").select("correct_option_id,explanation")
        .eq("question_id", question.id).maybeSingle(), `Read answer key for ${slug}`);
      const correctIndex = options.findIndex((option) => option.id === keys?.correct_option_id);
      if (!keys || correctIndex < 0 || options.length < 2) throw new Error(`Challenge ${slug} has an incomplete answer key or options.`);
      serializedQuestions.push({ prompt: question.prompt, skill: question.skill,
        options: options.map((option) => option.body), correctIndex, explanation: keys.explanation });
    }
    challenges.push({ ...row, questions: serializedQuestions });
  }

  const bundle = { format: "promptly-content-v1", content_domain: "ai_literacy", exported_at: new Date().toISOString(), modules, challenges };
  const directory = path.resolve(process.cwd(), "content-promotion");
  await mkdir(directory, { recursive: true });
  const filename = typeof flags.out === "string" ? path.basename(flags.out) : `ai-literacy-${new Date().toISOString().replaceAll(":", "-")}.json`;
  const target = path.join(directory, filename);
  await writeFile(target, `${JSON.stringify(bundle, null, 2)}\n`, { flag: "wx" });
  console.log(`Exported ${modules.length} module(s) and ${challenges.length} challenge(s) to ${path.relative(process.cwd(), target)}.`);
  console.log("The bundle contains quiz answer keys. It is ignored by Git; store and transfer it securely.");
}

const same = (row, values, fields) => fields.every((field) => row?.[field] === values[field]);
const assertSame = (row, values, fields, label) => {
  if (!same(row, values, fields)) throw new Error(`${label} already exists with different data. No row was overwritten; resolve this conflict manually.`);
};

async function importContent() {
  if (typeof flags.file !== "string") throw new Error("Pass --file=filename.json from the ignored content-promotion folder.");
  const filename = path.resolve(process.cwd(), "content-promotion", path.basename(flags.file));
  const bundle = JSON.parse(await readFile(filename, "utf8"));
  if (bundle?.format !== "promptly-content-v1" || bundle.content_domain !== "ai_literacy" || !Array.isArray(bundle.modules) || !Array.isArray(bundle.challenges)) throw new Error("Unsupported or invalid Promptly content bundle.");
  if (!bundle.modules.length && !bundle.challenges.length) throw new Error("The selected bundle is empty.");
  const db = client();
  const moduleFields = ["slug", "title", "summary", "principle", "example", "practice", "content_domain", "challenge_slug", "next_slug", "published"];

  for (const item of bundle.modules) {
    if (item.content_domain !== "ai_literacy" || item.published !== true) throw new Error(`Module ${item.slug} is not a published AI Literacy module.`);
    const values = Object.fromEntries(moduleFields.map((field) => [field, item[field] ?? null]));
    const existing = await checked(db.from("learning_modules").select(moduleFields.join(",")).eq("slug", item.slug).maybeSingle(), `Check module ${item.slug}`);
    if (existing) assertSame(existing, values, moduleFields, `Module ${item.slug}`);
    else await checked(db.from("learning_modules").insert(values).select("slug").single(), `Insert module ${item.slug}`);
    console.log(`${existing ? "Already identical" : "Added"} module ${item.slug}.`);
  }

  const challengeFields = ["slug", "title", "category", "description", "learning_objective", "difficulty", "content_domain", "module_slug", "published"];
  for (const item of bundle.challenges) {
    if (item.content_domain !== "ai_literacy" || item.published !== true || !Array.isArray(item.questions) || !item.questions.length) throw new Error(`Challenge ${item.slug} is not a published AI Literacy challenge with questions.`);
    if (item.module_slug) {
      const bundledModule = bundle.modules.some((module) => module.slug === item.module_slug);
      const targetModule = bundledModule || await checked(db.from("learning_modules").select("slug")
        .eq("slug", item.module_slug).eq("published", true).eq("content_domain", "ai_literacy").maybeSingle(), `Check related module ${item.module_slug}`);
      if (!targetModule) throw new Error(`Related module ${item.module_slug} must already exist in the target or be included in this bundle.`);
    }
    const values = Object.fromEntries(challengeFields.map((field) => [field, item[field] ?? null]));
    const existing = await checked(db.from("challenges").select(challengeFields.join(",")).eq("slug", item.slug).maybeSingle(), `Check challenge ${item.slug}`);
    if (existing) assertSame(existing, values, challengeFields, `Challenge ${item.slug}`);
    else await checked(db.from("challenges").insert(values).select("slug").single(), `Insert challenge ${item.slug}`);
    console.log(`${existing ? "Already identical" : "Added"} challenge ${item.slug}.`);

    const allQuestions = await checked(db.from("challenge_questions").select("id,position").eq("challenge_slug", item.slug), `Check question count for ${item.slug}`);
    if (allQuestions.some((question) => question.position > item.questions.length)) throw new Error(`Challenge ${item.slug} has extra questions in the target. No rows were removed; resolve the mismatch manually.`);

    for (let index = 0; index < item.questions.length; index += 1) {
      const question = item.questions[index];
      const position = index + 1;
      if (!question?.prompt || !question?.skill || !Array.isArray(question.options) || question.options.length < 2 || !Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.options.length || !question.explanation) throw new Error(`Question ${position} in ${item.slug} is invalid.`);
      let targetQuestion = await checked(db.from("challenge_questions").select("id,prompt,skill").eq("challenge_slug", item.slug).eq("position", position).maybeSingle(), `Check question ${position} in ${item.slug}`);
      if (targetQuestion) assertSame(targetQuestion, question, ["prompt", "skill"], `Question ${position} in ${item.slug}`);
      else targetQuestion = await checked(db.from("challenge_questions").insert({ challenge_slug: item.slug, position, prompt: question.prompt, skill: question.skill }).select("id,prompt,skill").single(), `Insert question ${position} in ${item.slug}`);

      const targetOptions = await checked(db.from("challenge_options").select("id,position,body").eq("question_id", targetQuestion.id).order("position"), `Check options ${position} in ${item.slug}`);
      if (targetOptions.some((option) => option.position > question.options.length) || targetOptions.some((option) => option.body !== question.options[option.position - 1])) throw new Error(`Options for question ${position} in ${item.slug} differ. No existing row was changed.`);
      for (let optionIndex = 0; optionIndex < question.options.length; optionIndex += 1) {
        if (!targetOptions.some((option) => option.position === optionIndex + 1)) {
          await checked(db.from("challenge_options").insert({ question_id: targetQuestion.id, position: optionIndex + 1, body: question.options[optionIndex] }), `Insert option ${optionIndex + 1} in ${item.slug}`);
        }
      }
      const refreshedOptions = await checked(db.from("challenge_options").select("id,position,body").eq("question_id", targetQuestion.id).order("position"), `Verify options ${position} in ${item.slug}`);
      const selected = refreshedOptions.find((option) => option.position === question.correctIndex + 1);
      const key = await checked(db.from("quiz_answer_keys").select("correct_option_id,explanation").eq("question_id", targetQuestion.id).maybeSingle(), `Check answer key ${position} in ${item.slug}`);
      if (key) {
        const existingCorrectOption = refreshedOptions.find((option) => option.id === key.correct_option_id);
        if (key.explanation !== question.explanation || existingCorrectOption?.position !== question.correctIndex + 1) throw new Error(`Answer key for question ${position} in ${item.slug} differs. No existing row was changed.`);
      } else await checked(db.from("quiz_answer_keys").insert({ question_id: targetQuestion.id, correct_option_id: selected.id, explanation: question.explanation }), `Insert answer key ${position} in ${item.slug}`);
    }
  }
  console.log("Content import finished. Existing rows were only compared; conflicts stop the run and no rows are updated or deleted.");
}

try {
  loadSelectedEnvironment();
  if (mode === "export") await exportContent();
  else if (mode === "import") await importContent();
  else throw new Error("Usage: node tools/promote-content.mjs export --environment=development --project-ref=PROJECT_REF --modules=slug1 --challenges=slug2 [--out=file.json] | import --environment=production --project-ref=PROJECT_REF --file=file.json");
} catch (error) {
  fail(error instanceof Error ? error.message : "Content promotion failed.");
}
