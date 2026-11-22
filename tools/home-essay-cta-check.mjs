import assert from "node:assert/strict";
import { getHomeEssayCta } from "../lib/home-essay-cta.ts";

assert.deepEqual(getHomeEssayCta("guest"), { label: "Login untuk Mengakses", href: "/login?next=%2Fessay-challenges" });
assert.deepEqual(getHomeEssayCta("free"), { label: "Upgrade ke Promptly Pro", href: "/pricing" });
assert.deepEqual(getHomeEssayCta("pro"), { label: "Mulai AI Essay Challenge", href: "/essay-challenges" });
assert.deepEqual(getHomeEssayCta("admin"), { label: "Mulai AI Essay Challenge", href: "/essay-challenges" });
assert.deepEqual(getHomeEssayCta("unavailable"), { label: "Lihat AI Essay Challenge", href: "/essay-challenges" });
console.log("PASS status-aware AI Essay homepage CTAs");
