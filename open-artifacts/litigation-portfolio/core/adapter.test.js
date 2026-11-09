// adapter.test.js — class-LA DOCX import adapter test for the litigation-portfolio
// demo (Wave W3 finish). The page's OWN wiring is under test, not a copy: the
// [docx-import-wiring] block is extracted verbatim from ../demo/index.html and executed
// against a stub DOM — the real _shared/docx-import.js is injected in place of the
// dynamic import, and a mocked globalThis.fetch stands in for POST /api/extract. Red
// until demo/index.html carries the Import DOCX control above the matter input. The
// DOCX fixture is a real archive built by docio's writeDocx (STORE). Fictional
// complaint + estimate memo. No console output; fail-closed everywhere.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { buildPortfolio } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional complaint + estimate memo (the DOCX under import).
const PARAS = [
  "COMPLAINT (fictional): Harbor Bakehouse Co. v. Northwind Logistics — breach of a written carriage contract, accrual September 12, 2025.",
  "ESTIMATE MEMO (fictional): defense-range estimate for LIT-2026-014 of $120,000 to $340,000.",
  "Claims memo (fictional): settlement range $15,000 to $48,000 for LIT-2026-021 (Delgado slip-and-fall).",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema litigation-portfolio): one fully-stated
// matter with a VERBATIM exposureBasis (a substring of the memo above), and one whose
// basis paraphrases the memo — the wiring must flag it, per the spec's
// "exposureBasis: verbatim quote from the estimate memo" rule.
const MATTERS = [
  { id: "LIT-2026-014", name: "Harbor Bakehouse v. Northwind Logistics (fictional)", client: "Harbor Bakehouse Co.", claimType: "breach-of-written-contract", accrualDate: "2025-09-12", discoveryDate: null, tollingEvents: [], exposureLow: 120000, exposureHigh: 340000, exposureBasis: "defense-range estimate for LIT-2026-014 of $120,000 to $340,000" },
  { id: "LIT-2026-021", name: "Delgado v. Summit Ridge Hospitality (fictional)", client: "M. Delgado", claimType: "personal-injury-negligence", accrualDate: "2025-02-03", discoveryDate: null, tollingEvents: [], exposureLow: 15000, exposureHigh: 48000, exposureBasis: "settlement range of $15,000–$48,000" },
];
const EDITED_MATTERS = [MATTERS[0], { ...MATTERS[1], exposureBasis: "settlement range $15,000 to $48,000 for LIT-2026-021 (Delgado slip-and-fall)" }];

/* ---------- fixture: a real .docx (STORE) via docio's writer ---------- */
const docxFile = (name) => {
  const b = writeDocx(PARAS);
  return { name, size: b.length, arrayBuffer: async () => new Uint8Array(b).slice().buffer };
};

/* ---------- minimal DOM stub (wireDocxImport stub pattern from _shared/docx-import.test.js) ---------- */
class StubElement {
  constructor() { this._html = ""; this._kids = {}; this.handlers = {}; this.files = null; this.disabled = false; this.value = ""; this.textContent = ""; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._kids = {}; }
  querySelector(sel) { if (!this._kids[sel]) this._kids[sel] = new StubElement(); return this._kids[sel]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  fire(type) { for (const f of this.handlers[type] ?? []) f(); }
  insertAdjacentHTML(_pos, html) { this._html += String(html); }
}
const settle = () => new Promise((r) => setTimeout(r, 15));

function stubDom() {
  const els = {};
  for (const id of ["docxImportMount", "input", "run", "csv", "err", "filters", "summary", "board"]) els[id] = new StubElement();
  els.input.value = JSON.stringify({ asOf: "2026-11-07", matters: [] }, null, 2); // the page ships a prefilled example
  return { els, mount: els.docxImportMount, document: { getElementById: (id) => els[id] ?? null } };
}

/* ---------- fetch mock for POST /api/extract ---------- */
function mockFetch(handler) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts, body: opts && typeof opts.body === "string" ? JSON.parse(opts.body) : null });
    return handler(calls.length);
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}
const okRes = (body) => ({ ok: true, status: 200, json: async () => body });
const okExtract = (conf) => okRes({ ok: true, data: { matters: MATTERS }, confidence: conf, source: "gpt-5-nano" });

