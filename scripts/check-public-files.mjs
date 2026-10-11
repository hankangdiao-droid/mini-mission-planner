import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const ignored = new Set([
  "node_modules",
  ".git",
  "dist",
  ".local",
  "test-results",
  "playwright-report",
]);
const rules = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})/,
  /AKIA[0-9A-Z]{16}/,
  /(?:DB_PASSWORD|MYSQL_PASSWORD)\s*[:=]\s*[^\s$"']{3,}/,
  /(?:E|D):[\\/](?:A_supermap|科研|桌面)/i,
];
let count = 0,
  failed = false;
async function scan(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (ignored.has(ent.name)) continue;
    const file = path.join(dir, ent.name),
      rel = path.relative(root, file);
    if (ent.isSymbolicLink()) {
      console.error(`Disallowed symlink: ${rel}`);
      failed = true;
      continue;
    }
    if (ent.isDirectory()) {
      await scan(file);
      continue;
    }
    if (file === path.join(root, "scripts/check-public-files.mjs")) continue;
    const size = (await stat(file)).size;
    if (
      size > 5 * 1024 * 1024 ||
      /\.(?:sql|pt|onnx|ply|b3dm|exe|pfx|pem)$/i.test(ent.name)
    ) {
      console.error(`Private or oversized artifact: ${rel}`);
      failed = true;
      continue;
    }
    if (!/\.(?:ts|vue|css|html|json|geojson|md|yml|yaml|mjs|txt|bat)$/.test(ent.name))
      continue;
    const content = await readFile(file, "utf8");
    count++;
    if (rules.some((rule) => rule.test(content))) {
      console.error(`Potential secret or private path: ${rel}`);
      failed = true;
    }
  }
}
await scan(root);
console.log(
  `Reviewed ${count} public text files; ${failed ? "findings require review" : "no configured secret/path patterns found"}. This scanner is not a proof of absence.`,
);
if (failed) process.exitCode = 1;
