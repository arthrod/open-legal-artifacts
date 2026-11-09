// adapter.test.js — class-LA DOCX import adapter test for the subpoena-response demo (Wave W4).
// The page's OWN wiring is under test, not a copy: the [docx-import-wiring] block is
// extracted verbatim from ../demo/index.html and executed against a stub DOM with the
// real _shared/docx-import.js module injected in place of the dynamic import, and
// globalThis.fetch mocked for POST /api/extract. Red until demo/index.html carries the
// Import DOCX control. The fixture is a real archive built by docio's writeDocx.
// Fictional subpoena.
//
// Behavior pinned here (per-artifact note): subpoena DOCX → facts JSON (extract only
// stated, null-not-infer, never compute deadlines/objections). Apply merges STATED
// fields into the facts input; null (not stated) leaves the existing value; the
// deadline engine + objection selection stay downstream / manual.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional subpoena (the DOCX under import).
const PARAS = [
  "UNITED STATES DISTRICT COURT (fictional filing)",
  "Drummond v. Halvorsen Freight Co. — SUBPOENA TO PRODUCE DOCUMENTS",
  "YOU ARE HEREBY COMMANDED to produce the documents described below.",
  "Relevant Period: January 1, 2018 through November 1, 2026.",
  "Custodians: R. Okonkwo (VP Operations); T. Marsh (Dispatcher).",
  "Data types: email (Exchange Online); maintenance records (ShopFloor DB).",
  "CERTIFICATE OF SERVICE — Personally served this subpoena on November 2, 2026.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema subpoena-response).
const EXTRACTED = {
  subpoena: { served_date: "2026-11-02", service_method: "personal", caption: null },
  responsive_scope: {
    date_range: { start: "2018-01-01", end: "2026-11-01" },
    custodians: [{ name: "R. Okonkwo", role: "VP Operations" }, { name: "T. Marsh", role: null }],
    data_types: [{ type: "email", systems: ["Exchange Online"], notes: null }],
  },
  objections_selected: [],
};
const CONFIDENCE = { subpoena: "high", responsive_scope: "low", objections_selected: "low" };

// The demo's worked example (prefilled facts JSON) — what Apply merges into.
const PREFILLED = {
  matter: { name: "Drummond v. Halvorsen Freight Co. (fictional)", role: "non-party responding" },
  subpoena: { served_date: "2026-11-02", service_method: "mail", caption: "No. CV-2026-01142 (fictional)" },
  responsive_scope: { date_range: { start: "2016-01-01", end: "2026-11-01" }, custodians: [{ name: "R. Okonkwo", role: "VP Operations" }], data_types: [{ type: "email", systems: ["Exchange Online"] }] },
  objections_selected: ["overbroad_time", "undue_burden"],
};

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
  const input = new StubElement();
  input.value = JSON.stringify(PREFILLED, null, 2);
  const els = { docxImportMount: mount, input, run: new StubElement(), err: new StubElement() };
  return { mount, input, els, document: { getElementById: (id) => els[id] ?? null } };
}

/* ---------- fetch mocking ---------- */
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function mockFetch(fn) { const prev = globalThis.fetch; globalThis.fetch = fn; return () => { globalThis.fetch = prev; }; }
const okFetch = (calls) => mockFetch(async (url, opts) => { calls.push({ url, opts }); return jsonRes(200, { ok: true, data: EXTRACTED, confidence: CONFIDENCE, source: "gpt-5-nano" }); });

/* ---------- extract + execute the page's actual wiring block ---------- */
const START = "/* ---- [docx-import-wiring] ---- */";
const END = "/* ---- [/docx-import-wiring] ---- */";

function wiringBlock() {
  const i = HTML.indexOf(START);
  const j = HTML.indexOf(END);
  assert.ok(i >= 0 && j > i, "demo/index.html must carry the [docx-import-wiring] block (Import DOCX control)");
  return HTML.slice(i, j + END.length);
}

async function runWiring(document, shared) {
  const wiring = wiringBlock();
  assert.equal(wiring.split(`import("${SPECIFIER}")`).length - 1, 1, "exactly one dynamic import, with the D1-pinned specifier");
  const injectable = wiring.replace(`import("${SPECIFIER}")`, "Promise.resolve(__SHARED__)");
  new Function("document", "__SHARED__", injectable)(document, shared);
  await settle();
}

async function runWiringImportFails(document) {
  const injectable = wiringBlock().replace(`import("${SPECIFIER}")`, 'Promise.reject(new Error("module unavailable (file:// or offline)"))');
  new Function("document", injectable)(document);
  await settle();
}

