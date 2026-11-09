// adapter.test.js — DOCX/LEDES import adapter test for the outside-counsel-spend demo
// (Wave W3, FINISH round FA3). The page's OWN wiring is under test, not a copy: the
// [docx-import-wiring] and [ledes-import-wiring] blocks are extracted verbatim from
// ../demo/index.html and executed against a stub DOM — the shared module injected in place
// of the dynamic import, globalThis.fetch mocked for POST /api/extract (path a), and the
// REAL tested parseLedes from core/ledes.js injected as the paste-box engine (path b).
// Fixture DOCX built by docio's writeDocx; fictional invoice.
//
// Behavior pinned here (per-artifact note): path (a) invoice .docx → /api/extract (schema
// outside-counsel-spend) → editable ledger-JSON preview (rates/amounts copied, narratives
// verbatim) → Apply fills the ledger box; path (b) LEDES 1998B paste → deterministic
// parseLedes → entries preview with skipped-line errors surfaced → Apply fills the ledger
// box. "Rebuild audit" is never auto-clicked; malformed LEDES with zero entries applies
// nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { parseLedes } from "./ledes.js";
import { runSpendAudit } from "./core.js";
import EXAMPLE from "../demo/example.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional non-LEDES invoice (the DOCX under import).
const PARAS = [
  "HALE & PRIOR LLP — INVOICE NO. 2026-0912 (fictional)",
  "Matter: M-210 (Project Kite — FDA response). Firm: HPL. Period: September 2026.",
  "09/03/2026  A. Reyes (partner)  4.0 hrs @ $850  $3,400.00  Draft response to FDA 483 letter; call with regulatory team.",
  "09/04/2026  J. Osei (associate)  6.5 hrs @ $445  $2,892.50  Research predicate device classifications; memo.",
  "09/30/2026  —  Meals  $82.00  Working meals during FDA response.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema outside-counsel-spend) — rates/amounts copied
// from the invoice, narratives verbatim.
const EXTRACTED = {
  ledger: [
    { id: "L-1", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-03", timekeeper: "A. Reyes", level: "partner", type: "fee", billing: "hourly", hours: 4.0, rate: 850, amount: 3400, category: null, narrative: "Draft response to FDA 483 letter; call with regulatory team." },
    { id: "L-2", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-04", timekeeper: "J. Osei", level: "associate", type: "fee", billing: "hourly", hours: 6.5, rate: 445, amount: 2892.5, category: null, narrative: "Research predicate device classifications; memo." },
    { id: "L-3", matterId: "M-210", firmId: "HPL", period: "2026-09", date: "2026-09-30", timekeeper: null, level: null, type: "disbursement", billing: "flat", hours: null, rate: null, amount: 82, category: "meals", narrative: "Working meals during FDA response." },
  ],
};
const CONFIDENCE = { ledger: "high" };

// Real LEDES 1998B fixture — 3 parseable lines + 1 malformed-date line that must be skipped loudly.
const LEDES_FIXTURE = [
  "LEDES_FILE_TYPE[]|INVOICE_DATE[]|INVOICE_ID[]|CLIENT_ID[]|LAW_FIRM_MATTER_ID[]|LINE_ITEM_DATE[]|EXP/FEE/INV_ADJ_TYPE[]|LINE_ITEM_NUMBER_OF_UNITS[]|LINE_ITEM_UNIT_COST[]|LINE_ITEM_TOTAL[]|TIMEKEEPER_NAME[]|TIMEKEEPER_LEVEL[]|LINE_ITEM_DESCRIPTION[]",
  "LEDES1998B|20260930|INV-100|ACME|M-210|20260903|F|4.0|850|3400.00|A. Reyes|Partner|Draft response to FDA 483 letter",
  "LEDES1998B|20260930|INV-100|ACME|M-210|20260910|F|2.0|925|1850.00|A. Reyes|Partner|Client call and strategy",
  "LEDES1998B|20260930|INV-100|ACME|M-210|20260928|E|1||1840.25|||Regulatory printing and courier",
  "LEDES1998B|20260930|INV-100|ACME|M-999|20269999|F|1|100|100|X. Bad|Partner|Malformed date line",
].join("\n");

/* ---------- fixture: a real .docx via docio's writer ---------- */
const docxFile = (name) => {
  const b = writeDocx(PARAS);
  return { name, size: b.length, arrayBuffer: async () => new Uint8Array(b).slice().buffer };
};

/* ---------- minimal DOM stub (wireDocxImport stub pattern from _shared/docx-import.test.js) ---------- */
class StubElement {
  constructor() { this._html = ""; this._kids = {}; this.handlers = {}; this.files = null; this.disabled = false; this.value = ""; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._kids = {}; }
  querySelector(sel) {
    if (sel.startsWith(".")) { // faithful: a class selector resolves only when the rendered HTML carries it
      const cls = sel.slice(1);
      if (!new RegExp('class="[^"]*\\b' + cls + '\\b[^"]*"').test(this._html)) return null;
    }
    if (!this._kids[sel]) this._kids[sel] = new StubElement();
    return this._kids[sel];
  }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  fire(type) { for (const f of this.handlers[type] ?? []) f(); }
  insertAdjacentHTML(_pos, html) { this._html += String(html); }
}
const settle = () => new Promise((r) => setTimeout(r, 15));

function stubDom() {
  const mount = new StubElement();
  const els = { docxImportMount: mount };
  for (const id of ["ledgerIn", "ledgerBtn", "ledgerMsg", "ledesIn", "ledesBtn", "ledesOut"]) els[id] = new StubElement();
  return { mount, els, document: { getElementById: (id) => els[id] ?? null } };
}

/* ---------- fetch mocking ---------- */
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function mockFetch(fn) { const prev = globalThis.fetch; globalThis.fetch = fn; return () => { globalThis.fetch = prev; }; }
const okFetch = (calls) => mockFetch(async (url, opts) => { calls.push({ url, opts }); return jsonRes(200, { ok: true, data: EXTRACTED, confidence: CONFIDENCE, source: "gpt-5-nano" }); });

/* ---------- extract + execute the page's actual wiring blocks ---------- */
const blocks = {};
for (const name of ["docx-import-wiring", "ledger-rebuild-wiring", "ledes-import-wiring"]) {
  const START = `/* ---- [${name}] ---- */`;
  const END = `/* ---- [/${name}] ---- */`;
  const i = HTML.indexOf(START);
  const j = HTML.indexOf(END);
  assert.ok(i >= 0 && j > i, `demo/index.html must carry the [${name}] block`);
  blocks[name] = HTML.slice(i, j + END.length);
}

async function runWiring(document, shared) {
  const wiring = blocks["docx-import-wiring"];
  assert.equal(wiring.split(`import("${SPECIFIER}")`).length - 1, 1, "exactly one dynamic import, with the D1-pinned specifier");
  const injectable = wiring.replace(`import("${SPECIFIER}")`, "Promise.resolve(__SHARED__)");
  new Function("document", "__SHARED__", injectable)(document, shared);
  await settle();
}

async function runWiringImportFails(document) {
  const injectable = blocks["docx-import-wiring"].replace(`import("${SPECIFIER}")`, 'Promise.reject(new Error("module unavailable (file:// or offline)"))');
  new Function("document", injectable)(document);
  await settle();
}

async function importAndPreview(shared) {
  const dom = stubDom();
  await runWiring(dom.document, shared);
  const input = dom.mount.querySelector(".docx-file-input");
  input.files = [docxFile("invoice.docx")];
  input.fire("change");
  await settle();
  return dom;
}

// The LEDES paste-box wiring: the real tested parser injected as its one engine dependency.
function runLedesWiring(document) {
  new Function("document", "parseLedes", blocks["ledes-import-wiring"])(document, parseLedes);
}

// The rebuild handler's one free variable: setLedger(ledger) re-audits and returns the summary.
function runRebuildWiring(document, setLedger) {
  new Function("document", "setLedger", blocks["ledger-rebuild-wiring"])(document, setLedger);
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic import, input section with mount + ledger box + LEDES paste-box, parseLedes statically imported", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}").catch(() => import("/open-artifacts/_shared/docx-import.js"));`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('import { parseLedes } from "../core/ledes.js";'), "the tested LEDES parser is wired into the page (static import, inlined by build)");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  const section = HTML.indexOf("Import ledger");
  assert.ok(section > 0, "the new input section is present");
  assert.ok(HTML.indexOf('id="docxImportMount"') > section, "mount sits inside the input section");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="ledgerIn"'), "DOCX control sits above the ledger textarea");
  assert.ok(HTML.indexOf('id="ledgerIn"') < HTML.indexOf('id="ledgerBtn"'), "Rebuild button follows the ledger textarea");
  assert.ok(HTML.indexOf('id="ledesIn"') > 0 && HTML.indexOf('id="ledesBtn"') > 0 && HTML.indexOf('id="ledesOut"') > 0, "LEDES paste-box affordances present");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('schema: "outside-counsel-spend"'), "extraction calls POST /api/extract with the artifact schema key");
});

test("static: the DOCX wiring touches only the mount and the ledger box — Rebuild is never auto-clicked", () => {
  const ids = [...blocks["docx-import-wiring"].matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["docxImportMount", "ledgerIn"],
    "additive: fills the ledger box only; 'ledgerBtn' (the rebuild gate) is NOT referenced by the import wiring");
});

test("static: the LEDES wiring touches only the paste-box elements and the ledger box", () => {
  const ids = [...blocks["ledes-import-wiring"].matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["ledesOut", "ledesBtn", "ledesIn", "ledgerIn"], "deterministic paste-box: read ldesIn, render into ldesOut, fill ledgerIn");
});

test("readDocxText on the real fixture returns the invoice text the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring (a): invoice .docx → POST /api/extract → editable ledger-JSON preview, verbatim narratives, copied amounts; nothing applied before Apply", async () => {
  const calls = [];
  const restore = okFetch(calls);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.equal(calls.length, 1, "exactly one /api/extract call");
    assert.equal(calls[0].url, "/api/extract");
    const body = JSON.parse(calls[0].opts.body);
    assert.deepEqual(body, { schema: "outside-counsel-spend", text: EXPECTED_TEXT });
    assert.match(dom.mount.innerHTML, /docx-import-preview/, "preview panel shown");
    assert.match(dom.mount.innerHTML, /xchip[^>]*>ledger: high/, "confidence chip");
    assert.match(dom.mount.innerHTML, /Draft response to FDA 483 letter; call with regulatory team\./, "verbatim narrative in the preview");
    assert.match(dom.mount.innerHTML, /2892\.5/, "line amount copied from the invoice, never invented");
    assert.ok(dom.mount.querySelector(".xled"), "ledger JSON is an editable textarea");
    assert.equal(dom.els["ledgerIn"].value, "", "ledger box untouched before the explicit Apply");
  } finally { restore(); }
});

test("wiring (a): explicit Apply fills the ledger box (user edits win); Rebuild stays manual", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    const edited = JSON.stringify(EXTRACTED.ledger.slice(0, 2), null, 2);
    dom.mount.querySelector(".xled").value = edited; // the user deleted a line in the preview
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(dom.els["ledgerIn"].value, edited, "user-EDITED ledger JSON wins over the raw proposal");
    assert.equal(dom.els["ledgerBtn"].handlers.click, undefined, "the Rebuild audit button was never clicked by the wiring");
  } finally { restore(); }
});

test("gate (a): the applied ledger feeds the tested runSpendAudit — 3 entries, $82 meals flagged over the $75 cap", () => {
  const a = runSpendAudit({ ...EXAMPLE, ledger: EXTRACTED.ledger });
  assert.equal(a.summary.entries, 3);
  assert.equal(a.summary.rateExceptions, 0, "850/445 match the HPL card — nothing invented");
  const meals = a.guidelineFindings.find((g) => g.flag === "disallowed_expense");
  assert.ok(meals && meals.entryIds.includes("L-3"), "the disallowed meals line is flagged by pure code");
});

test("wiring (b): LEDES paste → deterministic parseLedes → entries + surfaced skipped line; Apply fills the ledger box byte-faithfully", () => {
  const dom = stubDom();
  runLedesWiring(dom.document);
  dom.els["ledesIn"].value = LEDES_FIXTURE;
  dom.els["ledesBtn"].fire("click");
  assert.match(dom.els["ledesOut"].innerHTML, /3 entries parsed deterministically/, "entry count from the real parser");
  assert.match(dom.els["ledesOut"].innerHTML, /1 malformed line/, "the skipped line is surfaced, never silently dropped");
  assert.match(dom.els["ledesOut"].innerHTML, /bad_date/, "structured error kind shown");
  const expected = parseLedes(LEDES_FIXTURE); // the same tested parser, run directly
  assert.equal(expected.ledger.length, 3);
  assert.equal(expected.errors.length, 1);
  assert.equal(dom.els["ledgerIn"].value, "", "ledger box untouched before the explicit Apply");
  // the browser carries the serialized ledger in the textarea; the user left it unedited
  dom.els["ledesOut"].querySelector(".xledes").value = JSON.stringify(expected.ledger, null, 2);
  dom.els["ledesOut"].querySelector(".ledes-apply-btn").fire("click");
  assert.deepEqual(JSON.parse(dom.els["ledgerIn"].value), expected.ledger, "applied JSON equals parseLedes output exactly");
  assert.equal(dom.els["ledgerBtn"].handlers.click, undefined, "Rebuild audit stays manual");
});

test("gate (b): the LEDES-parsed ledger feeds the tested runSpendAudit unchanged", () => {
  const { ledger } = parseLedes(LEDES_FIXTURE);
  const a = runSpendAudit({ ...EXAMPLE, ledger });
  assert.equal(a.summary.entries, 3, "audit runs on the deterministic parse output");
});

test("wiring (b): unparseable LEDES → fail-closed: no entries, no Apply, ledger box untouched", () => {
  const dom = stubDom();
  runLedesWiring(dom.document);
  dom.els["ledesIn"].value = "not|a|ledes|file";
  dom.els["ledesBtn"].fire("click");
  assert.match(dom.els["ledesOut"].innerHTML, /No parseable line items/, "fail-closed message");
  assert.match(dom.els["ledesOut"].innerHTML, /missing_columns/, "structured parser error surfaced");
  assert.equal(dom.els["ledesOut"].querySelector(".ledes-apply-btn"), null, "no Apply control in the failure state");
  assert.equal(dom.els["ledgerIn"].value, "", "target never fed garbage");
});

test("rebuild wiring: valid ledger JSON in the box → setLedger re-audits; the message names the entry count", () => {
  const calls = [];
  const dom = stubDom();
  runRebuildWiring(dom.document, (ledger) => { calls.push(ledger); return runSpendAudit({ ...EXAMPLE, ledger }); });
  dom.els["ledgerIn"].value = JSON.stringify(EXTRACTED.ledger);
  dom.els["ledgerBtn"].fire("click");
  assert.equal(calls.length, 1, "setLedger called exactly once");
  assert.match(dom.els["ledgerMsg"].textContent, /3 entries/, "result surfaced to the user");
});

test("rebuild wiring: invalid JSON → fail-closed message, no re-audit, prior audit intact", () => {
  const calls = [];
  const dom = stubDom();
  runRebuildWiring(dom.document, (ledger) => { calls.push(ledger); return runSpendAudit({ ...EXAMPLE, ledger }); });
  dom.els["ledgerIn"].value = "{not json";
  dom.els["ledgerBtn"].fire("click");
  assert.equal(calls.length, 0, "setLedger never called on invalid input");
  assert.match(dom.els["ledgerMsg"].textContent, /Not applied/, "honest error surfaced");
});

test("wiring (a): ok:false from /api/extract → fail-closed banner + raw text preserved; ledger box only filled on explicit Apply", async () => {
  const restore = mockFetch(async () => jsonRes(502, { ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable" }));
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw invoice text offered in a fallback textarea");
    assert.match(dom.mount.innerHTML, /INVOICE NO\. 2026-0912/, "text preserved, never lost");
    assert.equal(dom.els["ledgerIn"].value, "", "existing inputs untouched without Apply");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(dom.els["ledgerIn"].value, EXPECTED_TEXT, "Apply in fallback mode still lands the invoice text in the ledger box");
    assert.match(dom.mount.querySelector(".docx-import-preview").innerHTML, /or paste LEDES below/, "fallback note points at the deterministic path");
  } finally { restore(); }
});

test("wiring (a): fetch throws → same fail-closed fallback", async () => {
  const restore = mockFetch(async () => { throw new Error("network down"); });
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw invoice text offered");
    assert.equal(dom.els["ledgerIn"].value, "", "untouched before Apply");
  } finally { restore(); }
});

test("wiring (a): failed shared-module import renders the hosted-site hint, page intact", async () => {
  const dom = stubDom();
  dom.els["ledgerIn"].value = "user's pasted ledger JSON";
  await runWiringImportFails(dom.document);
  assert.match(dom.mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(dom.els["ledgerIn"].value, "user's pasted ledger JSON", "existing input value untouched");
});

test("wiring (a): junk (non-docx) file → inline error, Apply unreachable, ledger box untouched", async () => {
  const dom = stubDom();
  await runWiring(dom.document, await import("../../_shared/docx-import.js"));
  const input = dom.mount.querySelector(".docx-file-input");
  input.files = [{ name: "invoice.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  input.fire("change");
  await settle();
  assert.match(dom.mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(dom.els["ledgerIn"].value, "", "target never fed garbage");
  assert.equal(dom.mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
});
