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
        return `from data:text/javascript;base64,${readFileSync(path).toString("base64")}`;
      })
      .replace(/import\s+["'](\.\.?\/[^"']+)["']/g, (mm, spec) => {
        const path = resolve(base, spec);
        if (!existsSync(path)) return mm;
        return `import data:text/javascript;base64,${readFileSync(path).toString("base64")}`;
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

// 1) landing: build the app fresh, then inline dist
console.log("building app…");
execSync("npm run build", { cwd: join(ROOT, "app"), stdio: "inherit" });
const distIndex = join(ROOT, "app", "dist", "index.html");
if (existsSync(distIndex)) {
  writeFileSync(join(SITE, "index.html"), bundle(distIndex));
  console.log(`site/index.html (${(statSync(join(SITE, "index.html")).size / 1024).toFixed(1)} KB)`);
}

// 2) artifact demos
const OA = join(ROOT, "open-artifacts");
let n = 0, oversized = 0;
for (const entry of readdirSync(OA)) {
  const demo = join(OA, entry, "demo", "index.html");
  if (!statSync(join(OA, entry)).isDirectory() || !existsSync(demo)) continue;
  const html = bundle(demo);
  writeFileSync(join(SITE, `${entry}.html`), html);
  if (html.length > 78_000) { oversized++; console.warn(`  ⚠ ${entry}: ${(html.length / 1024).toFixed(1)} KB — near the 80KB val file cap`); }
  n++;
}
console.log(`site: ${n} artifact pages${oversized ? ` (${oversized} oversized)` : ""}`);