async function importAndPreview(shared) {
  const dom = stubDom();
  await runWiring(dom.document, shared);
  const input = dom.mount.querySelector(".docx-file-input");
  input.files = [docxFile("subpoena.docx")];
  input.fire("change");
  await settle();
  return dom;
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic import, mount above the facts JSON, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="input"'), "control sits above the facts JSON textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('schema: "subpoena-response"'), "extraction calls POST /api/extract with the artifact schema key");
  assert.ok(HTML.includes('id="run"'), "existing Track response control untouched");
});

test("readDocxText on the real fixture returns the subpoena text the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: .docx → POST /api/extract → editable JSON preview with confidence chips; facts untouched before Apply", async () => {
  const calls = [];
  const restore = okFetch(calls);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.equal(calls.length, 1, "exactly one /api/extract call");
    assert.equal(calls[0].url, "/api/extract");
    assert.deepEqual(JSON.parse(calls[0].opts.body), { schema: "subpoena-response", text: EXPECTED_TEXT });
    assert.match(dom.mount.innerHTML, /docx-import-preview/, "preview panel shown");
    assert.match(dom.mount.innerHTML, /xchip[^>]*>subpoena: high/, "high-confidence chip");
    assert.match(dom.mount.innerHTML, /xchip[^>]*flag[^>]*>responsive_scope: low/, "low-confidence chip flagged for review");
    assert.match(dom.mount.innerHTML, /class="xdata"/, "editable JSON surface present");
    assert.match(dom.mount.innerHTML, /2026-11-02/, "extracted data visible in the preview");
    assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "facts JSON untouched before the explicit Apply");
  } finally { restore(); }
});

test("wiring: explicit Apply merges STATED fields; null (not stated) keeps the existing value; objections never touched", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    // the user edited the JSON in the preview before applying
    const edited = JSON.parse(JSON.stringify(EXTRACTED));
    edited.subpoena.service_method = "email";
    dom.mount.querySelector(".xdata").value = JSON.stringify(edited, null, 2);
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    const facts = JSON.parse(dom.input.value);
    assert.equal(facts.subpoena.served_date, "2026-11-02", "stated served_date applied");
    assert.equal(facts.subpoena.service_method, "email", "user-EDITED stated value wins");
    assert.equal(facts.subpoena.caption, "No. CV-2026-01142 (fictional)", "null (not stated) keeps the existing caption");
    assert.deepEqual(facts.responsive_scope.date_range, { start: "2018-01-01", end: "2026-11-01" }, "stated date_range replaces");
    assert.equal(facts.responsive_scope.custodians.length, 2, "stated custodians replace");
    assert.deepEqual(facts.objections_selected, ["overbroad_time", "undue_burden"], "objections_selected never touched — never suggested");
    assert.equal(facts.matter.name, PREFILLED.matter.name, "matter preserved");
  } finally { restore(); }
});

test("wiring: edited JSON that does not parse → error surfaced, facts untouched", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    dom.mount.querySelector(".xdata").value = "{ not json";
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.match(dom.mount.querySelector(".docx-import-preview").innerHTML, /does not parse/, "specific error surfaced in the preview");
    assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "facts JSON untouched");
  } finally { restore(); }
});

test("wiring: ok:false from /api/extract → fail-closed banner + raw text preserved; Apply → notice, facts untouched", async () => {
  const restore = mockFetch(async () => jsonRes(429, { ok: false, error: "RATE_LIMITED", message: "Too many requests" }));
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw document text offered in a fallback textarea");
    assert.match(dom.mount.innerHTML, /Personally served/, "text preserved, never lost");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "facts JSON still untouched in fallback mode");
    assert.match(dom.mount.querySelector(".docx-import-preview").innerHTML, /Nothing applied/, "honest notice on fallback Apply");
  } finally { restore(); }
});

test("wiring: fetch throws → same fail-closed fallback", async () => {
  const restore = mockFetch(async () => { throw new Error("network down"); });
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw document text offered");
    assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "untouched");
  } finally { restore(); }
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const dom = stubDom();
  await runWiringImportFails(dom.document);
  assert.match(dom.mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "existing input value untouched");
});

test("wiring: junk (non-docx) file → inline error, Apply unreachable, facts untouched", async () => {
  const dom = stubDom();
  await runWiring(dom.document, await import("../../_shared/docx-import.js"));
  const input = dom.mount.querySelector(".docx-file-input");
  input.files = [{ name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  input.fire("change");
  await settle();
  assert.match(dom.mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "facts never fed garbage");
  assert.equal(dom.mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
});
