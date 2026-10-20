import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.PROMPTLY_URL ?? "http://localhost:3000";
const executablePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const home = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  assert.equal(home?.status(), 200);
  assert.equal(await page.locator(".account-menu").count(), 0, "guest navbar does not show an account menu");
  await page.locator("nav .nav-login[href^='/login']").waitFor();
  await page.locator("nav .nav-login[href='/register']").waitFor();

  const registration = await page.goto(`${baseUrl}/register`, { waitUntil: "domcontentloaded" });
  assert.equal(registration?.status(), 200);
  const username = page.locator("#register-username");
  assert.equal(await username.getAttribute("required"), "");
  assert.equal(await username.getAttribute("minlength"), "3");
  assert.equal(await username.getAttribute("maxlength"), "24");
  assert.equal(await username.evaluate((input) => input.checkValidity()), false);
  await username.fill("has space");
  assert.equal(await username.evaluate((input) => input.checkValidity()), false);
  await username.fill("Fariz_N0407");
  assert.equal(await username.evaluate((input) => input.checkValidity()), true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator(".account-menu").count(), 0, "mobile guest navbar does not show an account menu");
  await page.locator(".navlinks a[href='/learn']").waitFor();
  console.log("PASS guest homepage and registration username form at desktop/mobile sizes");
} finally {
  await browser.close();
}
