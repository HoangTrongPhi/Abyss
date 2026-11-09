#!/usr/bin/env node
/*
 * Builds an app's user guide PDFs from its in-app Help content (`src/help/topics.ts`), so the
 * PDF and the F1 panel never drift apart. One PDF per language:
 *
 *   docs/user-guide/<Name>_User_Guide_vi.pdf
 *   docs/user-guide/<Name>_User_Guide_en.pdf
 *
 * The app bundles those as Tauri resources and opens them from the Help panel / command palette.
 * Usage, from the app folder (Node 22.18+ for TypeScript type stripping; Edge or Chrome prints):
 *
 *   node ../Abyss/scripts/user-guide.mjs            # name, version, tagline from package.json / tauri.conf.json
 *   node ../Abyss/scripts/user-guide.mjs --html     # also keep the intermediate .html next to the PDFs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const appDir = resolve(process.cwd());
const keepHtml = process.argv.includes("--html");

const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
const conf = JSON.parse(readFileSync(join(appDir, "src-tauri", "tauri.conf.json"), "utf8"));
const name = conf.productName ?? pkg.name;
const version = conf.version ?? pkg.version;
// "Coral — Sprite atlas & 2D animation toolkit" → "Sprite atlas & 2D animation toolkit"
const tagline = (pkg.description ?? "").replace(/^[^—]*—\s*/, "").replace(/\s*\(.*\)\s*$/, "");

const { HELP_TOPICS: topics } = await import(pathToFileURL(join(appDir, "src", "help", "topics.ts")).href);
if (!Array.isArray(topics) || topics.length === 0) throw new Error("src/help/topics.ts exports no HELP_TOPICS");
// Cover blurb: the first paragraph of "Getting started" ("What is <app>?"), else its summary.
const intro = topics[0].sections.flatMap((s) => s.blocks).find((b) => b.kind === "p")?.text ?? topics[0].summary;

const UI = {
  vi: { kind: "Tài liệu hướng dẫn sử dụng", contents: "Mục lục", version: "Phiên bản", date: "Ngày tạo", f1: "Nội dung này giống hệt phần Hướng dẫn trong ứng dụng (phím F1)." },
  en: { kind: "User guide", contents: "Contents", version: "Version", date: "Generated", f1: "The same content as the in-app Help (press F1)." },
};

// ---------------------------------------------------------------- HTML

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The Help panel's inline format: `**bold**` and `` `code` ``. */
const inline = (text) =>
  text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part) => {
      if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return `<b>${esc(part.slice(2, -2))}</b>`;
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return `<code>${esc(part.slice(1, -1))}</code>`;
      return esc(part);
    })
    .join("");

const keysHtml = (keys) =>
  keys
    .split(/(\s\/\s|\s…\s)/)
    .map((part, i) => (i % 2 ? `<span class="sep">${esc(part.trim())}</span>` : part.split("+").map((k) => `<kbd>${esc(k)}</kbd>`).join("")))
    .join("");

function block(b, lang) {
  switch (b.kind) {
    case "p":
      return `<p>${inline(b.text[lang])}</p>`;
    case "steps":
      return `<ol class="steps">${b.items.map((it) => `<li>${inline(it[lang])}</li>`).join("")}</ol>`;
    case "tips":
      return `<ul class="tips">${b.items.map((it) => `<li>${inline(it[lang])}</li>`).join("")}</ul>`;
    case "keys":
      return `<table class="keys">${b.items.map((it) => `<tr><td>${keysHtml(it.keys)}</td><td>${inline(it.label[lang])}</td></tr>`).join("")}</table>`;
    default:
      throw new Error(`Unknown help block kind: ${b.kind}`);
  }
}

