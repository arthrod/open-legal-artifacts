// adapter.test.js — class-LA DOCX import adapter test for the privilege-log-builder demo (Wave W4).
// The page's OWN wiring is under test, not a copy: the [docx-import-wiring] block is
// extracted verbatim from ../demo/index.html and executed against a stub DOM with the
// real _shared/docx-import.js module injected in place of the dynamic import, and
// globalThis.fetch mocked for POST /api/extract. Red until demo/index.html carries the
// Import DOCX control. The fixture is a real archive built by docio's writeDocx.
// Fictional email/memo set.
//
// Behavior pinned here (per-artifact note): email/memo DOCX set → documents[] metadata
// + uncertain[] (uncertain roles are left null — never guessed — so the core flags
// those entries incomplete downstream). Apply replaces documents in the document-set
// input; matter preserved.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { buildLog } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional email/memo set (the DOCX under import).
const PARAS = [
  "EMAIL — Date: 2026-02-03 — From: A. Moreno (attorney) — To: J. Vale (client)",
  "Subject: Initial case assessment",
  "We have reviewed the dispute; a response strategy follows in the attached memo.",
  "MEMO — Date: 2026-02-11 — From: A. Moreno (attorney)",
  "Subject: Research memo: forum-selection exposure",
  "Prepared in anticipation of litigation; circulation limited to the engagement team.",
  "EMAIL — From: R. Silva — To: M. Ito — Subject: Shipping schedule Q2",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema privilege-log-builder).
const EXTRACTED = {
  documents: [
    { id: "IM-0001", date: "2026-02-03", docType: "email", author: { name: "A. Moreno", role: "attorney" }, recipients: [{ name: "J. Vale", role: "client" }], subject: "Initial case assessment", anticipationOfLitigation: null },
    { id: "IM-0002", date: "2026-02-11", docType: "memo", author: { name: "A. Moreno", role: "attorney" }, recipients: [], subject: "Research memo: forum-selection exposure", anticipationOfLitigation: true },
    { id: "IM-0003", date: null, docType: "email", author: { name: "R. Silva", role: null }, recipients: [{ name: "M. Ito", role: null }], subject: "Shipping schedule Q2", anticipationOfLitigation: null },
  ],
  uncertain: [
    { docId: "IM-0003", field: "role", candidates: ["operations", "third_party"], reason: "sender and recipient functions are not stated in the text" },
  ],
};
const CONFIDENCE = { documents: "low", uncertain: "high" };

// The demo's worked example (prefilled document-set JSON) — what Apply merges into.
const PREFILLED = {
  matter: "Kestrel Bio Fuels v. Kestrel Dynamics, Inc. (fictional)",
  documents: [
    { id: "KV-0001", date: "2026-02-03", docType: "email", author: { name: "A. Moreno", role: "attorney" }, recipients: [{ name: "J. Vale", role: "client" }], subject: "Initial case assessment" },
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
  const els = { docxImportMount: mount, input, run: new StubElement(), err: new StubElement(), out: new StubElement() };
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
  input.files = [docxFile("doc-set.docx")];
  input.fire("change");
  await settle();
  return dom;
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic import, mount above the document-set JSON, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="input"'), "control sits above the document-set JSON textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('schema: "privilege-log-builder"'), "extraction calls POST /api/extract with the artifact schema key");
  assert.ok(HTML.includes('id="run"'), "existing Build draft log control untouched");
});

test("readDocxText on the real fixture returns the email/memo text the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: .docx → POST /api/extract → editable JSON preview with confidence chips; document set untouched before Apply", async () => {
  const calls = [];
  const restore = okFetch(calls);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.equal(calls.length, 1, "exactly one /api/extract call");
    assert.deepEqual(JSON.parse(calls[0].opts.body), { schema: "privilege-log-builder", text: EXPECTED_TEXT });
    assert.match(dom.mount.innerHTML, /docx-import-preview/, "preview panel shown");
    assert.match(dom.mount.innerHTML, /xchip[^>]*flag[^>]*>documents: low/, "low-confidence chip flagged for review");
    assert.match(dom.mount.innerHTML, /class="xdata"/, "editable JSON surface present");
    assert.match(dom.mount.innerHTML, /IM-0003/, "extracted document metadata visible in the preview");
    assert.match(dom.mount.innerHTML, /uncertain/, "uncertain[] surfaced in the preview");
    assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "document set untouched before the explicit Apply");
  } finally { restore(); }
});

test("wiring: explicit Apply replaces documents (user edits win), preserves matter, and the core flags the uncertain entry incomplete", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    // the user edited a subject in the preview before applying
    const edited = JSON.parse(JSON.stringify(EXTRACTED));
    edited.documents[0].subject = "Initial case assessment (edited)";
    dom.mount.querySelector(".xdata").value = JSON.stringify(edited, null, 2);
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    const set = JSON.parse(dom.input.value);
    assert.equal(set.matter, PREFILLED.matter, "matter preserved");
    assert.equal(set.documents.length, 3, "extracted documents replace the set");
    assert.equal(set.documents[0].subject, "Initial case assessment (edited)", "user-EDITED value wins");
    assert.equal(set.documents[2].author.role, null, "uncertain role left null — never guessed");
    // downstream: the deterministic core flags the gap rather than inferring a role
    const log = buildLog(set);
    const im3 = log.entries.find((e) => e.docId === "IM-0003");
    assert.ok(im3.reviewFlags.some((f) => f.code === "incomplete_entry"), "uncertain entry carries the incomplete_entry review flag");
  } finally { restore(); }
});

test("wiring: edited JSON that does not parse → error surfaced, document set untouched", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    dom.mount.querySelector(".xdata").value = "{ not json";
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.match(dom.mount.querySelector(".docx-import-preview").innerHTML, /does not parse/, "specific error surfaced in the preview");
    assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "document set untouched");
  } finally { restore(); }
});

test("wiring: ok:false from /api/extract → fail-closed banner + raw text preserved; Apply → notice, document set untouched", async () => {
  const restore = mockFetch(async () => jsonRes(400, { ok: false, error: "INVALID", message: "The extracted structure did not match" }));
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw document text offered in a fallback textarea");
    assert.match(dom.mount.innerHTML, /Shipping schedule Q2/, "text preserved, never lost");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "document set still untouched in fallback mode");
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

test("wiring: junk (non-docx) file → inline error, Apply unreachable, document set untouched", async () => {
  const dom = stubDom();
  await runWiring(dom.document, await import("../../_shared/docx-import.js"));
  const input = dom.mount.querySelector(".docx-file-input");
  input.files = [{ name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  input.fire("change");
  await settle();
  assert.match(dom.mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(dom.input.value, JSON.stringify(PREFILLED, null, 2), "document set never fed garbage");
  assert.equal(dom.mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
});
