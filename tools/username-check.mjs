import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isValidUsername, normalizeUsername, usernameLabel } from "../lib/username.ts";

assert.equal(normalizeUsername("  Fariz_N  "), "fariz_n");
assert.equal(isValidUsername("abc"), true);
assert.equal(isValidUsername("a1_"), true);
assert.equal(isValidUsername("ab"), false);
assert.equal(isValidUsername("1".repeat(25)), false);
assert.equal(isValidUsername("has space"), false);
assert.equal(isValidUsername("with-dash"), false);
assert.equal(usernameLabel(null, "fariz@example.com"), "fariz");
assert.equal(usernameLabel("UPPER_1", "fariz@example.com"), "upper_1");

const [migration, action, authForm, menu] = await Promise.all([
  readFile(new URL("../supabase/migrations/20261021_usernames.sql", import.meta.url), "utf8"),
  readFile(new URL("../app/auth/actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/components/AuthForm.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/components/AccountMenu.tsx", import.meta.url), "utf8"),
]);
assert.match(migration, /create unique index if not exists profiles_username_lower_uidx\s+on public\.profiles \(lower\(username\)\)/i);
assert.match(migration, /auth\.uid\(\) = id[\s\S]*with check \(auth\.uid\(\) = id\)/i);
assert.match(migration, /grant update \(display_name, username\) on public\.profiles to authenticated/i);
assert.match(migration, /insert into public\.profiles \(id, role, username\)[\s\S]*values \(new\.id, 'user', v_username\)/i);
assert.match(migration, /pg_trigger[\s\S]*on_auth_user_created_promptly[\s\S]*execute function public\.handle_new_promptly_user\(\)/i);
assert.match(migration, /v_trigger_function is distinct from[\s\S]*drop trigger on_auth_user_created_promptly[\s\S]*create trigger on_auth_user_created_promptly/i);
assert.match(migration, /using \(auth\.uid\(\) = id\)/i);
assert.match(migration, /admin_profile_count\(\)[\s\S]*public\.is_promptly_admin\(\)/i);
assert.match(action, /options: \{ data: \{ username \}/);
assert.match(action, /from\("profiles"\)\.update\(\{ username \}\)\.eq\("id", user\.id\)/);
assert.match(authForm, /name="username"[\s\S]*required[\s\S]*minLength=\{3\}[\s\S]*maxLength=\{24\}/);
assert.match(menu, /Hi, \{label\}!/);
assert.match(menu, /Akun Saya/);
assert.match(menu, /action=\{signOut\}/);
console.log("Username rules and auth/database source contracts passed.");
