#!/usr/bin/env node
/**
 * Make a new suite app from templates/tauri-app and give it a free slot in the catalog.
 *
 *   npm run new-app -- "Nereid" --tagline "Texture library" --category "Texturing" --spec docs/app-specs/01_CORAL.md
 *
 * Options:
 *   --tagline <text>     one line under the name (default: "A Phineas app")
 *   --category <text>    catalog category (default: "Tools")
 *   --spec <file>        copy this spec to <app>/docs/SPEC.md (placeholders in it are left alone)
 *   --accent <#rrggbb>   brand colour (default: picked from the name)
 *   --repo <owner/name>  GitHub repository for releases (default: HoangTrongPhi/<Name>)
 *   --out <dir>          where to create it (default: next to the Abyss folder)
 *   --port <n>           Vite dev port (default: derived from the id, 1440-1538)
 *   --key-dir <dir>      where the updater signing key goes (default: ~/.tauri)
 *   --no-catalog         do not touch catalog/catalog.json
 *   --catalog-file <f>   use another catalog.json (trying the script out)
 *   --no-install         skip npm install
 *
 * What it does: copies the template with the names filled in (file names too), writes docs/SPEC.md and
 * docs/PROGRESS.md, creates the updater signing key
 * (~/.tauri/<id>.key, kept if it exists), renders the icons, puts the app into the first free slot
 * of the catalog as "coming_soon" (revision bumped) and runs npm install.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const template = join(root, "templates", "tauri-app");

// ------------------------------------------------------------------ arguments
const args = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--no-catalog" || a === "--no-install") opts[a.slice(5)] = true;
  else if (a.startsWith("--")) opts[a.slice(2)] = args[++i];
  else positional.push(a);
}
const name = positional[0];
function fail(msg) {
  console.error(`create-app: ${msg}`);
  process.exit(1);
}
if (!name) fail('usage: npm run new-app -- "App Name" [--tagline "..."] [--category "..."] (see scripts/create-app.mjs)');
if (!/^[A-Za-z][A-Za-z0-9 ]{1,40}$/.test(name)) fail("the name may use letters, digits and spaces only (it becomes the product and installer name)");
const tagline = opts.tagline ?? "A Phineas app";
const category = opts.category ?? "Tools";
for (const [k, v] of Object.entries({ tagline, category })) if (/["\\{}<>`$]/.test(v)) fail(`--${k} must not contain " \\ { } < > \` or $`);

const id = name.toLowerCase().trim().replace(/\s+/g, "-");
const crate = id.replace(/-/g, "_");
const compact = name.replace(/\s+/g, "");
const hash = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const PALETTE = ["#10b981", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];
const accent = opts.accent ?? PALETTE[hash % PALETTE.length];
if (!/^#[0-9a-fA-F]{6}$/.test(accent)) fail("--accent must be #rrggbb");
const port = Number(opts.port ?? 1440 + (hash % 50) * 2);
const repo = opts.repo ?? `HoangTrongPhi/${compact}`;
const out = resolve(opts.out ?? join(root, "..", compact));
if (existsSync(out) && readdirSync(out).length) fail(`${out} already exists and is not empty`);
const spec = opts.spec ? resolve(root, opts.spec) : null;
if (spec && !existsSync(spec)) fail(`--spec ${opts.spec} not found`);

/** Path from the new app to a file in Abyss, as package.json wants it (forward slashes). */
function fromApp(target) {
  const rel = relative(out, target);
  return (isAbsolute(rel) ? target : rel).replace(/\\/g, "/"); // another drive: absolute
}

function run(cmd, cmdArgs, cwd) {
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.join(" ")} failed`);
}

// ------------------------------------------------------------------ signing key
const keyDir = resolve(opts["key-dir"] ?? join(homedir(), ".tauri"));
const keyPath = join(keyDir, `${id}.key`);
if (!existsSync(keyPath)) {
  mkdirSync(keyDir, { recursive: true });
  console.log(`Creating the updater signing key ${keyPath}`);
  run("npx", ["tauri", "signer", "generate", "-w", `"${keyPath}"`, "--ci"], root);
} else {
  console.log(`Using the existing signing key ${keyPath}`);
}
const pubkey = readFileSync(`${keyPath}.pub`, "utf8").trim();

// ------------------------------------------------------------------ copy the template
const values = {
  __APP_NAME__: name,
  __APP_ID__: id,
  __APP_CRATE__: crate,
  __IDENTIFIER__: `com.phineas.${crate.replace(/_/g, "")}`,
  __TAGLINE__: tagline,
  __ACCENT__: accent,
  __PORT__: String(port),
  __REPO__: repo,
  __PUBKEY__: pubkey,
  __UI_DEP__: `file:${fromApp(join(root, "packages", "abyss-ui"))}`,
  __RELEASE_SCRIPT__: fromApp(join(root, "scripts", "release.ps1")),
  __BUNDLE_CATEGORY__: "Utility",
  __YEAR__: String(new Date().getFullYear()),
};
const fill = (text) => text.replace(/__[A-Z_]+?__/g, (m) => values[m] ?? m);

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    // npm drops files named .gitignore from packages, so the template keeps it as "gitignore".
    // File names carry placeholders too (src/types/__APP_ID__.ts).
    const dest = join(to, entry.name === "gitignore" ? ".gitignore" : fill(entry.name));
    if (entry.isDirectory()) copyDir(src, dest);
    else writeFileSync(dest, fill(readFileSync(src, "utf8")));
  }
}
copyDir(template, out);

// ------------------------------------------------------------------ docs: spec and progress
mkdirSync(join(out, "docs"), { recursive: true });
if (spec) copyFileSync(spec, join(out, "docs", "SPEC.md"));
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(out, "docs", "PROGRESS.md"),
  `# ${name} — Progress

