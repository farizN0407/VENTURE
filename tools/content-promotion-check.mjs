import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "tools/promote-content.mjs"), "utf8");
assert.match(source, /Select at least one --modules or --challenges slug/);
assert.match(source, /\.eq\("content_domain", "ai_literacy"\)/);
assert.match(source, /if \(existing\) assertSame\([\s\S]*?else await checked\([\s\S]*?\.insert\(/);
assert.match(source, /if \(key\)[\s\S]*?throw new Error\([\s\S]*?else await checked\([\s\S]*?\.insert\(/);
assert.match(source, /flag: "wx"/);
assert.match(source, /configuredRef !== expectedRef/);
assert.doesNotMatch(source, /\.from\([^\n]*\)\.(?:delete|update|upsert)\(/, "promotion must not delete, update, or upsert production content");

const blocked = spawnSync(process.execPath, [path.join(root, "tools/promote-content.mjs"), "export", "--environment=development", "--project-ref=wrong-project-ref", "--modules=custom-example"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqr.supabase.co", SUPABASE_SECRET_KEY: "local-test-placeholder" },
});
assert.notEqual(blocked.status, 0);
assert.match(blocked.stderr, /does not match --project-ref/);
assert.doesNotMatch(blocked.stderr, /local-test-placeholder/);

console.log("PASS selected-domain export, insert-only conflict checks, secure output creation, and project-reference guard");
