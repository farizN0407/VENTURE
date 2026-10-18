import assert from "node:assert/strict";
import { chromium } from "playwright";

const challengeSlugs = ["prompt-battle", "can-you-trust-ai", "fix-the-prompt", "ai-or-human", "ai-in-real-life", "ai-for-research", "critical-thinking", "responsible-ai"];
const lessonSlugs = ["prompting", "fact-checking", "ai-knowledge", "practical-application", "ai-for-research", "critical-thinking", "responsible-ai"];

const baseUrl = process.env.PROMPTLY_URL ?? "http://localhost:3000";
const executablePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];

async function check(name, operation) {
  try {
    await operation();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  await check("landing renders with original brand heading and design colors", async () => {
    const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200);
    await page.getByRole("heading", { name: /How smart are you with AI/ }).waitFor();
    const palette = await page.evaluate(() => ({ blue: getComputedStyle(document.documentElement).getPropertyValue("--blue").trim(), yellow: getComputedStyle(document.documentElement).getPropertyValue("--yellow").trim() }));
    assert.equal(palette.blue, "#168bf2");
    assert.equal(palette.yellow, "#ffd13d");
    const fonts = await page.evaluate(async () => { await document.fonts.ready; return { dmSans: document.fonts.check("400 16px 'DM Sans'"), spaceGrotesk: document.fonts.check("700 24px 'Space Grotesk'") }; });
    assert.equal(fonts.dmSans, true);
    assert.equal(fonts.spaceGrotesk, true);
    await page.getByRole("heading", { name: "Learn → Play → Improve" }).waitFor();
    await page.getByRole("heading", { name: "Belajar memakai AI dengan lebih sadar." }).waitFor();
    await page.locator("#how-it-works a[href='/learn']").first().waitFor();
    await page.locator("#how-it-works a[href='/challenges']").first().waitFor();
    await page.locator("nav a[href='/login']").waitFor();
    await page.locator("footer a[href='#about']").waitFor();
  });

  await check("landing quick quiz gives correct-answer feedback", async () => {
    await page.getByRole("button", { name: /C\. Rangkum teks/ }).click();
    await page.locator(".feedback.show").getByText("Jawaban tepat.").waitFor();
  });

  await check("main landing calls to action and every challenge card navigate", async () => {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator(".hero-content .btn-main").click();
    await page.waitForURL("**/challenges");
    assert.equal(await page.locator(".challenge-grid .challenge").count(), challengeSlugs.length);
    for (const slug of challengeSlugs) {
      const playLink = page.locator(`a.play-link[href='/challenges/${slug}']`);
      assert.equal(await playLink.count(), 1);
      await playLink.click();
      await page.waitForURL(`**/challenges/${slug}`);
      await page.goto(`${baseUrl}/challenges`, { waitUntil: "networkidle" });
    }
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator(".navlinks a[href='/learn']").click();
    await page.waitForURL("**/learn");
  });

  await check("navigation and all lesson routes work", async () => {
    await page.goto(`${baseUrl}/learn`, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".lesson-card").count(), lessonSlugs.length);
    for (const slug of lessonSlugs) {
      const response = await page.goto(`${baseUrl}/learn/${slug}`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200, `lesson ${slug}`);
      await page.getByRole("link", { name: /Mulai quiz/ }).waitFor();
      await page.getByRole("heading", { name: new RegExp(`Uji pemahaman:`, "i") }).waitFor();
      assert.equal(await page.locator(".topic-quiz").count(), 1, `${slug} has its topic quiz`);
    }
  });

  await check("all seven topic quizzes complete five questions and reveal scored review only after submission", async () => {
    for (const slug of lessonSlugs) {
      const response = await page.goto(`${baseUrl}/learn/${slug}`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200, slug);
      const setupResponsePromise = page.waitForResponse((candidate) => candidate.url().includes("/api/topic-quizzes") && candidate.request().method() === "POST");
      await page.reload({ waitUntil: "networkidle" });
      const setupResponse = await setupResponsePromise;
      assert.equal(setupResponse.status(), 200, `${slug} quiz setup`);
      const setup = await setupResponse.json();
      assert.equal(setup.questions.length, 5);
      assert.ok(setup.questions.every((question) => !("correctIndex" in question) && !("correct_answer" in question)), "correct keys stay private before submit");
      assert.ok(setup.questions.every((question) => question.options.every((option) => option.id === option.text && !/-option-\d+$/.test(option.id))), "option ids do not disclose original answer positions");
      let resultResponsePromise;
      for (let index = 0; index < 5; index++) {
        if (index === 4) resultResponsePromise = page.waitForResponse((candidate) => candidate.url().includes("/api/quiz-attempts") && candidate.request().method() === "POST");
        await page.locator(".topic-question-card .answer").first().click();
        if (index < 4) await page.getByRole("button", { name: /Soal berikutnya/ }).click();
      }
      await page.locator(".result-score").waitFor();
      const resultResponse = await resultResponsePromise;
      const result = await resultResponse.json();
      assert.equal(result.total_questions, 5);
      assert.equal(result.review.length, 5);
      assert.equal(result.score, Math.round(result.correct_answers * 100 / 5));
      assert.ok(result.review.every((answer) => answer.explanation && answer.correct_answer), "full explanations follow submission");
      const resultText = await page.locator(".result-card").innerText();
      assert.match(resultText, /0\/100|20\/100|40\/100|60\/100|80\/100|100\/100/);
      assert.match(resultText, /Guest|guest|tidak tersimpan|profil akun mana pun/i);
    }
  });

  await check("guest retry avoids recently completed questions when at least five unseen remain", async () => {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.removeItem("promptly-guest-questions:prompting"));
    await page.goto(`${baseUrl}/learn/prompting`, { waitUntil: "networkidle" });
    const first = await page.locator(".topic-question-card .q-top span").nth(1).innerText();
    for (let index = 0; index < 5; index++) {
      await page.locator(".topic-question-card .answer").first().click();
      if (index < 4) await page.getByRole("button", { name: /Soal berikutnya/ }).click();
    }
    await page.locator(".result-score").waitFor();
    const firstSetup = await page.evaluate(() => JSON.parse(localStorage.getItem("promptly-guest-questions:prompting") ?? "[]"));
    assert.equal(firstSetup.length, 5);
    const nextResponsePromise = page.waitForResponse((candidate) => candidate.url().includes("/api/topic-quizzes") && candidate.request().method() === "POST");
    await page.getByRole("button", { name: "Coba lima soal lain" }).click();
    await page.locator(".topic-question-card").waitFor();
    const nextResponse = await nextResponsePromise;
    const next = await nextResponse.json();
    assert.equal(next.questions.length, 5);
    assert.equal(next.questions.filter((question) => firstSetup.includes(question.id)).length, 0);
    assert.match(first, /SOAL 1 DARI 5/);
  });

  await check("pricing accurately disables unavailable Pro checkout", async () => {
    await page.goto(`${baseUrl}/pricing`, { waitUntil: "networkidle" });
    const checkout = page.getByRole("button", { name: "Checkout belum tersedia" });
    await checkout.waitFor();
    assert.equal(await checkout.isDisabled(), true);
    await page.getByText("Belum ada fitur Pro eksklusif aktif").waitFor();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#pricing button.btn-disabled").isDisabled(), true);
  });

  await check("login and registration forms validate input and preserve guest access", async () => {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Masuk ke Promptly" }).waitFor();
    const loginForm = page.locator("form.auth-form");
    assert.equal(await loginForm.locator("input[type=email]").evaluate((input) => input.required), true);
    assert.equal(await loginForm.locator("input[type=password]").evaluate((input) => input.required), true);
    assert.equal(await loginForm.locator("input[type=password]").getAttribute("minlength"), "8");
    await loginForm.locator("button[type=submit]").click();
    assert.equal(new URL(page.url()).pathname, "/login", "empty login should be blocked by native validation");
    await page.getByRole("link", { name: "Daftar di sini" }).click();
    await page.waitForURL("**/register");
    await page.getByRole("heading", { name: "Buat akun Promptly" }).waitFor();
    await page.getByRole("link", { name: "Lanjut sebagai tamu" }).click();
    await page.waitForURL("**/challenges");
  });

  await check("account and authentication status explain unconfigured Supabase without fake data", async () => {
    await page.goto(`${baseUrl}/account`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Akun belum tersambung" }).waitFor();
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Masuk ke Promptly" }).waitFor();
    const email = page.locator("#login-email");
    const password = page.locator("#login-password");
    await email.fill("student@example.com");
    await password.fill("temporary-test-password");
    await page.getByRole("button", { name: "Masuk" }).click();
    await page.getByRole("alert").getByText(/Autentikasi belum dikonfigurasi/).waitFor();
    await page.goto(`${baseUrl}/register`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Buat akun Promptly" }).waitFor();
    await page.locator("#register-email").fill("student@example.com");
    await page.locator("#register-password").fill("temporary-test-password");
    await page.getByRole("button", { name: "Buat akun" }).click();
    await page.getByRole("alert").getByText(/Autentikasi belum dikonfigurasi/).waitFor();
  });

  await check("guest progress endpoint fails closed without an authenticated session", async () => {
    const response = await page.request.post(`${baseUrl}/api/module-completions`, { data: { module_slug: "prompting" } });
    assert.ok([401, 503].includes(response.status()), `unexpected status ${response.status()}`);
    const body = await response.json();
    assert.match(body.error, /Masuk|Supabase|Penyimpanan/);
    const earlyFeedback = await page.request.post(`${baseUrl}/api/quiz-feedback`, { data: { challenge_slug: "prompt-battle", question_index: 0, option_index: 0 } });
    assert.equal(earlyFeedback.status(), 409, "built-in topic quizzes cannot reveal per-answer correctness before completion");
  });

  await check("desktop and mobile layouts do not overflow horizontally", async () => {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(dimensions.scrollWidth <= dimensions.width + 1, `${viewport.width}px viewport overflowed: ${JSON.stringify(dimensions)}`);
      await page.getByRole("link", { name: "Materi" }).first().waitFor();
    }
  });
} finally {
  await browser.close();
}

if (failures.length) process.exitCode = 1;
