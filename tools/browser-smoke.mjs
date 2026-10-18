import assert from "node:assert/strict";
import { chromium } from "playwright";

const challengeKeys = {
  "prompt-battle": [2, 1, 3],
  "can-you-trust-ai": [1, 0, 2],
  "fix-the-prompt": [3, 1],
  "ai-or-human": [2, 0],
  "ai-in-real-life": [1, 2],
  "ai-for-research": [1, 0, 1],
  "critical-thinking": [1, 1],
  "responsible-ai": [1, 1, 1],
};

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
    assert.equal(await page.locator(".challenge-grid .challenge").count(), Object.keys(challengeKeys).length);
    for (const slug of Object.keys(challengeKeys)) {
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
    assert.equal(await page.locator(".lesson-card").count(), 5);
    for (const slug of ["prompting", "fact-checking", "ai-for-research", "critical-thinking", "responsible-ai"]) {
      const response = await page.goto(`${baseUrl}/learn/${slug}`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200, `lesson ${slug}`);
      await page.getByRole("link", { name: /Latihan dengan quiz/ }).waitFor();
    }
  });

  await check("all eight challenges can be completed with correct answers and accurate scores", async () => {
    for (const [slug, answerKey] of Object.entries(challengeKeys)) {
      const response = await page.goto(`${baseUrl}/challenges/${slug}`, { waitUntil: "networkidle" });
      assert.equal(response?.status(), 200, slug);
      const questionCount = Number((await page.locator(".q-top span").nth(1).innerText()).match(/DARI (\d+)/)?.[1]);
      assert.equal(questionCount, answerKey.length, `${slug} answer key length`);
      const optionCount = await page.locator(".answer").count();
      for (let index = 0; index < answerKey.length; index++) {
        await page.locator(".answer").nth(answerKey[index]).click();
        await page.locator(".feedback.show").getByText("Jawaban tepat.").waitFor();
        assert.equal(await page.locator(".answer").count(), optionCount, `${slug} options remain consistent`);
        if (index < answerKey.length - 1) await page.getByRole("button", { name: /Soal berikutnya/ }).click();
        else await page.getByRole("button", { name: /Lihat hasil/ }).click();
      }
      await page.getByRole("heading", { name: "100/100" }).waitFor();
      await page.getByText("Langkah belajar berikutnya").waitFor();
    }
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
