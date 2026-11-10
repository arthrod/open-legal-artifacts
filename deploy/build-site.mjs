#!/usr/bin/env node
// Build the self-contained site pages for the Val Town deploy val.
//   node deploy/build-site.mjs
// Outputs:
//   vt-val/site/index.html      <- app/dist (landing catalog), fully inlined
//   vt-val/site/<artifact>.html <- open-artifacts/<a>/demo/index.html, inlined

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "vt-val", "site");
const GITHUB = "https://github.com/arthrod/open-legal-artifacts";
mkdirSync(SITE, { recursive: true });

const MIME = { css: "text/css", js: "text/javascript", mjs: "text/javascript" }; // fonts NEVER data-URI'd: single-file pages would carry +32-64KB and blow the VT 80KB cap

function resolveRef(base, ref) {
  // root-relative refs ("/assets/x.js") resolve against the site root (base)
  return ref.startsWith("/") ? resolve(base, "." + ref) : resolve(base, ref);
}

function inlineCss(html, base) {
  return html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*\/?>(?:<\/link>)?/g, (m, href) => {
    if (/^(https?:)?\/\//.test(href)) return m;
    const path = resolveRef(base, href.split("?")[0]);
    if (!existsSync(path)) return m;
    let css = readFileSync(path, "utf8");
    css = css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (mm, u) => {
      if (/^(https?:)?\/\//.test(u) || u.startsWith("data:")) return mm;
      const ap = resolve(dirname(path), u.split("?")[0]);
      if (!existsSync(ap)) return mm;
      return `url(data:${MIME[ap.split(".").pop()] ?? "application/octet-stream"};base64,${readFileSync(ap).toString("base64")})`;
    });
    return `<style>\n${css}\n</style>`;
  });
}

function inlineJs(html, base) {
  return html.replace(/<script([^>]*)src="([^"]+)"([^>]*)><\/script>/g, (m, pre, src, post) => {
    if (/^(https?:)?\/\//.test(src)) return m;
    const path = resolveRef(base, src.split("?")[0]);
    if (!existsSync(path)) return m;
    return `<script${pre}${post}>\n${readFileSync(path, "utf8")}\n</script>`;
  });
}

// Minify module source BEFORE base64 inlining — base64 blobs are opaque to the
// whole-page minify pass, so unminified comments/indentation would ride into
// every page at 4/3x. Same recipe as the page-level pass (line comments only
// stripped when the line STARTS with //, so URLs in strings survive).
// PARSE GUARD (Code Review R-2): if the minified module fails node --check
// (e.g. a future module carries comment-like content inside a string/template),
// fall back to the UNMINIFIED source — worst case is a bigger page, never a
// silently corrupted module.
const _modCheckDir = mkdtempSync(join(tmpdir(), "ola-modcheck-"));
function moduleParses(code) {
  const p = join(_modCheckDir, "m.js");
  writeFileSync(p, code);
  try {
    execSync(`${process.execPath} --check ${p}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
function minifyModuleSource(code) {
  const min = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1")
    .replace(/\n\s*\n/g, "\n")
    .replace(/(\n)\s+/g, "$1");
  return moduleParses(min) ? min : code;
}

function inlineModuleImports(html, base) {
  return html.replace(/<script type="module">([\s\S]*?)<\/script>/g, (m, code) => {
    const inlined = code
      .replace(/from\s+["'](\.\.?\/[^"']+)["']/g, (mm, spec) => {
        const path = resolve(base, spec);
        if (!existsSync(path)) return mm;
        return `from "data:text/javascript;base64,${Buffer.from(minifyModuleSource(readFileSync(path, "utf8"))).toString("base64")}"`;
      })
      .replace(/import\s+["'](\.\.?\/[^"']+)["']/g, (mm, spec) => {
        const path = resolve(base, spec);
        if (!existsSync(path)) return mm;
        return `import "data:text/javascript;base64,${Buffer.from(minifyModuleSource(readFileSync(path, "utf8"))).toString("base64")}"`;
      });
    return `<script type="module">${inlined}</script>`;
  });
}

function bundle(htmlPath) {
  let html = readFileSync(htmlPath, "utf8");
  const base = dirname(htmlPath);
  html = inlineCss(html, base);
  html = inlineJs(html, base);
  html = inlineModuleImports(html, base);
  return html;
}

// Bundle-time chrome for artifact pages: navbar + disclaimer footer.
function decorate(html, info) {
  const { repoUrl } = info;
  if (!html.includes("ola-backlink") && !html.includes("ola-navbar")) {
    const M = `font-family:ui-monospace,'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;`;
    const L = `color:#6b6b6b;text-decoration:none;`;
    const bar = `<div class="ola-navbar" style="position:sticky;top:0;z-index:99;background:#0a0a0a;border-bottom:1px solid #e8e8e5;"><div style="max-width:1100px;margin:0 auto;padding:8px var(--pad-x-desktop, 40px);display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:space-between;align-items:center;${M}font-size:11px;">` +
      `<a href="/" style="color:#fafaf8;text-decoration:none;font-size:12px;">open\u00b7legal\u00b7artifacts</a>` +
      `<span style="display:inline-flex;gap:16px;white-space:nowrap;">` +
      `<a href="/" style="${L}">Catalog</a>` +
      `<span aria-current="page" style="color:#fafaf8;border-bottom:2px solid #ffd400;padding-bottom:2px;">Demo</span>` +
      `<a href="${repoUrl}" rel="noopener" target="_blank" style="${L}">Repo \u2197</a>` +
      `</span></div></div>`;
    html = html.replace(/<body([^>]*)>/i, (m) => m + bar);
  }
  if (!html.includes("<footer") && !/not legal advice/i.test(html)) {
    const foot = `<footer style="max-width:1100px;margin:32px auto 0;padding:16px 20px;border-top:1px solid #e8e8e5;color:#6b6b6b;font-size:12px;line-height:1.5;">Rules-as-data defaults are illustrative examples, not verified law. Not legal advice. <a href="https://github.com/arthrod/open-legal-artifacts" style="color:inherit;">MIT \u00b7 open-legal-artifacts</a></footer>`;
    html = html.replace(/<\/body>/i, foot + "</body>");
  }
  // Normalize artifact-page H1s to one scale (inspector R3-03) and auto-run
  // prefilled demos so no page opens on a "Press Run" placeholder (R3-01).
  // Auto-run only makes sense for run→output pages; flow apps that already
  // render their worked example on boot (client-intake) are skipped.
  const noAutoRun = /id="(f-narrative|personas)"/.test(html);
  const polish = `<script>window.addEventListener("load",function(){try{${noAutoRun ? "/* flow app: renders on boot, no auto-run */" : "var out=document.querySelector('[id*=\"out\"],[id*=\"result\"]');if(!out||out.innerText.trim().length>40)return;var b=[].slice.call(document.querySelectorAll(\"button\")).filter(function(x){return x.offsetParent!==null}).find(function(x){var t=x.textContent;return /run|build|compute|check|screen|recompute|generate|track|analyz/i.test(t)&&!/continue|next|submit|back|restart|again|over|confirm/i.test(t)});if(b)b.click()"}}catch(e){}});</script>`;
  return html.replace(/<\/body>/i, polish + "</body>");
}

// 1) landing: build the app fresh, then inline dist
console.log("building app…");
execSync("npm run build", { cwd: join(ROOT, "app"), stdio: "inherit" });
const distIndex = join(ROOT, "app", "dist", "index.html");
if (existsSync(distIndex)) {
  // SINGLE-FILE POLICY: the VT val cannot serve binary woff2 — the landing's
  // @font-face url()s 404 there. Strip them; the landing uses the same
  // system-font fallback as the 33 demo pages (no external font requests —
  // the no-phone-home standard). GH Pages mirror serves the app's own
  // self-hosted fonts.
  let landing = bundle(distIndex);
  landing = landing.replace(/@font-face\{font-family:Libre Franklin;[^}]*\}/g, "");
  landing = landing.replace(/@font-face\{font-family:Roboto Mono;[^}]*\}/g, "");
  writeFileSync(join(SITE, "index.html"), landing);
  console.log(`site/index.html (${(statSync(join(SITE, "index.html")).size / 1024).toFixed(1)} KB)`);
}

