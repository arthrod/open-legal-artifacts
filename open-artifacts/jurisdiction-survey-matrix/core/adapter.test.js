// adapter.test.js — class-LA DOCX import adapter test for the jurisdiction-survey-matrix
// demo (Wave W7). Unlike the other LA pages, this demo ALREADY has the collection's only
// <input type="file"> (accept=".json"): the wiring EXTENDS that existing input to also
// accept .docx (survey-memo extraction via POST /api/extract), wrapping — never replacing —
// the original .json handler. The [docx-import-wiring] block is extracted verbatim from
// ../demo/index.html and executed against a stub DOM with the real _shared/docx-import.js
// module injected in place of the dynamic import and a mocked fetch. Red until wired.
// Fictional survey memo. Every imported cell must land UNVERIFIED (no verifiedBy).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier
const SCHEMA_KEY = "jurisdiction-survey-matrix"; // POST /api/extract schema key = artifact name
const START = "/* ---- [docx-import-wiring] ---- */";
const END = "/* ---- [/docx-import-wiring] ---- */";

const PARAS = [
  "SURVEY MEMORANDUM — Employee non-compete enforceability (fictional)",
  "US-TX: Agreements not to compete are unenforceable unless part of an otherwise enforceable agreement. Tex. Bus. & Com. Code § 15.50(a). https://statutes.fictional.example/tx/15-50",
  "US-CA: Contracts that restrain anyone from engaging in a lawful profession are void. Cal. Bus. & Prof. Code § 16600. https://statutes.fictional.example/ca/16600",
];
const EXPECTED_TEXT = PARAS.join("\n");
const SAMPLE = {
  cells: [
    { jurisdiction: "US-TX", question: "q1", answer: "Unenforceable unless part of an otherwise enforceable agreement.", citation: "Tex. Bus. & Com. Code § 15.50(a)", quotedText: "Agreements not to compete are unenforceable unless part of an otherwise enforceable agreement", sourceUrl: "https://statutes.fictional.example/tx/15-50" },
    { jurisdiction: "US-CA", question: "q1", answer: "Void as to any lawful profession.", citation: "Cal. Bus. & Prof. Code § 16600", quotedText: "Contracts that restrain anyone from engaging in a lawful profession are void", sourceUrl: "https://statutes.fictional.example/ca/16600" },
  ],
};
const EDITED = { cells: [{ ...SAMPLE.cells[0], answer: "EDITED BY REVIEWER — generally unenforceable." }] };

/* ---------- fixture: a real .docx (STORE) via docio's writer ---------- */
const docxFile = (name) => {
  const b = writeDocx(PARAS);
  return { name, size: b.length, arrayBuffer: async () => new Uint8Array(b).slice().buffer };
};

