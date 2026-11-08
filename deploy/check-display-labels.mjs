#!/usr/bin/env node
// check-display-labels.mjs — Track B post-build guard.
//
// Verifies that no machine key reaches the VISIBLE text of the seven Track B
// demo pages. The demos render client-side, so a static HTML scan would see
// almost nothing: this guard loads each built page (vt-val/site/<name>.html)
// in headless Chrome over file://, waits for the worked example to render,
// and asserts the forbidden-id regex does not match the rendered text.
// <code> spans are exempt by design (legends and the machine-reasons gate
// keep ids for engineers, always inside <code>).
//
//   node deploy/check-display-labels.mjs             # guard the 7 pages
//   node deploy/check-display-labels.mjs --selftest  # feed a synthetic page
//                                                    # with a raw id in text
//                                                    # position; must FAIL
//
// Exit 0 = clean · Exit 1 = violation (or selftest did not fail as required).

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "vt-val", "site");
const PAGES = [
  "limitations-radar", "cite-check", "fact-chronology", "playbook-deviation-board",
  "tabular-review", "renewal-calendar", "matter-board",
];

// Machine-shaped enum ids from the seven cores (Track B §3 inventory).
// Bare English words that legitimately appear in human copy (Verified,
// Fuzzy, Overdue, …) are deliberately NOT listed — the render layer now
// prints their labels, and the labels are the point.
const FORBIDDEN = [
  "filed_timely", "filed_late", "deadline_upcoming", "deadline_passed_unfiled", "data_needed",
  "personal_injury", "breach_of_contract_oral", "breach_of_contract_written", "property_damage",
  "discovery_precedes_injury", "not_found", "not_answered", "missing_quote",
  "quote_not_verified", "constraint_violation", "no_such_document", "no_such_question",
  "not_present", "outlier_value", "needs_review", "date_mismatch", "divergent_accounts",
  "deal_breaker", "unverifiedReason",
  // ("unparseable"/"unverifiable" are ordinary English words used in prose; the
  // pinpoint pills render their labels, so the ids themselves cannot appear.)
  "quarter-selection", "month-selection", "window-direction", "closed-with-deadline", "due-soon",
  "rules.defaultLeadTimeDays", "rules.byClauseType",
].join("|");
const RX = new RegExp(`(?:^|[^A-Za-z0-9])(?:${FORBIDDEN})(?:[^A-Za-z0-9]|$)`, "m");

/** Visible text of a rendered DOM, <code>/<script>/<style> removed. */
const VISIBLE_TEXT = `(() => {
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll("code,script,style,noscript,textarea,sr-only,[class*=sr-only]").forEach((e) => e.remove());
  clone.querySelectorAll("[data-key]").forEach((e) => e.removeAttribute("data-key"));
  return clone.textContent || "";
})()`;

/* ---------- selftest (no browser): the strip+regex logic must catch a leak ---------- */
if (process.argv.includes("--selftest")) {
  const dirty = `<p>Status: deadline_passed_unfiled — cannot compute</p><code>not_found</code>`;
  const text = dirty.replace(/<code>[\s\S]*?<\/code>/g, "").replace(/<[^>]+>/g, " ");
  if (!RX.test(text)) { console.error("selftest FAILED: a raw id in text position was NOT caught"); process.exit(1); }
  const clean = `<p>Past deadline — never filed</p><code>deadline_passed_unfiled</code>`;
  const cleanText = clean.replace(/<code>[\s\S]*?<\/code>/g, "").replace(/<[^>]+>/g, " ");
  if (RX.test(cleanText)) { console.error("selftest FAILED: <code> exemption broken"); process.exit(1); }
  console.log("selftest OK: raw id in text position caught; <code> span exempt");
  process.exit(0);
}

/* ---------- headless Chrome (CDP, no dependencies) ---------- */
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
];
const CHROME = CHROME_CANDIDATES.find(existsSync);
if (!CHROME) { console.error("no Chrome/Chromium binary found"); process.exit(1); }

const profile = mkdtempSync(join(tmpdir(), "trackb-guard-"));
const port = 9333 + (process.pid % 500);
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
  "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", // real UA
  "about:blank",
], { stdio: "ignore" });
const shutdown = () => { try { chrome.kill("SIGTERM"); } catch {} };
process.on("exit", shutdown); process.on("SIGINT", () => { shutdown(); process.exit(130); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ws(url) {
  const sock = new WebSocket(url);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = () => rej(new Error("ws connect failed")); });
  let id = 0; const pending = new Map(); const events = [];
  sock.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    else events.push(msg);
  };
  return {
    send(method, params = {}, sessionId) {
      const msg = { id: ++id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      sock.send(JSON.stringify(msg));
      return new Promise((res, rej) => pending.set(msg.id, { res, rej }));
    },
    waitEvent(name, sessionId, timeout = 15000) {
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error(`timeout waiting for ${name}`)), timeout);
        const poll = () => {
          const i = events.findIndex((e) => e.method === name && (!sessionId || e.sessionId === sessionId));
          if (i >= 0) { clearTimeout(t); res(events.splice(i, 1)[0]); } else setTimeout(poll, 50);
        };
        poll();
      });
    },
    close: () => sock.close(),
  };
}

const outDir = join(ROOT, "tmp", "shots", "trackB");
mkdirSync(outDir, { recursive: true });
let failures = 0;

try {
  // wait for the debugger endpoint
  let version;
  for (let i = 0; i < 50; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; }
    catch { await sleep(200); }
  }
  if (!version) throw new Error("Chrome debugger endpoint never came up");
  const bws = await ws(version.webSocketDebuggerUrl);

  for (const name of PAGES) {
    const file = join(SITE, `${name}.html`);
    if (!existsSync(file)) { console.error(`✖ ${name}: built page missing (${file})`); failures++; continue; }
    const { targetId } = await bws.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await bws.send("Target.attachToTarget", { targetId, flatten: true });
    await bws.send("Page.enable", {}, sessionId);
    await bws.send("Runtime.enable", {}, sessionId);
    await bws.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    const loaded = bws.waitEvent("Page.loadEventFired", sessionId);
    await bws.send("Page.navigate", { url: `file://${file}` }, sessionId);
    await loaded;
    await sleep(1500); // let the worked example render (auto-run / boot renders)
    const { result } = await bws.send("Runtime.evaluate", { expression: VISIBLE_TEXT, returnByValue: true }, sessionId);
    const text = String(result.value ?? "");

    // guard: forbidden ids in visible text
    const hit = RX.exec(text);
    // evidence screenshot (1280×900) for the eyeball pass
    const shot = await bws.send("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(shot.data, "base64"));

    if (hit) {
      failures++;
      const at = text.slice(Math.max(0, hit.index - 60), hit.index + 80).replace(/\s+/g, " ");
      console.error(`✖ ${name}: raw machine key "${hit[0].trim()}" visible — …${at}…`);
    } else {
      console.log(`✓ ${name}: no raw machine keys in visible text · shot tmp/shots/trackB/${name}.png`);
    }
    await bws.send("Target.closeTarget", { targetId });
  }
  bws.close();
} catch (e) {
  console.error("guard error:", e.message);
  failures++;
}

shutdown();
if (failures) { console.error(`\n${failures} violation(s) — exit 1`); process.exit(1); }
console.log("\nall 7 pages clean — exit 0");