## Status
- Current phase: P0 — Scaffold (done by create-app)
- Last session: ${today} — app created from templates/tauri-app${spec ? ` with ${relative(root, spec).replace(/\\/g, "/")}` : ""}
- \`npm run check\`: not run yet

## Phases
- [ ] P0 Scaffold — replace the Folder Stats sample module with the app's modules${spec ? " (see docs/SPEC.md)" : ""}

## Decisions (answers to the spec's open questions)
- (none yet)

## Known issues / next steps
- (none yet)
`,
);

// SPEC.md is a verbatim copy: placeholders in it are the spec's business.
const leftover = readdirSync(out, { recursive: true })
  .filter((f) => /\.(json|ts|tsx|rs|toml|html|css|md|yml|svg|mjs)$/.test(f) && !/docs[\\/]SPEC\.md$/.test(f))
  .map((f) => [f, readFileSync(join(out, f), "utf8").match(/__[A-Z][A-Z_]+__/) ?? (/__[A-Z][A-Z_]+__/.test(f) ? [f] : null)])
  .find(([, m]) => m);
if (leftover) fail(`template placeholder ${leftover[1][0]} was not filled (${leftover[0]})`);
console.log(`Created ${out}`);

// ------------------------------------------------------------------ icons
run("npx", ["tauri", "icon", `"${join(out, "public", "app-icon.svg")}"`, "-o", `"${join(out, "src-tauri", "icons")}"`], root);
for (const mobile of ["android", "ios"]) rmSync(join(out, "src-tauri", "icons", mobile), { recursive: true, force: true });

// ------------------------------------------------------------------ catalog slot
if (!opts.catalog) {
  const catalogPath = resolve(opts["catalog-file"] ?? join(root, "catalog", "catalog.json"));
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (catalog.apps.some((a) => a.id === id)) fail(`'${id}' is already in the catalog`);
  const entry = {
    id,
    name,
    tagline,
    category,
    icon: `icons/${id}.svg`,
    accent,
    status: "coming_soon",
    repo,
    homepage: `https://github.com/${repo}`,
    install: { kind: "nsis", uninstallKey: name, exe: `${id}.exe`, pubkey },
  };
  const slot = catalog.apps.findIndex((a) => a.status === "slot");
  if (slot >= 0) catalog.apps[slot] = entry;
  else catalog.apps.push(entry);
  catalog.revision += 1;
  mkdirSync(join(dirname(catalogPath), "icons"), { recursive: true });
  copyFileSync(join(out, "public", "app-icon.svg"), join(dirname(catalogPath), "icons", `${id}.svg`));
  // Keep empty slots on one line each, as in the hand-written file.
  const text = JSON.stringify(catalog, null, 2).replace(/\{\s+"id": "([^"]+)",\s+"status": "slot"\s+\}/g, '{ "id": "$1", "status": "slot" }');
  writeFileSync(catalogPath, text + "\n");
  console.log(`Catalog: ${name} took ${slot >= 0 ? "a free slot" : "a new place"} as "coming_soon" (revision ${catalog.revision})`);
}

// ------------------------------------------------------------------ dependencies
if (!opts.install) run("npm", ["install", "--no-audit", "--no-fund"], out);

console.log(`
Next:
  cd "${out}"
  npm run check                             # typecheck + mock coverage + cargo test
  npm run dev                               # then open http://localhost:${port}/?mock
  npm run tauri dev                         # start building ${name}
  git init && gh repo create ${repo} --public --source . --push
  npm run release -- -Version 0.1.0 -Publish   # first release (back up ${keyPath}!)
Then set "status": "available" for '${id}' in Abyss catalog/catalog.json, bump revision, push.`);
