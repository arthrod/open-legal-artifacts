// adapter.test.js — class-LA DOCX import adapter test for the discovery-response-log demo (Wave W4).
// The page's OWN wiring is under test, not a copy: the [docx-import-wiring] block is
// extracted verbatim from ../demo/index.html and executed against a stub DOM with the
// real _shared/docx-import.js module injected in place of the dynamic import, and
// globalThis.fetch mocked for POST /api/extract. Red until demo/index.html carries the
// Import DOCX control. The fixture is a real archive built by docio's writeDocx.
// Fictional requests set.
//
// Behavior pinned here (per-artifact note + reconC §4.3): requests DOCX →
// entries[{requestNo,type,requestText}] per the spec's DraftEntry model. Apply maps the
// entries onto the discovery-set input's requests[] (requestText → text) and preserves
// everything else; responses/objections/deadlines are NEVER drafted or computed here
// (the README's response-drafting prompt is a later phase).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { buildLog } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional requests document (the DOCX under import).
const PARAS = [
  "PLAINTIFF'S FIRST SET OF REQUESTS (fictional)",
  "REQUEST FOR PRODUCTION NO. 1: All documents concerning the design, testing, or manufacture of the VX-2 battery module.",
  "INTERROGATORY NO. 3: Identify every person with knowledge of the QC-14 test deviations.",
  "REQUEST FOR ADMISSION NO. 12: Admit that the QC-14 test log was altered after March 2025.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema discovery-response-log).
const EXTRACTED = {
  entries: [
    { requestNo: "RFP 1", type: "rfp", requestText: "All documents concerning the design, testing, or manufacture of the VX-2 battery module." },
    { requestNo: "ROG 3", type: "interrogatory", requestText: "Identify every person with knowledge of the QC-14 test deviations." },
    { requestNo: "RFA 12", type: "rfa", requestText: "Admit that the QC-14 test log was altered after March 2025." },
  ],
};
const CONFIDENCE = { entries: "high" };

// The demo's worked example (prefilled discovery-set JSON) — what Apply merges into.
const PREFILLED = {
  case: "Harlow v. Vestra Dynamics Corp. (fictional)",
  servedDate: "2026-03-10",
  serviceMethod: "mail",
  requests: [
    { requestNo: "RFP 1", type: "rfp", text: "All documents concerning the design, testing, or manufacture of the VX-2 battery module.", responseText: "produced", objectionIds: ["overbroad"] },
    { requestNo: "RFP 7", type: "rfp", text: "All communications with counsel concerning the VX-2 thermal events.", objectionIds: ["privileged"], privilegeBasis: "attorney-client" },
  ],
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
  const els = { docxImportMount: mount, input, run: new StubElement(), mc: new StubElement(), status: new StubElement(), err: new StubElement() };
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
  input.files = [docxFile("requests.docx")];
  input.fire("change");
  await settle();
  return dom;
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic import, mount above the discovery-set JSON, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="input"'), "control sits above the discovery-set JSON textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('schema: "discovery-response-log"'), "extraction calls POST /api/extract with the artifact schema key");
  assert.ok(HTML.includes('id="run"'), "existing Compute log control untouched");
});

test("static: the wiring is the requests-extraction path only — no response drafting, no objection/deadline logic", () => {
  const w = wiringBlock();
  assert.ok(!/responseText|objectionIds|privilegeBasis|calculateDeadline|computeDeadline/.test(w), "no response drafting / objections / deadline computation in the wiring");
  assert.ok(/requestText/.test(w), "the DraftEntry requestText field is mapped");
});

test("readDocxText on the real fixture returns the requests text the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: .docx → POST /api/extract → editable JSON preview with confidence chips; discovery set untouched before Apply", async () => {
  const calls = [];
  const restore = okFetch(calls);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.equal(calls.length, 1, "exactly one /api/extract call");
    assert.deepEqual(JSON.parse(calls[0].opts.body), { schema: "discovery-response-log", text: EXPECTED_TEXT });
    assert.match(dom.mount.innerHTML, /docx-import-preview/, "preview panel shown");
    assert.match(dom.mount.innerHTML, /xchip[^>]*>entries: high/, "confidence chip");
    assert.match(dom.mount.innerHTML, /class="xdata"/, "editable JSON surface present");
    assert.match(dom.mount.innerHTML, /REQUEST FOR PRODUCTION NO\. 1/, "extracted request text visible in the preview");
    assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "discovery set untouched before the explicit Apply");
  } finally { restore(); }
});

test("wiring: explicit Apply maps entries onto requests[] (user edits win), preserves the rest, and the core builds the log", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    // the user edited a request's text in the preview before applying
    const edited = JSON.parse(JSON.stringify(EXTRACTED));
    edited.entries[0].requestText = "All documents concerning the design or testing of the VX-2 battery module.";
    dom.mount.querySelector(".xdata").value = JSON.stringify(edited, null, 2);
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    const data = JSON.parse(dom.input.value);
    assert.equal(data.case, PREFILLED.case, "case preserved");
    assert.equal(data.servedDate, PREFILLED.servedDate, "servedDate preserved — deadline engine runs downstream");
    assert.equal(data.serviceMethod, PREFILLED.serviceMethod, "serviceMethod preserved");
    assert.equal(data.requests.length, 3, "extracted entries replace the requests set");
    assert.deepEqual(data.requests[0], { requestNo: "RFP 1", type: "rfp", text: "All documents concerning the design or testing of the VX-2 battery module." }, "user-EDITED requestText maps onto text");
    assert.ok(!("responseText" in data.requests[0]) && !("objectionIds" in data.requests[0]), "no drafted responses or objections — requests only");
    // downstream: the deterministic core consumes the merged discovery set
    const log = buildLog(data);
    assert.equal(log.counts.total, 3, "core builds the log from the imported requests");
  } finally { restore(); }
});

test("wiring: edited JSON that does not parse → error surfaced, discovery set untouched", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    dom.mount.querySelector(".xdata").value = "{ not json";
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.match(dom.mount.querySelector(".docx-import-preview").innerHTML, /does not parse/, "specific error surfaced in the preview");
    assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "discovery set untouched");
  } finally { restore(); }
});

test("wiring: ok:false from /api/extract → fail-closed banner + raw text preserved; Apply → notice, discovery set untouched", async () => {
  const restore = mockFetch(async () => jsonRes(502, { ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable" }));
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw document text offered in a fallback textarea");
    assert.match(dom.mount.innerHTML, /REQUEST FOR ADMISSION NO\. 12/, "text preserved, never lost");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "discovery set still untouched in fallback mode");
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

test("wiring: junk (non-docx) file → inline error, Apply unreachable, discovery set untouched", async () => {
  const dom = stubDom();
  await runWiring(dom.document, await import("../../_shared/docx-import.js"));
  const input = dom.mount.querySelector(".docx-file-input");
  input.files = [{ name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  input.fire("change");
  await settle();
  assert.match(dom.mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "discovery set never fed garbage");
  assert.equal(dom.mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
});
