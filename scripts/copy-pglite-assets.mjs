import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const srcDir = join(process.cwd(), "node_modules/@electric-sql/pglite/dist");
const dests = [
  join(process.cwd(), ".vercel/output/functions/__server.func/_libs"),
  join(process.cwd(), ".output/server"),
];
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];

for (const dest of dests) {
  if (!existsSync(dirname(dest)) && !existsSync(dest)) continue;
  mkdirSync(dest, { recursive: true });
  for (const name of files) {
    const from = join(srcDir, name);
    if (!existsSync(from)) continue;
    copyFileSync(from, join(dest, name));
  }
}
