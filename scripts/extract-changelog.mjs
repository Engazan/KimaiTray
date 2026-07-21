import { readFile } from "node:fs/promises";

const version = process.argv[2]?.replace(/^v/, "");
if (!version) {
  throw new Error("Usage: node scripts/extract-changelog.mjs <version>");
}

const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const lines = changelog.split(/\r?\n/);
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const heading = new RegExp(`^## \\[?${escapedVersion}\\]?(?:\\s+-.*)?\\s*$`);
const start = lines.findIndex((line) => heading.test(line.trim()));

if (start < 0) {
  throw new Error(`Version ${version} was not found in CHANGELOG.md`);
}

const next = lines.findIndex(
  (line, index) => index > start && /^##\s+/.test(line.trim()),
);
const body = lines.slice(start + 1, next < 0 ? undefined : next).join("\n").trim();

if (!body) {
  throw new Error(`Version ${version} has no changelog content`);
}

process.stdout.write(`${body}\n`);