// 2) artifact demos — open reimplementations AND originals with demos
const demoRoots = [join(ROOT, "open-artifacts"), join(ROOT, "artifacts")];
let n = 0, oversized = 0;
const seen = new Set();
for (const OA of demoRoots) {
  if (!existsSync(OA)) continue;
  const root = basename(OA); // "open-artifacts" | "artifacts"
  for (const entry of readdirSync(OA)) {
    const demo = join(OA, entry, "demo", "index.html");
    if (!statSync(join(OA, entry)).isDirectory() || !existsSync(demo) || seen.has(entry)) continue;
    seen.add(entry);
    let html = decorate(bundle(demo), { entry, repoUrl: `${GITHUB}/tree/main/${root}/${entry}` });
    // Single-file deploy: system-font fallback only. Strip ALL @font-face blocks
    // (Libre Franklin + Roboto Mono) — var stacks fall back to system-ui/ui-monospace.
    const pre = html.length;
    html = html.replace(/@font-face\s*\{[^}]*\}/g, "");
    if (pre !== html.length || html.length > 78_000) {
      oversized++;
      console.warn(`  ⚠ ${entry}: ${(pre / 1024).toFixed(1)} KB → font stripped (${(html.length / 1024).toFixed(1)} KB)`);
    }
    if (html.length > 79_500) {
      // still near/over the VT 80KB cap after font strip: minify inline script/css
      html = html.replace(/\/\*[\s\S]*?\*\//g, "");            // block comments
      html = html.replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");          // line comments
      html = html.replace(/\n\s+\n/g, "\n");                        // blank/indent lines
      html = html.replace(/(\n)\s+/g, "$1  ");                       // leading indentation
      console.warn(`  ⚙ ${entry}: minified to ${(html.length / 1024).toFixed(1)} KB`);
    }
    writeFileSync(join(SITE, `${entry}.html`), html);
    n++;
  }
}
console.log(`site: ${n} artifact pages${oversized ? ` (${oversized} oversized)` : ""}`);

// 3) shared browser modules — served same-origin at /open-artifacts/_shared/*
// (demo pages load them via dynamic import; keeps pages under the VT 80KB cap).
const SHARED_DIR = join(ROOT, "open-artifacts", "_shared");
const SITE_SHARED = join(SITE, "open-artifacts", "_shared");
if (existsSync(SHARED_DIR)) {
  mkdirSync(SITE_SHARED, { recursive: true });
  for (const f of readdirSync(SHARED_DIR)) {
    if (!f.endsWith(".js") || f.endsWith(".test.js")) continue; // runtime modules only; tests stay repo-side
    copyFileSync(join(SHARED_DIR, f), join(SITE_SHARED, f));
    console.log(`shared: open-artifacts/_shared/${f} (${(statSync(join(SITE_SHARED, f)).size / 1024).toFixed(1)} KB)`);
  }
}
