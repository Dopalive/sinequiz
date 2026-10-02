// Copies packages/shared/src/*.ts (excluding tests) into supabase/functions/_shared/shared/
// so Edge Function bundles are self-contained. Run with --check to fail if out of sync.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const src = new URL("../packages/shared/src/", import.meta.url).pathname;
const dst = new URL("../supabase/functions/_shared/shared/", import.meta.url).pathname;
const check = process.argv.includes("--check");

const files = readdirSync(src).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
let dirty = false;
if (!check) { rmSync(dst, { recursive: true, force: true }); mkdirSync(dst, { recursive: true }); }
for (const f of files) {
  const content = readFileSync(join(src, f), "utf8");
  const target = join(dst, f);
  if (check) {
    if (!existsSync(target) || readFileSync(target, "utf8") !== content) { console.error(`out of sync: ${f}`); dirty = true; }
  } else {
    writeFileSync(target, content);
  }
}
if (check) {
  const extra = existsSync(dst) ? readdirSync(dst).filter((f) => !files.includes(f)) : [];
  for (const f of extra) { console.error(`stale: ${f}`); dirty = true; }
  if (dirty) process.exit(1);
  console.log("shared in sync");
} else {
  console.log(`synced ${files.length} files`);
}