/* ---------- extract + execute the page's actual wiring block ---------- */
function block(tag) {
  const START = `/* ---- [${tag}] ---- */`;
  const END = `/* ---- [/${tag}] ---- */`;
  const i = HTML.indexOf(START);
  const j = HTML.indexOf(END);
  assert.ok(i >= 0 && j > i, `demo/index.html must carry the [${tag}] block`);
  return HTML.slice(i, j + END.length);
}

async function runWiring(document, shared) {
  const wiring = block("docx-import-wiring");
  assert.equal(wiring.split(`import("${SPECIFIER}")`).length - 1, 1, "exactly one dynamic import, with the D1-pinned specifier");
  const injectable = wiring.replace(`import("${SPECIFIER}")`, "Promise.resolve(__SHARED__)");
  new Function("document", "__SHARED__", injectable)(document, shared);
  await settle();
}

async function runWiringImportFails(document) {
  const injectable = block("docx-import-wiring").replace(`import("${SPECIFIER}")`, 'Promise.reject(new Error("module unavailable (file:// or offline)"))');
  new Function("document", injectable)(document);
  await settle();
}

async function pickFile(mount, file) {
  const input = mount.querySelector(".docx-file-input");
  input.files = [file];
  input.fire("change");
  await settle();
}

/* ---------- static: additive control; existing inputs untouched ---------- */

test("static: D1-pinned dynamic import, additive mount above the matter input, no static docx-import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="input"'), "control sits above the matter textarea");
  assert.ok(HTML.indexOf('id="docxImportMount"') > HTML.indexOf("Matter input (JSON)"), "control sits inside the matter-input section");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(block("docx-import-wiring").includes('schema: "litigation-portfolio"'), "extraction calls POST /api/extract with the artifact schema key");
});

test("static: the wiring touches only the mount and the matter input", () => {
  const ids = [...block("docx-import-wiring").matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)], ["docxImportMount", "input"], "additive: no other page input is referenced");
});

test("static: existing inputs and controls untouched", () => {
  for (const id of ["input", "run", "csv", "err", "filters", "f-closed", "f-stale", "f-band", "f-claim", "f-counsel", "summary", "board"]) {
    assert.ok(HTML.includes(`id="${id}"`), `existing element ${id} untouched`);
  }
  assert.ok(HTML.includes("import { buildPortfolio, toCSV, renderDashboard, applyFilters, DEFAULT_CLAIM_RULES } from '../core/core.js'"), "core import untouched");
});

/* ---------- fixture sanity ---------- */

