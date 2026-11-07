#!/usr/bin/env node
// Build the self-contained site pages for the Val Town deploy val.
//   node deploy/build-site.mjs
// Outputs:
//   vt-val/site/index.html      <- app/dist (landing catalog), fully inlined
//   vt-val/site/<artifact>.html <- open-artifacts/<a>/demo/index.html, inlined

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "vt-val", "site");
mkdirSync(SITE, { recursive: true });

const MIME = { css: "text/css", js: "text/javascript", mjs: "text/javascript", woff2: "font/woff2", woff: "font/woff" };

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

function inlineModuleImports(html, base) {
  return html.replace(/<script type="module">([\s\S]*?)<\/script>/g, (m, code) => {
    const inlined = code
      .replace(/from\s+["'](\.\.?\/[^"']+)["']/g, (mm, spec) => {
        const path = resolve(base, spec);
        if (!existsSync(path)) return mm;
        return `from "data:text/javascript;base64,${readFileSync(path).toString("base64")}"`;
      })
      .replace(/import\s+["'](\.\.?\/[^"']+)["']/g, (mm, spec) => {
        const path = resolve(base, spec);
        if (!existsSync(path)) return mm;
        return `import "data:text/javascript;base64,${readFileSync(path).toString("base64")}"`;
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

// Bundle-time chrome for artifact pages: site back-link + disclaimer footer.
function decorate(html) {
  if (!html.includes("ola-backlink")) {
    const bar = `<a href="/" style="position:sticky;top:0;z-index:99;display:block;background:#0a0a0a;color:#fafaf8;font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:8px 20px;text-decoration:none;border-bottom:1px solid #e8e8e5;">\u2190 Open Legal Artifacts</a>`;
    html = html.replace(/<body([^>]*)>/i, (m) => m + bar);
  }
  if (!html.includes("<footer") && !/not legal advice/i.test(html)) {
    const foot = `<footer style="max-width:1100px;margin:32px auto 0;padding:16px 20px;border-top:1px solid #e8e8e5;color:#6b6b6b;font-size:12px;line-height:1.5;">Rules-as-data defaults are illustrative examples, not verified law. Not legal advice. <a href="https://github.com/arthrod/open-legal-artifacts" style="color:inherit;">MIT \u00b7 open-legal-artifacts</a></footer>`;
    html = html.replace(/<\/body>/i, foot + "</body>");
  }
  // Normalize artifact-page H1s to one scale (inspector R3-03) and auto-run
  // prefilled demos so no page opens on a "Press Run" placeholder (R3-01).
  const polish = `<style>h1{font-family:var(--font-body,'Manrope',system-ui,sans-serif)!important;font-size:26px!important;font-weight:700!important;letter-spacing:.01em!important;}</style>\n<script>window.addEventListener("load",function(){try{var out=document.querySelector('[id*="out"],[id*="result"]');var filled=out&&out.innerText.trim().length>40;if(filled)return;var b=[].slice.call(document.querySelectorAll("button")).find(function(x){return /run|build|compute|check|screen|recompute|generate|track|analyz/i.test(x.textContent)});if(b)b.click()}catch(e){}});</script>`;
  return html.replace(/<\/body>/i, polish + "</body>");
}

// 1) landing: build the app fresh, then inline dist
console.log("building app…");
execSync("npm run build", { cwd: join(ROOT, "app"), stdio: "inherit" });
const distIndex = join(ROOT, "app", "dist", "index.html");
if (existsSync(distIndex)) {
  writeFileSync(join(SITE, "index.html"), bundle(distIndex));
  console.log(`site/index.html (${(statSync(join(SITE, "index.html")).size / 1024).toFixed(1)} KB)`);
}

// 2) artifact demos — open reimplementations AND originals with demos
const demoRoots = [join(ROOT, "open-artifacts"), join(ROOT, "artifacts")];
let n = 0, oversized = 0;
const seen = new Set();
for (const OA of demoRoots) {
  if (!existsSync(OA)) continue;
  for (const entry of readdirSync(OA)) {
    const demo = join(OA, entry, "demo", "index.html");
    if (!statSync(join(OA, entry)).isDirectory() || !existsSync(demo) || seen.has(entry)) continue;
    seen.add(entry);
    let html = decorate(bundle(demo));
    if (html.length > 78_000) {
      oversized++;
      // over the VT 80KB/file cap: drop the ~30KB base64 Departure Mono woff2;
      // --font-mono falls back to JetBrains Mono / ui-monospace
      html = html.replace(/@font-face\s*\{[^}]*Departure Mono[^}]*\}/g, "");
      console.warn(`  ⚠ ${entry}: ${(html.length / 1024).toFixed(1)} KB → font stripped (${(html.length / 1024).toFixed(1)} KB)`);
    }
    writeFileSync(join(SITE, `${entry}.html`), html);
    n++;
  }
}
console.log(`site: ${n} artifact pages${oversized ? ` (${oversized} oversized)` : ""}`);