function page(lang) {
  const t = UI[lang];
  const today = new Date().toISOString().slice(0, 10);
  const toc = topics
    .map((x, i) => `<li><span class="n">${i + 1}</span><span class="tt"><b>${esc(x.title[lang])}</b><span>${inline(x.summary[lang])}</span></span></li>`)
    .join("");
  const body = topics
    .map(
      (x, i) => `
<section class="topic">
  <header class="th"><span class="num">${i + 1}</span><h2>${esc(x.title[lang])}</h2></header>
  <p class="lead">${inline(x.summary[lang])}</p>
  ${x.sections.map((s) => `<h3>${esc(s.heading[lang])}</h3>${s.blocks.map((b) => block(b, lang)).join("\n")}`).join("\n")}
</section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(name)} — ${esc(t.kind)}</title>
<style>
  @page { size: A4; margin: 17mm 16mm 17mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1a1d24; font-size: 10.5pt; line-height: 1.55; margin: 0; background: #fff; }
  b { font-weight: 600; }
  code, kbd { font-family: "Cascadia Mono", Consolas, monospace; font-size: 8.8pt; background: #f2f4f7; border: 1px solid #e3e7ee; border-radius: 3px; padding: 0 3px; }
  kbd { border-bottom-width: 2px; margin-right: 2px; white-space: nowrap; }
  .sep { color: #7a8292; margin: 0 4px; font-size: 9pt; }
  p { margin: 4pt 0 6pt; }

  .cover { height: 258mm; display: flex; flex-direction: column; justify-content: space-between; padding: 32mm 4mm 4mm; page-break-after: always; }
  .badge { display: inline-block; font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; color: #2563eb; border: 1px solid #2563eb; padding: 2pt 9pt; border-radius: 20pt; }
  .cover h1 { font-size: 46pt; margin: 14pt 0 2pt; letter-spacing: -.01em; }
  .cover .sub { font-size: 16pt; color: #5b6372; margin: 0; }
  .bar { height: 5px; width: 70mm; background: linear-gradient(90deg, #2563eb, #10b981); border-radius: 3px; margin: 18pt 0; }
  .meta { color: #5b6372; font-size: 10pt; }
  .meta b { color: #1a1d24; }

  .toc { page-break-after: always; }
  .toc h2 { font-size: 18pt; margin: 0 0 8pt; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li { display: flex; gap: 10pt; padding: 6pt 0; border-bottom: 1px dotted #dfe3ea; page-break-inside: avoid; }
  .toc .n { width: 18pt; color: #2563eb; font-weight: 700; flex-shrink: 0; }
  .toc .tt { display: flex; flex-direction: column; }
  .toc .tt span { color: #5b6372; font-size: 9.5pt; }

  .topic { page-break-before: always; }
  .topic:first-of-type { page-break-before: auto; }
  .th { display: flex; align-items: baseline; gap: 10pt; border-bottom: 2px solid #1a1d24; padding-bottom: 4pt; margin-bottom: 6pt; }
  .th .num { font-size: 22pt; font-weight: 700; color: #2563eb; }
  .th h2 { font-size: 18pt; margin: 0; }
  .lead { font-size: 11pt; color: #5b6372; margin-bottom: 4pt; }
  h3 { font-size: 12pt; color: #2563eb; margin: 14pt 0 4pt; page-break-after: avoid; }

  ol.steps { list-style: none; counter-reset: s; padding: 0; margin: 4pt 0 8pt; }
  ol.steps li { counter-increment: s; position: relative; padding-left: 22pt; margin: 4pt 0; page-break-inside: avoid; }
  ol.steps li::before { content: counter(s); position: absolute; left: 0; top: 1pt; width: 15pt; height: 15pt; border-radius: 50%; background: #e8effd; color: #2563eb; font-size: 8.5pt; font-weight: 700; text-align: center; line-height: 15pt; }
  ul.tips { list-style: none; margin: 6pt 0 8pt; padding: 6pt 10pt; background: #f6f8fb; border-left: 3px solid #2563eb; border-radius: 4px; }
  ul.tips li { position: relative; padding-left: 12pt; margin: 3pt 0; font-size: 10pt; page-break-inside: avoid; }
  ul.tips li::before { content: ""; position: absolute; left: 1pt; top: 7pt; width: 5px; height: 5px; border-radius: 50%; background: #2563eb; opacity: .7; }
  table.keys { width: 100%; border-collapse: collapse; margin: 6pt 0 8pt; font-size: 10pt; }
  table.keys td { padding: 4pt 6pt; border-bottom: 1px solid #e6e9ef; vertical-align: top; page-break-inside: avoid; }
  table.keys td:first-child { width: 38%; }
  table.keys tr:nth-child(even) td { background: #fafbfc; }
</style>
</head>
<body>
<div class="cover">
  <div>
    <span class="badge">${esc(t.kind)}</span>
    <h1>${esc(name)}</h1>
    <p class="sub">${esc(tagline)}</p>
    <div class="bar"></div>
    <p style="max-width:140mm">${inline(intro[lang])}</p>
  </div>
  <div class="meta">
    <p><b>${t.version}:</b> ${esc(version)} &nbsp;·&nbsp; <b>${t.date}:</b> ${today}</p>
    <p>${t.f1}</p>
  </div>
</div>
<div class="toc"><h2>${t.contents}</h2><ol>${toc}</ol></div>
${body}
</body>
</html>`;
}

// ---------------------------------------------------------------- PDF

function findBrowser() {
  const candidates = [
    process.env.GUIDE_BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const hit = candidates.find((p) => p && existsSync(p));
  if (!hit) throw new Error("No Edge / Chrome found to print the PDF; set GUIDE_BROWSER to its executable");
  return hit;
}

const outDir = join(appDir, "docs", "user-guide");
mkdirSync(outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "abyss-guide-"));
const browser = findBrowser();
try {
  for (const lang of ["vi", "en"]) {
    const base = `${name}_User_Guide_${lang}`;
    const html = join(keepHtml ? outDir : work, `${base}.html`);
    const pdf = join(outDir, `${base}.pdf`);
    writeFileSync(html, page(lang), "utf8");
    execFileSync(browser, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--user-data-dir=${join(work, "profile")}`, `--print-to-pdf=${pdf}`, pathToFileURL(html).href], { stdio: "ignore" });
    if (!existsSync(pdf)) throw new Error(`The browser did not write ${pdf}`);
    console.log(`${base}.pdf  (${topics.length} topics)`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
