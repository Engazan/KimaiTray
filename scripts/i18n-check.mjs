import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = resolve(__dirname, "../src/shared/i18n/locales");

const languages = ["en", "sk", "cs", "de", "uk"];

function flatten(obj, prefix = "") {
  const entries = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      entries.push(...flatten(value, fullKey));
    } else {
      entries.push([fullKey, value]);
    }
  }
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

function placeholders(value) {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)]
    .map((match) => match[1])
    .sort();
}

const translations = {};
for (const lang of languages) {
  const data = JSON.parse(readFileSync(resolve(localesDir, `${lang}.json`), "utf-8"));
  translations[lang] = new Map(flatten(data));
}

const reference = "en";
const referenceTranslations = translations[reference];
const refKeys = new Set(referenceTranslations.keys());
let hasError = false;

for (const lang of languages) {
  if (lang === reference) continue;
  const langTranslations = translations[lang];
  const langKeys = new Set(langTranslations.keys());

  const missing = [...refKeys].filter((k) => !langKeys.has(k));
  const extra = [...langKeys].filter((k) => !refKeys.has(k));

  if (missing.length > 0) {
    console.error(`\n${lang}: missing ${missing.length} key(s):`);
    missing.forEach((k) => console.error(`  - ${k}`));
    hasError = true;
  }
  if (extra.length > 0) {
    console.error(`\n${lang}: ${extra.length} extra key(s) not in ${reference}:`);
    extra.forEach((k) => console.error(`  + ${k}`));
    hasError = true;
  }

  for (const key of [...refKeys].filter((item) => langKeys.has(item))) {
    const expected = placeholders(referenceTranslations.get(key));
    const actual = placeholders(langTranslations.get(key));
    if (expected.join("\0") !== actual.join("\0")) {
      console.error(
        `\n${lang}: placeholder mismatch for ${key}: expected [${expected.join(", ")}], got [${actual.join(", ")}]`,
      );
      hasError = true;
    }
  }
}

if (!hasError) {
  console.log("All translation files have matching keys.");
} else {
  process.exit(1);
}