/* ---------- minimal DOM stub (wireDocxImport stub pattern from _shared/docx-import.test.js) ---------- */
class StubElement {
  constructor() { this._html = ""; this._kids = {}; this.handlers = {}; this.clicks = 0; this.files = null; this.disabled = false; this.value = ""; this.textContent = ""; this.open = false; this.hidden = false; this.onchange = null; this.onclick = null; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._kids = {}; }
  querySelector(sel) { if (!this._kids[sel]) this._kids[sel] = new StubElement(); return this._kids[sel]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  click() { this.clicks++; if (typeof this.onclick === "function") this.onclick(); for (const f of this.handlers.click ?? []) f(); }
  fire(type) { for (const f of this.handlers[type] ?? []) f(); }
}
const settle = () => new Promise((r) => setTimeout(r, 25));

function stubDom() {
  const fileInput = new StubElement();
  const docxPrev = new StubElement();
  const map = { fileInput, docxPrev, jsmDocxJson: new StubElement(), jsmDocxApply: new StubElement(), jsmDocxStatus: new StubElement(), inputJson: new StubElement(), renderBtn: new StubElement(), advDetails: new StubElement(), gCells: new StubElement(), gJuris: new StubElement(), gQuestions: new StubElement() };
  return { fileInput, docxPrev, map, document: { getElementById: (id) => map[id] ?? null } };
}

/* ---------- fetch mock for POST /api/extract ---------- */
function mockFetch(reply) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (reply instanceof Error) throw reply;
    return { ok: reply.ok, status: reply.status, json: async () => reply.body };
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

/* ---------- extract + execute the page's actual wiring block ---------- */
function wiringBlock() {
  const i = HTML.indexOf(START);
  const j = HTML.indexOf(END);
  assert.ok(i >= 0 && j > i, "demo/index.html must carry the [docx-import-wiring] block (existing file input extended to .docx)");
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

/* ---------- tests ---------- */

test("static: the existing file input now accepts .docx alongside .json, json handler preserved", () => {
  const accept = /id="fileInput"[^>]*accept="([^"]*)"/.exec(HTML);
  assert.ok(accept, "the existing file input is still there");
  assert.ok(accept[1].includes(".json"), ".json still accepted");
  assert.ok(accept[1].includes(".docx"), ".docx now also accepted");
  const outside = HTML.replace(wiringBlock(), "");
  assert.ok(outside.includes('$("fileInput").onchange'), "the original .json onchange handler is preserved in page code");
  assert.ok(HTML.includes('id="docxPrev"'), "preview container for the docx flow present");
});

test("static: D1-pinned dynamic-import line inside the wiring block, no static import", () => {
  assert.ok(wiringBlock().includes(`const M = await import("${SPECIFIER}").catch(() => import("/open-artifacts/_shared/docx-import.js"));`), "the exact pinned D1 import line");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
});

test("static: the wiring only touches the docx flow's own ids", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^\"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids, ["advDetails", "docxPrev", "fileInput", "inputJson", "jsmDocxApply", "jsmDocxJson", "jsmDocxStatus", "renderBtn"], "additive: no other page input is referenced");
});

test("readDocxText on the real fixture returns the text the page will send to /api/extract", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: .docx through the EXISTING file input → POST /api/extract → editable preview + chip; .json handler untouched; nothing applied yet", async () => {
  const { fileInput, docxPrev, map, document } = stubDom();
  const jsonSpy = [];
  fileInput.onchange = () => jsonSpy.push("json"); // the page's original handler, simulated
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { cells: "high" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    fileInput.files = [docxFile("survey-memo.docx")];
    fileInput.onchange();
    await settle();
    assert.equal(jsonSpy.length, 0, "the .json handler did NOT run for a .docx file");
    assert.equal(fetchMock.calls.length, 1, "exactly one extraction call");
    const body = JSON.parse(fetchMock.calls[0].opts.body);
    assert.equal(body.schema, SCHEMA_KEY, "schema key is the artifact name");
    assert.equal(body.text, EXPECTED_TEXT, "the imported memo text is what is sent");
    assert.equal(docxPrev.hidden, false, "preview panel revealed");
    assert.match(docxPrev.innerHTML, /docx-extract-json/, "editable cells textarea in the preview");
    assert.match(docxPrev.innerHTML, /US-TX/, "extracted cells visible");
    assert.match(docxPrev.innerHTML, /docx-chip[^>]*>cells: high/, "per-field confidence chip shown");
    assert.doesNotMatch(docxPrev.innerHTML, /docx-chip flag/, "high confidence is not flagged");
    assert.equal(map.inputJson.value, "", "advanced JSON untouched before Apply");
    assert.equal(map.gCells.value, "", "guided cells box untouched before Apply");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: .json through the existing input keeps its original behavior", async () => {
  const { fileInput, docxPrev, document } = stubDom();
  const jsonSpy = [];
  fileInput.onchange = () => jsonSpy.push("json");
  await runWiring(document, await import("../../_shared/docx-import.js"));
  fileInput.files = [{ name: "survey.json", size: 40, arrayBuffer: async () => new ArrayBuffer(8) }];
  fileInput.onchange();
  await settle();
  assert.equal(jsonSpy.length, 1, "the original .json handler ran");
  assert.equal(docxPrev.innerHTML, "", "no docx flow ran for a .json file");
});

