import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.PROMPTLY_URL ?? "http://127.0.0.1:3000";
const executablePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  await page.getByRole("heading", { name: /How smart are you with AI/ }).waitFor();
  assert.equal(await page.locator(".try, .question-card, .pricing-grid, .about-section, .how-section").count(), 0, "redundant homepage sections are removed");
  assert.equal(await page.locator("#profile").count(), 1, "AI Literacy Profile remains on homepage");
  assert.equal(await page.locator("#badges").count(), 1, "achievement section remains on homepage");
  assert.equal(await page.locator("#about").innerText().then((text) => /Belajar menggunakan AI dengan lebih jelas, kritis, dan bertanggung jawab/.test(text)), true, "About navigation target remains in footer tagline");
  assert.equal(await page.locator(".navlinks a[href='/how-it-works']").count(), 1, "single How it Works navigation link remains");
  assert.equal(await page.locator(".navlinks a[href='/pricing']").count(), 1, "pricing navigation remains");
  assert.equal(await page.locator(".nav-login").count(), 2, "guest navigation remains available in the test context");
  const allCount = await page.locator(".home-quiz-card").count();
  const allMaterialCount = await page.locator(".home-material-card").count();
  assert.ok(allCount > 4);
  assert.ok(allMaterialCount > 4);
  assert.equal(await page.locator(".home-quiz-card:visible").count(), allCount);
  assert.equal(await page.locator(".home-material-card:visible").count(), allMaterialCount);
  assert.equal(await page.locator(".home-quiz-toggle").isVisible(), false);
  assert.equal(await page.locator(".home-material-toggle").isVisible(), false);
  assert.equal(await page.locator(".navlinks").getByRole("link", { name: "Cara kerja" }).count(), 1);
  const desktopOrder = await page.locator(".home-quiz-card").evaluateAll((cards) => cards.slice(0, 4).map((card) => card.querySelector("a.play-link")?.getAttribute("href")));
  const desktopMaterialOrder = await page.locator(".home-material-card").evaluateAll((cards) => cards.slice(0, 4).map((card) => card.querySelector("a.play-link")?.getAttribute("href")));

  for (const width of [360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".home-quiz-card:visible").count(), 4, `${width}px initial quiz count`);
    const mobileOrder = await page.locator(".home-quiz-card").evaluateAll((cards) => cards.slice(0, 4).map((card) => card.querySelector("a.play-link")?.getAttribute("href")));
    assert.deepEqual(mobileOrder, desktopOrder, `${width}px quiz order`);
    assert.equal(await page.locator(".home-material-card:visible").count(), 4, `${width}px initial material count`);
    const mobileMaterialOrder = await page.locator(".home-material-card").evaluateAll((cards) => cards.slice(0, 4).map((card) => card.querySelector("a.play-link")?.getAttribute("href")));
    assert.deepEqual(mobileMaterialOrder, desktopMaterialOrder, `${width}px material order`);
    await page.getByRole("button", { name: "Lihat Semua Quiz" }).click();
    assert.equal(await page.locator(".home-quiz-card:visible").count(), allCount, `${width}px expanded quiz count`);
    await page.getByRole("button", { name: "Tampilkan Lebih Sedikit" }).click();
    assert.equal(await page.locator(".home-quiz-card:visible").count(), 4, `${width}px collapsed quiz count`);
    await page.getByRole("button", { name: "Lihat Semua Materi" }).click();
    assert.equal(await page.locator(".home-material-card:visible").count(), allMaterialCount, `${width}px expanded material count`);
    assert.equal(await page.locator(".home-material-card a.play-link").count(), allMaterialCount, `${width}px every material link remains available`);
    await page.getByRole("button", { name: "Tampilkan Lebih Sedikit" }).last().click();
    assert.equal(await page.locator(".home-material-card:visible").count(), 4, `${width}px collapsed material count`);
    assert.equal(await page.locator(".essay-summary-card a").count(), 2, "one compact AI Essay card with detail navigation");
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scrollWidth <= dimensions.width + 1, `${width}px horizontal overflow: ${JSON.stringify(dimensions)}`);
  }

  const guestCta = page.locator(".essay-summary-card a[href^='/login']");
  assert.equal(await guestCta.innerText(), "Login untuk Mengakses →");
  assert.equal(await guestCta.getAttribute("href"), "/login?next=%2Fessay-challenges");
  const workflow = await page.goto(`${baseUrl}/how-it-works`, { waitUntil: "networkidle" });
  assert.equal(workflow?.status(), 200);
  assert.equal(await page.locator(".how-page .step").count(), 3);
  await page.getByRole("link", { name: "Jelajahi materi →" }).waitFor();
  await page.getByRole("link", { name: "Pilih challenge →" }).waitFor();
  const pricing = await page.goto(`${baseUrl}/pricing`, { waitUntil: "networkidle" });
  assert.equal(pricing?.status(), 200);
  await page.getByRole("heading", { name: "Promptly Pro" }).waitFor();
  const challenge = await page.goto(`${baseUrl}/challenges/fix-the-prompt`, { waitUntil: "networkidle" });
  assert.equal(challenge?.status(), 200);
  await page.getByRole("heading", { name: "Fix the Prompt", exact: true }).waitFor();
  const material = await page.goto(`${baseUrl}/learn/prompting`, { waitUntil: "networkidle" });
  assert.equal(material?.status(), 200);
  await page.getByRole("heading", { name: "Prompting", exact: true }).waitFor();
  console.log("PASS desktop and 360/375/390/430px quiz/material density, toggle, guest essay CTA, workflow route, and overflow checks");
} finally {
  await browser.close();
}
