import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const packageVersion = readJson("package.json").version;
const versions = new Map([
  ["package.json", packageVersion],
  ["package-lock.json", readJson("package-lock.json").version],
  ["package-lock root", readJson("package-lock.json").packages[""].version],
  ["tauri.conf.json", readJson("src-tauri/tauri.conf.json").version],
]);

const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
versions.set("Cargo.toml", cargoVersion);

for (const envFile of [
  ".env.development",
  ".env.staging",
  ".env.production",
]) {
  const value = readFileSync(envFile, "utf8").match(
    /^VITE_APP_VERSION=(.+)$/m,
  )?.[1];
  versions.set(envFile, value);
}

const mismatches = [...versions].filter(([, version]) => version !== packageVersion);
if (mismatches.length > 0) {
  for (const [source, version] of mismatches) {
    console.error(`${source}: expected ${packageVersion}, found ${version ?? "missing"}`);
  }
  process.exit(1);
}

const changelog = readFileSync("CHANGELOG.md", "utf8");
if (!changelog.includes(`## [${packageVersion}]`)) {
  console.error(`CHANGELOG.md has no section for ${packageVersion}`);
  process.exit(1);
}

const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : "";
if (tag && !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  console.error(`Release tag ${tag} is not a supported semantic version`);
  process.exit(1);
}
if (tag && tag !== `v${packageVersion}`) {
  console.error(`Release tag ${tag} does not match v${packageVersion}`);
  process.exit(1);
}

console.log(`All version sources match ${packageVersion}.`);