test("readDocxText on the real fixture returns the memo text the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

/* ---------- LA path: mocked /api/extract ---------- */

test("LA wiring: real .docx + mocked ok extract → editable matters JSON; input untouched before Apply; verbatim exposureBasis rule enforced visibly", async () => {
  const { els, mount, document } = stubDom();
  const sentinel = els.input.value;
  const fetchMock = mockFetch(() => okExtract({ matters: "high" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint-and-memo.docx"));
    assert.equal(fetchMock.calls.length, 1, "exactly one extraction call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    assert.deepEqual(fetchMock.calls[0].body, { schema: "litigation-portfolio", text: EXPECTED_TEXT });
    assert.match(mount.innerHTML, /class="matters-draft"/, "editable matters JSON textarea in the preview");
    assert.match(mount.innerHTML, /matters · high confidence/, "per-field confidence chip");
    assert.equal(els.input.value, sentinel, "matter box untouched before the explicit Apply");
    // exposureBasis verbatim-quote rule: the memo-substring basis passes; the paraphrase is flagged
    assert.doesNotMatch(mount.innerHTML, /LIT-2026-014[\s\S]{0,400}?not found verbatim/, "verbatim basis is not flagged");
    assert.match(mount.innerHTML, /LIT-2026-021[^]*?exposureBasis not found verbatim/, "paraphrased basis flagged — quotes are verbatim or flagged");
    assert.match(mount.innerHTML, /verbatim quote from the estimate memo/, "the rule itself is stated for the user");
  } finally { fetchMock.restore(); }
});

test("LA wiring: explicit Apply fills the matter input with the user-EDITED matters; asOf preserved from the page", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okExtract({ matters: "high" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint-and-memo.docx"));
    // the user fixes the flagged paraphrase to the memo's verbatim wording, then Applies
    mount.querySelector(".matters-draft").value = JSON.stringify(EDITED_MATTERS, null, 2);
    mount.querySelector(".docx-apply-btn").fire("click");
    const applied = JSON.parse(els.input.value);
    assert.equal(applied.asOf, "2026-11-07", "existing asOf preserved, never overwritten");
    assert.deepEqual(applied.matters, EDITED_MATTERS, "user-EDITED matters land in the matter input");
    assert.match(mount.querySelector(".docx-import-preview").innerHTML, /applied to the matter input — press/, "apply confirmation surfaced");
  } finally { fetchMock.restore(); }
});

test("LA wiring: unparsable existing input → asOf falls back to today, never guessed from the documents", async () => {
  const { els, mount, document } = stubDom();
  els.input.value = "user's pasted, not-yet-valid JSON";
  const fetchMock = mockFetch(() => okExtract({ matters: "high" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint-and-memo.docx"));
    mount.querySelector(".matters-draft").value = JSON.stringify(MATTERS, null, 2);
    mount.querySelector(".docx-apply-btn").fire("click");
    const applied = JSON.parse(els.input.value);
    assert.match(applied.asOf, /^\d{4}-\d{2}-\d{2}$/, "today's date when the page had no readable asOf");
    assert.deepEqual(applied.matters, MATTERS);
  } finally { fetchMock.restore(); }
});

test("gate: the applied matters run through the frozen deterministic core", () => {
  const out = buildPortfolio({ asOf: "2026-11-07", matters: EDITED_MATTERS });
  assert.equal(out.matters.length, 2);
  assert.ok(out.matters.every((r) => typeof r.sol.status === "string"), "every matter gets a deterministic SOL status");
});

test("LA wiring: low confidence is flagged for review in the chip", async () => {
  const { mount, document } = stubDom();
  const fetchMock = mockFetch(() => okExtract({ matters: "low" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint-and-memo.docx"));
    assert.match(mount.innerHTML, /low confidence — review before applying/, "low confidence flagged, not presented as ok");
    assert.ok(!mount.innerHTML.includes("matters · high confidence"));
  } finally { fetchMock.restore(); }
});

test("LA wiring: corrupted draft JSON on Apply → fail-closed, matter input untouched", async () => {
  const { els, mount, document } = stubDom();
  const sentinel = els.input.value;
  const fetchMock = mockFetch(() => okExtract({ matters: "high" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint-and-memo.docx"));
    mount.querySelector(".matters-draft").value = "{not json";
    mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(els.input.value, sentinel, "nothing applied on a parse failure");
    assert.match(mount.innerHTML, /Applying the import failed/, "shared-module fail-closed warning shown");
  } finally { fetchMock.restore(); }
});

test("LA wiring: ok:false reply → fail-closed banner + raw text preserved, matter input untouched", async () => {
  const { els, mount, document } = stubDom();
  const sentinel = els.input.value;
  const fetchMock = mockFetch(() => ({ ok: false, status: 502, json: async () => ({ ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable" }) }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint-and-memo.docx"));
    assert.equal(fetchMock.calls.length, 1);
    assert.match(mount.innerHTML, /docx-import-warning/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /<textarea class="docx-import-text"[^>]*>[\s\S]*Northwind Logistics/, "raw document text offered in a fallback textarea — never lost");
    assert.equal(els.input.value, sentinel, "existing input untouched");
    mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(els.input.value, sentinel, "apply in the fallback state feeds nothing to the matter input");
    assert.match(mount.querySelector(".docx-import-preview").innerHTML, /No extracted matters to apply/, "honest fallback note surfaced");
  } finally { fetchMock.restore(); }
});

test("LA wiring: junk (non-docx) file → inline error, no extraction call, matter input untouched", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okExtract({ matters: "high" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, { name: "memo.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer });
    assert.equal(fetchMock.calls.length, 0, "no API call for an unreadable file");
    assert.match(mount.innerHTML, /docx-import-error/, "inline error, no crash");
    assert.equal(els.input.value, JSON.stringify({ asOf: "2026-11-07", matters: [] }, null, 2), "target never fed garbage");
    assert.equal(mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
  } finally { fetchMock.restore(); }
});

test("LA wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const { els, mount, document } = stubDom();
  els.input.value = "user's pasted matters JSON";
  await runWiringImportFails(document);
  assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(els.input.value, "user's pasted matters JSON", "existing input value untouched");
});
