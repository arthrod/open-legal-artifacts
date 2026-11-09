// adapter.test.js — class-LA DOCX import adapter test for the limitations-radar demo
// (Wave W3 finish). The page's OWN wiring is under test, not a copy: the
// [docx-import-wiring] block is extracted verbatim from ../demo/index.html and executed
// against a stub DOM — the real _shared/docx-import.js is injected in place of the
// dynamic import, and a mocked globalThis.fetch stands in for POST /api/extract. Red
// until demo/index.html carries the Import DOCX control above the claims textarea.
// The DOCX fixture is a real archive built by docio's writeDocx (STORE). Fictional
// intake note. No console output; fail-closed everywhere.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { runRadar } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional intake note (the DOCX under import).
const PARAS = [
  "INTAKE NOTE (fictional)",
  "Alder & Vane: client was struck by a forklift at the Ridgeline depot in California on March 10, 2025; the injury was apparent the same day.",
  "A second count under a written storage contract accrued June 1, 2022 in New York; a bankruptcy stay ran from September 1, 2022 to May 1, 2023.",
  "The pleading does not yet characterize the second count.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema limitations-radar): claims as stated,
// plus one genuinely ambiguous claimType kept in uncertain with its candidates —
// per the spec, uncertain claims are run per candidate downstream, never collapsed.
const CLAIMS = [
  { id: "CLM-1", claimType: "personal_injury", jurisdiction: "CA", injuryDate: "2025-03-10", discoveryDate: "2025-03-10", tollingEvents: [] },
  { id: "CLM-2", claimType: "breach_of_contract_written", jurisdiction: "NY", injuryDate: "2022-06-01", discoveryDate: null, tollingEvents: [{ type: "bankruptcy_stay", startDate: "2022-09-01", endDate: "2023-05-01", stillOngoing: null }] },
];
const UNCERTAIN = [{ claimId: "CLM-2", field: "claimType", candidates: ["fraud", "breach_of_contract_written"], reason: "pleading not yet characterized" }];
const EDITED_CLAIMS = [CLAIMS[0], { ...CLAIMS[1], claimType: "breach_of_contract_written" }];

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
  for (const id of ["docxImportMount", "input", "run", "err", "out"]) els[id] = new StubElement();
  els.input.value = JSON.stringify({ asOf: "2026-11-07", claims: [] }, null, 2); // the page ships a prefilled example
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
const okExtract = (conf) => okRes({ ok: true, data: { claims: CLAIMS, uncertain: UNCERTAIN }, confidence: conf, source: "gpt-5-nano" });

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

test("static: D1-pinned dynamic import, additive mount above the claims textarea, no static docx-import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}").catch(() => import("/open-artifacts/_shared/docx-import.js"));`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="input"'), "control sits above the claims textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(block("docx-import-wiring").includes('schema: "limitations-radar"'), "extraction calls POST /api/extract with the artifact schema key");
});

test("static: the wiring touches only the mount and the claims input", () => {
  const ids = [...block("docx-import-wiring").matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)], ["docxImportMount", "input"], "additive: no other page input is referenced");
});

test("static: existing inputs and controls untouched", () => {
  for (const id of ["input", "run", "err", "out"]) assert.ok(HTML.includes(`id="${id}"`), `existing element ${id} untouched`);
  assert.ok(HTML.includes('import { runRadar, toICS } from "../core/core.js"'), "core import untouched");
});

/* ---------- fixture sanity ---------- */

test("readDocxText on the real fixture returns the intake note the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

/* ---------- LA path: mocked /api/extract ---------- */

test("LA wiring: real .docx + mocked ok extract → editable claims JSON + uncertain candidates in the preview; input untouched before Apply", async () => {
  const { els, mount, document } = stubDom();
  const sentinel = els.input.value;
  const fetchMock = mockFetch(() => okExtract({ claims: "high", uncertain: "low" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("intake-note.docx"));
    assert.equal(fetchMock.calls.length, 1, "exactly one extraction call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    assert.deepEqual(fetchMock.calls[0].body, { schema: "limitations-radar", text: EXPECTED_TEXT });
    assert.match(mount.innerHTML, /class="claims-draft"/, "editable claims JSON textarea in the preview");
    assert.match(mount.innerHTML, /claims · high confidence/, "per-field confidence chip");
    assert.match(mount.innerHTML, /uncertain[^>]*— review before applying/, "low-confidence uncertain flagged, not presented as ok");
    assert.match(mount.innerHTML, /class="xuncertain"/, "uncertain entries are surfaced, never collapsed");
    assert.match(mount.innerHTML, /CLM-2/, "uncertain entry anchors its claim id");
    assert.match(mount.innerHTML, /fraud/, "candidate values shown");
    assert.match(mount.innerHTML, /per candidate/, "the per-candidate rule is stated for the user");
    assert.equal(els.input.value, sentinel, "claims box untouched before the explicit Apply");
  } finally { fetchMock.restore(); }
});

test("LA wiring: explicit Apply fills the claims input with the user-EDITED claims; asOf preserved from the page", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okExtract({ claims: "high", uncertain: "high" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("intake-note.docx"));
    mount.querySelector(".claims-draft").value = JSON.stringify(EDITED_CLAIMS, null, 2);
    mount.querySelector(".docx-apply-btn").fire("click");
    const applied = JSON.parse(els.input.value);
    assert.equal(applied.asOf, "2026-11-07", "existing asOf preserved, never overwritten");
    assert.deepEqual(applied.claims, EDITED_CLAIMS, "user-EDITED claims land in the claims box");
    assert.match(mount.querySelector(".docx-import-preview").innerHTML, /applied to the claims box — press/, "apply confirmation surfaced");
  } finally { fetchMock.restore(); }
});

test("LA wiring: unparsable existing input → asOf falls back to today, never guessed from the document", async () => {
  const { els, mount, document } = stubDom();
  els.input.value = "user's pasted, not-yet-valid JSON";
  const fetchMock = mockFetch(() => okExtract({ claims: "high", uncertain: "high" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("intake-note.docx"));
    mount.querySelector(".claims-draft").value = JSON.stringify(CLAIMS, null, 2);
    mount.querySelector(".docx-apply-btn").fire("click");
    const applied = JSON.parse(els.input.value);
    assert.match(applied.asOf, /^\d{4}-\d{2}-\d{2}$/, "today's date when the page had no readable asOf");
    assert.deepEqual(applied.claims, CLAIMS);
  } finally { fetchMock.restore(); }
});

test("gate: the applied claims run through the frozen deterministic core", () => {
  const r = runRadar({ asOf: "2026-11-07", claims: EDITED_CLAIMS });
  assert.equal(r.results.length, 2);
  assert.ok(r.results.every((c) => typeof c.status === "string" && c.status.length > 0), "every claim gets a deterministic status");
});

test("LA wiring: corrupted draft JSON on Apply → fail-closed, claims input untouched", async () => {
  const { els, mount, document } = stubDom();
  const sentinel = els.input.value;
  const fetchMock = mockFetch(() => okExtract({ claims: "high", uncertain: "high" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("intake-note.docx"));
    mount.querySelector(".claims-draft").value = "{not json";
    mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(els.input.value, sentinel, "nothing applied on a parse failure");
    assert.match(mount.innerHTML, /Applying the import failed/, "shared-module fail-closed warning shown");
  } finally { fetchMock.restore(); }
});

test("LA wiring: ok:false reply → fail-closed banner + raw text preserved, claims input untouched", async () => {
  const { els, mount, document } = stubDom();
  const sentinel = els.input.value;
  const fetchMock = mockFetch(() => ({ ok: false, status: 400, json: async () => ({ ok: false, error: "INVALID", message: "The extracted structure did not match" }) }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("intake-note.docx"));
    assert.equal(fetchMock.calls.length, 1);
    assert.match(mount.innerHTML, /docx-import-warning/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /<textarea class="docx-import-text"[^>]*>[\s\S]*Ridgeline depot/, "raw document text offered in a fallback textarea — never lost");
    assert.equal(els.input.value, sentinel, "existing input untouched");
    mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(els.input.value, sentinel, "apply in the fallback state feeds nothing to the claims box");
    assert.match(mount.querySelector(".docx-import-preview").innerHTML, /No extracted claims to apply/, "honest fallback note surfaced");
  } finally { fetchMock.restore(); }
});

test("LA wiring: fetch throws → same fail-closed fallback", async () => {
  const { els, mount, document } = stubDom();
  const sentinel = els.input.value;
  const fetchMock = mockFetch(() => { throw new Error("network down"); });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("intake-note.docx"));
    assert.match(mount.innerHTML, /docx-import-warning/);
    assert.match(mount.innerHTML, /bankruptcy stay/, "imported text preserved in the fallback textarea");
    assert.equal(els.input.value, sentinel);
  } finally { fetchMock.restore(); }
});

test("LA wiring: junk (non-docx) file → inline error, no extraction call, claims input untouched", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okExtract({ claims: "high", uncertain: "high" }));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, { name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer });
    assert.equal(fetchMock.calls.length, 0, "no API call for an unreadable file");
    assert.match(mount.innerHTML, /docx-import-error/, "inline error, no crash");
    assert.equal(els.input.value, JSON.stringify({ asOf: "2026-11-07", claims: [] }, null, 2), "target never fed garbage");
    assert.equal(mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
  } finally { fetchMock.restore(); }
});

test("LA wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const { els, mount, document } = stubDom();
  els.input.value = "user's pasted claims JSON";
  await runWiringImportFails(document);
  assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(els.input.value, "user's pasted claims JSON", "existing input value untouched");
});
