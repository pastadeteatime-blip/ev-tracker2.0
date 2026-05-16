import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "www");

const files = [
  "index.html",
  "privacy.html",
  "support.html",
  "style.css",
  "machines.js",
  "affiliate-links.js",
  "app.js",
  "manifest.webmanifest",
  "service-worker.js"
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of files) {
  await cp(join(root, file), join(outDir, file));
}

await cp(join(root, "assets"), join(outDir, "assets"), { recursive: true });

console.log(`Built web assets into ${outDir}`);
