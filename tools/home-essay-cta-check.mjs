import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getHomeEssayCta } from "../lib/home-essay-cta.ts";
import { buildPromptlyProWhatsAppUrl, createPromptlyProWhatsAppMessage, PROMPTLY_PRO_WHATSAPP_NUMBER } from "../lib/promptly-pro-whatsapp.ts";

assert.deepEqual(getHomeEssayCta("guest"), { label: "Login untuk Mengakses", href: "/login?next=%2Fessay-challenges" });
const freeCta = getHomeEssayCta("free", "fariz@example.com");
assert.deepEqual(freeCta, { label: "Berlangganan via WhatsApp", href: buildPromptlyProWhatsAppUrl("fariz@example.com") });
assert.deepEqual(getHomeEssayCta("pro"), { label: "Mulai AI Essay Challenge", href: "/essay-challenges" });
assert.deepEqual(getHomeEssayCta("admin"), { label: "Mulai AI Essay Challenge", href: "/essay-challenges" });
assert.deepEqual(getHomeEssayCta("unavailable"), { label: "Lihat AI Essay Challenge", href: "/essay-challenges" });
const expectedMessage = "Halo Admin Promptly! 👋\n\nSaya ingin berlangganan Promptly Pro dengan harga Rp29.000 untuk 30 hari.\n\nEmail akun Promptly: [isi email terdaftar]\n\nMohon informasi metode dan instruksi pembayarannya. Terima kasih!";
assert.equal(createPromptlyProWhatsAppMessage(), expectedMessage, "guests get the editable email placeholder");
assert.equal(createPromptlyProWhatsAppMessage("fariz@example.com"), expectedMessage.replace("[isi email terdaftar]", "fariz@example.com"), "registered email is used in the message");
for (const [urlString, expectedEmail] of [[buildPromptlyProWhatsAppUrl(), "[isi email terdaftar]"], [buildPromptlyProWhatsAppUrl("fariz@example.com"), "fariz@example.com"]]) {
  const url = new URL(urlString);
  assert.equal(url.origin, "https://wa.me");
  assert.equal(url.pathname, `/${PROMPTLY_PRO_WHATSAPP_NUMBER}`);
  assert.match(url.search, /%/u, "message is URL-encoded");
  assert.equal(url.searchParams.get("text"), expectedMessage.replace("[isi email terdaftar]", expectedEmail));
  assert.doesNotMatch(url.searchParams.get("text") ?? "", /password|token|user.?id|secret/i);
}
const pricingPage = await readFile(new URL("../app/pricing/page.tsx", import.meta.url), "utf8");
assert.match(pricingPage, /supabase\.auth\.getUser\(\)/, "pricing page obtains the authenticated user server-side");
assert.match(pricingPage, /accountEmail = user\?\.email \?\? null/);
assert.doesNotMatch(pricingPage, /from\("subscriptions"\)\.(?:insert|upsert|update)/, "opening WhatsApp cannot activate a subscription");
console.log("PASS status-aware AI Essay homepage CTAs");
