#!/usr/bin/env node
/**
 * Check catalog/catalog.json with the same rules the launcher applies (src-tauri/src/catalog.rs),
 * plus what only the repository can check: icons exist, accents are colours.
 *   node scripts/validate-catalog.mjs            offline checks
 *   node scripts/validate-catalog.mjs --online   also fetch every available app's latest.json and
 *                                                SHA256SUMS.txt (docs/RELEASE_STANDARD.md)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv.find((a) => a.endsWith(".json")) ?? join(root, "catalog", "catalog.json");
const online = process.argv.includes("--online");
const errors = [];
const warnings = [];

const catalog = JSON.parse(readFileSync(file, "utf8"));
const STATUSES = ["available", "beta", "coming_soon", "slot"];
const ID = /^[a-z0-9][a-z0-9-]*$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

if (catalog.schema !== 1) errors.push(`schema must be 1 (is ${catalog.schema})`);
if (!Number.isInteger(catalog.revision) || catalog.revision < 1) errors.push("revision must be a positive integer (bump it on every change)");

const ids = new Set();
function checkCommon(kind, e) {
  const where = `${kind} '${e.id}'`;
  if (!ID.test(e.id ?? "")) errors.push(`${where}: id must be lower-case letters, digits and dashes`);
  if (ids.has(`${kind}:${e.id}`)) errors.push(`${where}: duplicate id`);
  ids.add(`${kind}:${e.id}`);
  if (!STATUSES.includes(e.status)) errors.push(`${where}: status must be one of ${STATUSES.join(", ")}`);
  if (e.status !== "slot" && !e.name) errors.push(`${where}: needs a name`);
  if (e.repo && !REPO.test(e.repo)) errors.push(`${where}: repo must be owner/name`);
  return where;
}

for (const app of catalog.apps ?? []) {
  const where = checkCommon("app", app);
  const installable = app.status === "available" || app.status === "beta";
  if (installable) {
    if (!app.install) errors.push(`${where}: installable apps need an install section`);
    if (!app.repo && !app.install?.manifest) errors.push(`${where}: installable apps need repo (or install.manifest)`);
    if (app.install && !app.install.pubkey) warnings.push(`${where}: no pubkey; installs then rely on SHA256SUMS.txt alone`);
  }
  if (app.install) {
    if (app.install.kind !== "nsis") errors.push(`${where}: install.kind must be "nsis"`);
    if (!app.install.uninstallKey || !app.install.exe) errors.push(`${where}: install needs uninstallKey and exe`);
  }
  if (app.accent && !/^#[0-9a-fA-F]{6}$/.test(app.accent)) errors.push(`${where}: accent must be #rrggbb`);
  if (app.icon && !/^https:\/\//.test(app.icon) && !existsSync(join(dirname(file), app.icon))) errors.push(`${where}: icon ${app.icon} does not exist`);
}

for (const addon of catalog.addons ?? []) {
  const where = checkCommon("addon", addon);
  if (addon.status === "available" || addon.status === "beta") {
    if (!addon.module) errors.push(`${where}: installable add-ons need module`);
    if (!addon.url && !(addon.repo && addon.asset)) errors.push(`${where}: installable add-ons need url, or repo + asset`);
  }
  if (addon.minBlender && !/^\d+\.\d+$/.test(addon.minBlender)) errors.push(`${where}: minBlender must look like 4.2`);
}

if (online) {
  for (const app of (catalog.apps ?? []).filter((a) => a.status === "available" || a.status === "beta")) {
    const url = app.install?.manifest ?? `https://github.com/${app.repo}/releases/latest/download/latest.json`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        errors.push(`app '${app.id}': ${url} → HTTP ${res.status}`);
        continue;
      }
      const manifest = await res.json();
      const asset = manifest.platforms?.["windows-x86_64"];
      if (!asset?.url || !asset?.signature) errors.push(`app '${app.id}': latest.json has no signed windows-x86_64 installer`);
      else {
        const sums = await fetch(asset.url.replace(/[^/]+$/, "SHA256SUMS.txt"));
        if (!sums.ok) warnings.push(`app '${app.id}': release v${manifest.version} has no SHA256SUMS.txt (required by the release standard)`);
        console.log(`  ${app.id}: v${manifest.version}`);
      }
    } catch (e) {
      errors.push(`app '${app.id}': ${url}: ${e.message}`);
    }
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
const apps = (catalog.apps ?? []).length;
console.log(errors.length ? `\n${errors.length} error(s) in ${file}` : `catalog ok: revision ${catalog.revision}, ${apps} app entries, ${(catalog.addons ?? []).length} add-on entries`);
process.exit(errors.length ? 1 : 0);
