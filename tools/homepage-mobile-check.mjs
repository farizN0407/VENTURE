import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.PROMPTLY_URL ?? "http://127.0.0.1:3000";
const executablePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  const allCount = await page.locator(".home-quiz-card").count();
  assert.ok(allCount > 4);
  assert.equal(await page.locator(".home-quiz-card:visible").count(), allCount);
  assert.equal(await page.locator(".home-quiz-toggle").isVisible(), false);
  assert.equal(await page.locator(".navlinks").getByRole("link", { name: "Cara kerja" }).count(), 1);
  const desktopOrder = await page.locator(".home-quiz-card").evaluateAll((cards) => cards.slice(0, 4).map((card) => card.querySelector("a.play-link")?.getAttribute("href")));

  for (const width of [360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".home-quiz-card:visible").count(), 4, `${width}px initial quiz count`);
    const mobileOrder = await page.locator(".home-quiz-card").evaluateAll((cards) => cards.slice(0, 4).map((card) => card.querySelector("a.play-link")?.getAttribute("href")));
    assert.deepEqual(mobileOrder, desktopOrder, `${width}px quiz order`);
    await page.getByRole("button", { name: "Lihat Semua Quiz" }).click();
    assert.equal(await page.locator(".home-quiz-card:visible").count(), allCount, `${width}px expanded quiz count`);
    await page.getByRole("button", { name: "Tampilkan Lebih Sedikit" }).click();
    assert.equal(await page.locator(".home-quiz-card:visible").count(), 4, `${width}px collapsed quiz count`);
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
  console.log("PASS desktop and 360/375/390/430px homepage density, toggle, guest essay CTA, workflow route, and overflow checks");
} finally {
  await browser.close();
}
