import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRecoveryRedirectUrl, isPasswordRecoveryCallback, PASSWORD_RECOVERY_PATH, validateNewPassword } from "../lib/auth-recovery.ts";

const productionRedirect = new URL(createRecoveryRedirectUrl("https://venture-peach.vercel.app"));
assert.equal(productionRedirect.origin, "https://venture-peach.vercel.app");
assert.equal(productionRedirect.pathname, "/auth/callback");
assert.equal(productionRedirect.searchParams.get("next"), PASSWORD_RECOVERY_PATH);
assert.equal(productionRedirect.searchParams.get("flow"), "recovery");
assert.equal(new URL(createRecoveryRedirectUrl("http://localhost:3000")).origin, "http://localhost:3000");
assert.throws(() => createRecoveryRedirectUrl("http://venture-peach.vercel.app"), /HTTPS/);
assert.equal(isPasswordRecoveryCallback("recovery", "/reset-password"), true);
assert.equal(isPasswordRecoveryCallback("recovery", "/admin"), false);
assert.equal(isPasswordRecoveryCallback("signup", "/reset-password"), false);

assert.equal(validateNewPassword("12345678", "12345678"), null);
assert.match(validateNewPassword("short", "short"), /8–72/);
assert.match(validateNewPassword("12345678", "87654321"), /tidak sama/);
assert.match(validateNewPassword("x".repeat(73), "x".repeat(73)), /8–72/);

const callback = await readFile(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
assert.match(callback, /exchangeCodeForSession\(code\)/);
assert.match(callback, /httpOnly:\s*true/);
assert.match(callback, /maxAge:\s*15\s*\*\s*60/);
assert.match(callback, /if \(recoveryFlow\)/);
const recoveryAction = await readFile(new URL("../app/forgot-password/actions.ts", import.meta.url), "utf8");
assert.match(recoveryAction, /resetPasswordForEmail\(email, \{ redirectTo \}\)/);
const updateAction = await readFile(new URL("../app/reset-password/actions.ts", import.meta.url), "utf8");
assert.match(updateAction, /auth\.getUser\(\)/);
assert.match(updateAction, /auth\.updateUser\(\{ password \}\)/);
assert.match(updateAction, /promptly-password-recovery/);

console.log("Recovery redirect validation, password checks, PKCE callback guard, and Supabase auth calls passed.");