test("wiring: Apply reads the USER-EDITED cells, fills the advanced JSON, opens the details, clicks Render", async () => {
  const { fileInput, docxPrev, map, document } = stubDom();
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { cells: "high" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    fileInput.files = [docxFile("survey-memo.docx")];
    fileInput.onchange();
    await settle();
    map.jsmDocxJson.value = JSON.stringify(EDITED); // the reviewer edits before applying
    map.jsmDocxApply.onclick();
    const applied = JSON.parse(map.inputJson.value);
    assert.deepEqual(applied.survey.cells, EDITED.cells, "the advanced JSON carries the USER-EDITED cells");
    assert.equal(applied.survey.cells[0].verifiedBy, undefined, "imported cells carry no verifiedBy — verification stays human");
    assert.equal(applied.survey.cells[0].verifiedDate, undefined, "imported cells carry no verifiedDate — they land UNVERIFIED");
    assert.ok(applied.survey.jurisdictions.includes("US-TX"), "memo jurisdictions are unioned in (document-derived, never invented)");
    assert.equal(map.advDetails.open, true, "the advanced details panel is opened");
    assert.equal(map.renderBtn.clicks, 1, "the existing Render JSON path is triggered");
    assert.match(map.jsmDocxStatus.textContent, /UNVERIFIED/, "status reminds the reviewer the cells are unverified");
    assert.equal(map.gCells.value, "", "guided boxes are filled by the page's own render path, not by the wiring");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: ok:false → fail-closed banner + raw memo text preserved, nothing applied", async () => {
  const { fileInput, docxPrev, map, document } = stubDom();
  const fetchMock = mockFetch({ ok: false, status: 502, body: { ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable." } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    fileInput.files = [docxFile("survey-memo.docx")];
    fileInput.onchange();
    await settle();
    assert.match(docxPrev.innerHTML, /docx-err/, "fail-closed banner shown");
    assert.match(docxPrev.innerHTML, /docx-fallback/, "fallback textarea offered");
    assert.match(docxPrev.innerHTML, /Cal\. Bus\. & Prof\. Code/, "the imported memo text is preserved, never lost");
    assert.equal(map.inputJson.value, "", "nothing applied");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: fetch throws → same fail-closed fallback", async () => {
  const { fileInput, docxPrev, map, document } = stubDom();
  const fetchMock = mockFetch(new Error("network down"));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    fileInput.files = [docxFile("survey-memo.docx")];
    fileInput.onchange();
    await settle();
    assert.match(docxPrev.innerHTML, /docx-err/, "fail-closed banner shown");
    assert.match(docxPrev.innerHTML, /SURVEY MEMORANDUM/, "raw memo text preserved");
    assert.equal(map.inputJson.value, "", "nothing applied");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: non-docx junk picked as .docx → inline error from the guarded reader, nothing applied", async () => {
  const { fileInput, docxPrev, map, document } = stubDom();
  await runWiring(document, await import("../../_shared/docx-import.js"));
  fileInput.files = [{ name: "fake.docx", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  fileInput.onchange();
  await settle();
  assert.match(docxPrev.innerHTML, /docx-err/, "inline error, no crash");
  assert.equal(map.inputJson.value, "", "nothing applied");
});

test("wiring: failed shared-module import renders the hosted-site hint; .json path unaffected", async () => {
  const { fileInput, docxPrev, document } = stubDom();
  const jsonSpy = [];
  fileInput.onchange = () => jsonSpy.push("json");
  await runWiringImportFails(document);
  fileInput.files = [docxFile("survey-memo.docx")];
  fileInput.onchange();
  await settle();
  assert.match(docxPrev.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  fileInput.files = [{ name: "survey.json", size: 40, arrayBuffer: async () => new ArrayBuffer(8) }];
  fileInput.onchange();
  await settle();
  assert.equal(jsonSpy.length, 1, ".json loading still works when the docx module cannot load");
});
