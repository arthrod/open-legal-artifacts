// trackb-eyeball.mjs — dump rendered text of the specific elements the Track B
// eyeball pass checks (one vocabulary, key renames visible, caveat once).
// Same CDP approach as deploy/check-display-labels.mjs; prints per page.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "vt-val", "site");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const QUERIES = {
  "cite-check": [
    ["counts", "#counts"], ["legend", "#legend"], ["coverage", "#coverage"],
    ["table-row-1", "#results tr:nth-child(2)"], ["queue-head", "#queue .caveat"],
    ["queue-card-1-notes", "#results tr:nth-child(2), #queue article:first-of-type .meta"],
  ],
  "tabular-review": [["counts", "#counts"], ["legend", "#legend"], ["reasons", "#reasons"]],
  "limitations-radar": [["out", "#out"]],
  "fact-chronology": [["counts", "#counts"], ["legend", "#legend"], ["timeline-first", "#timeline .row:first-child .when"], ["conflict", "#flags"]],
  "playbook-deviation-board": [["counts", "#counts"], ["legend", "#legend"], ["board-cols", "#board h3"]],
  "renewal-calendar": [["stats", "#stats"], ["legend", "#legend"], ["unresolved", "#unresolved"]],
  "matter-board": [["changelog-1", "#changelog li:first-child"], ["board-cols", "#board h3"]],
};

const profile = mkdtempSync(join(tmpdir(), "trackb-eye-"));
const port = 9777;
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGTERM"); } catch {} });

async function connect() {
  for (let i = 0; i < 50; i++) { try { return await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(200); } }
  throw new Error("chrome never came up");
}
const v = await connect();
const sock = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => { sock.onopen = r; });
let id = 0; const pending = new Map(); const errs = [];
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? {}); pending.delete(d.id); } else if (d.method === "Runtime.exceptionThrown") errs.push(String(d.params.exceptionDetails.exception?.description ?? "unknown").split("\n")[0]); };
const send = (method, params = {}, sessionId) => new Promise((res) => { const i = ++id; pending.set(i, res); const msg = { id: i, method, params }; if (sessionId) msg.sessionId = sessionId; sock.send(JSON.stringify(msg)); });

for (const [name, qs] of Object.entries(QUERIES)) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Page.navigate", { url: `file://${join(SITE, name + ".html")}` }, sessionId);
  await sleep(2000);
  console.log(`\n===== ${name} =====`);
  for (const [label, sel] of qs) {
    const r2 = await send("Runtime.evaluate", {
      expression: `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.innerText.replace(/\\n+/g, " | ").slice(0, 400) : "(absent)"; })()`,
      returnByValue: true,
    }, sessionId);
    const { result, exceptionDetails } = r2;
    console.log(`[${label}] ${exceptionDetails ? "(eval error: " + String(exceptionDetails.exception?.description ?? "").slice(0, 120) + ")" : result?.value ?? "(no value)"}`);
  }
  console.log(`[js-exceptions] ${errs.length ? errs.join(" ;; ") : "none"}`);
  errs.length = 0;
  await send("Target.closeTarget", { targetId });
}
sock.close(); chrome.kill();
