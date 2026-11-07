#!/usr/bin/env node
// Deploy every Open Legal Artifacts demo (and the playground) to Val Town
// as static http vals. Requires VAL_TOWN_API_KEY in the environment.
//
// Usage:
//   export VAL_TOWN_API_KEY=...
//   node deploy/vt-deploy.mjs [--only <artifact> ...] [--dry]

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.val.town/v1";
const KEY = process.env.VAL_TOWN_API_KEY;

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args.slice(onlyIdx + 1).filter((a) => !a.startsWith("--")) : null;

if (!KEY && !dry) {
  console.error("error: VAL_TOWN_API_KEY is not set (https://www.val.town/settings/api)");
  console.error("       run with --dry to see what would be deployed without a key");
  process.exit(1);
}

// ---------- single-file inliner ----------

const MIME = {
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  woff2: "font/woff2",
  woff: "font/woff",
};

function inlineCss(html, base) {
  return html.replace(
    /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*\/?>(?:<\/link>)?/g,
    (m, href) => {
      if (/^(https?:)?\/\//.test(href)) return m; // keep CDN links
      const path = resolve(base, href.split("?")[0]);
      if (!existsSync(path)) return m;
      let css = readFileSync(path, "utf8");
      // inline url(...) assets (fonts) relative to the css file
      css = css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (mm, u) => {
        if (/^(https?:)?\/\//.test(u) || u.startsWith("data:")) return mm;
        const ap = resolve(dirname(path), u.split("?")[0]);
        if (!existsSync(ap)) return mm;
        const b64 = readFileSync(ap).toString("base64");
        return `url(data:${MIME[ap.split(".").pop()] ?? "application/octet-stream"};base64,${b64})`;
      });
      return `<style>\n${css}\n</style>`;
    },
  );
}

function inlineJs(html, base) {
  return html.replace(
    /<script([^>]*)src="([^"]+)"([^>]*)><\/script>/g,
    (m, pre, src, post) => {
      if (/^(https?:)?\/\//.test(src)) return m;
      const path = resolve(base, src.split("?")[0]);
      if (!existsSync(path)) return m;
      const code = readFileSync(path, "utf8");
      return `<script${pre}${post}>\n${code}\n</script>`;
    },
  );
}

function inlineModuleImports(html, base) {
  // inline ES-module imports of local files inside inline module scripts
  return html.replace(/<script type="module">([\s\S]*?)<\/script>/g, (m, code) => {
    const inlined = code.replace(
      /from\s+["'](\.\.?\/[^"']+)["']/g,
      (mm, spec) => {
        const path = resolve(base, spec);
        if (!existsSync(path)) return mm;
        return `from "data:text/javascript;base64,${readFileSync(path).toString("base64")}";`
      },
    ).replace(
      /import\s+["'](\.\.?\/[^"']+)["']/g,
      (mm, spec) => {
        const path = resolve(base, spec);
        if (!existsSync(path)) return mm;
        return `import "data:text/javascript;base64,${readFileSync(path).toString("base64")}";`
      },
    );
    return `<script type="module">${inlined}</script>`;
  });
}

function bundle(htmlPath) {
  let html = readFileSync(htmlPath, "utf8");
  const base = dirname(htmlPath);
  // resolve relative asset paths inside the html first (src/href), then inline
  html = inlineCss(html, base);
  html = inlineJs(html, base);
  html = inlineModuleImports(html, base);
  return html;
}

// ---------- Val Town API ----------

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return body;
}

async function whoAmI() {
  return api("/me");
}

async function upsertVal(name, code) {
  // find existing val by name
  const list = await api(`/vals?user=me&limit=100`);
  const items = Array.isArray(list) ? list : (list.vals ?? []);
  const existing = items.find((v) => v.name === name);
  const valCode =
    `const HTML = ${JSON.stringify(code)};\n` +
    `export default function () {\n` +
    `  return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });\n` +
    `}\n`;
  if (existing) {
    await api(`/vals/${existing.id}`, { method: "PATCH", body: JSON.stringify({ code: valCode }) });
    return { name, id: existing.id, updated: true };
  }
  const created = await api("/vals", { method: "POST", body: JSON.stringify({ name, code: valCode }) });
  return { name, id: created.id, updated: false };
}

// ---------- main ----------

const targets = [];

// 1) artifact demos
const OA = join(ROOT, "open-artifacts");
for (const entry of readdirSync(OA)) {
  const dir = join(OA, entry);
  const demo = join(dir, "demo", "index.html");
  if (!statSync(dir).isDirectory() || !existsSync(demo)) continue;
  targets.push({ name: `ola-${entry}`, html: demo });
}

// 2) playground app (vite dist, inlined)
const appDist = join(ROOT, "app", "dist", "index.html");
if (existsSync(appDist)) targets.push({ name: "open-legal-artifacts", html: appDist });

const selected = only ? targets.filter((t) => only.some((o) => t.name.endsWith(o))) : targets;

console.log(`deploy targets: ${selected.length}${dry ? " (dry run)" : ""}`);
for (const t of selected) {
  const html = bundle(t.html);
  const kb = (html.length / 1024).toFixed(1);
  const warn = html.length > 75_000 ? "  ⚠ >75KB — may exceed the 80KB val cap" : "";
  if (dry) {
    console.log(`[dry] ${t.name}  <- ${t.html}  (${kb} KB)${warn}`);
    continue;
  }
  try {
    const r = await upsertVal(t.name, html);
    console.log(`${r.updated ? "updated" : "created"}  ${t.name}  (${kb} KB)${warn}`);
  } catch (e) {
    console.error(`FAILED  ${t.name}: ${e.message}`);
  }
}

if (!dry) {
  try {
    const me = await whoAmI();
    console.log(`\naccount: ${me.handle ?? me.username ?? me.id}`);
  } catch (e) {
    console.error(`warning: could not verify account: ${e.message}`);
  }
}
