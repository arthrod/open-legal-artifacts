// adapter.test.js — class-LA DOCX import adapter test for the entity-compliance-calendar
// demo (Wave W3, FINISH round FA3). The page's OWN wiring is under test, not a copy: the
// [docx-import-wiring] block is extracted verbatim from ../demo/index.html and executed
// against a stub DOM with the real _shared/docx-import.js module injected in place of the
// dynamic import, and globalThis.fetch mocked for POST /api/extract. Red until
// demo/index.html carries the Import DOCX control in a new input section. The fixture is a
// real archive built by docio's writeDocx. Fictional Secretary-of-State record.
//
// Behavior pinned here (per-artifact note): upload fills an editable entities-JSON preview
// (names/dates verbatim, unreadable dates null); Apply fills the #entIn entities box; the
// "Rebuild calendar" button — never auto-clicked by the import — recomputes the matrix via
// the tested buildMatrix with the worked example's rule base.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { buildMatrix } from "./core.js";
import EXAMPLE from "../demo/example.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional SoS / formation record (the DOCX under import). One date illegible → null.
const PARAS = [
  "DELAWARE DIVISION OF CORPORATIONS — STATEMENT OF STATUS (fictional)",
  "Entity: Northwind Holdings II, Inc. | File no. 7724109 | Corporation | Date formed: April 18, 2022 | Status: active.",
  "Entity: Kestrel Fog LLC | Jurisdiction: California | LLC | Date formed: [illegible] | Status: active.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema entity-compliance-calendar).
const EXTRACTED = {
  entities: [
    { id: "E-1", name: "Northwind Holdings II, Inc.", jurisdiction: "US-DE", type: "corp", formedOn: "2022-04-18", status: "active" },
    { id: "E-2", name: "Kestrel Fog LLC", jurisdiction: "US-CA", type: "llc", formedOn: null, status: "active" },
  ],
};
const CONFIDENCE = { entities: "low" }; // dates hard to read → flagged for review

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
  for (const id of ["entIn", "entBtn", "entMsg"]) els[id] = new StubElement();
  return { mount, els, document: { getElementById: (id) => els[id] ?? null } };
}

/* ---------- fetch mocking ---------- */
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function mockFetch(fn) { const prev = globalThis.fetch; globalThis.fetch = fn; return () => { globalThis.fetch = prev; }; }
const okFetch = (calls) => mockFetch(async (url, opts) => { calls.push({ url, opts }); return jsonRes(200, { ok: true, data: EXTRACTED, confidence: CONFIDENCE, source: "gpt-5-nano" }); });

/* ---------- extract + execute the page's actual wiring blocks ---------- */
const blocks = {};
for (const name of ["docx-import-wiring", "entities-rebuild-wiring"]) {
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
  input.files = [docxFile("sos-record.docx")];
  input.fire("change");
  await settle();
  return dom;
}

// The rebuild handler's one free variable: setEntities(entities) rebuilds and returns the matrix.
function runRebuildWiring(document, setEntities) {
  new Function("document", "setEntities", blocks["entities-rebuild-wiring"])(document, setEntities);
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic import, input section with mount above the entities box, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  const section = HTML.indexOf("Import entities");
  assert.ok(section > 0, "the new input section is present");
  assert.ok(HTML.indexOf('id="docxImportMount"') > section, "mount sits inside the input section");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="entIn"'), "control sits above the entities textarea");
  assert.ok(HTML.indexOf('id="entIn"') < HTML.indexOf('id="entBtn"'), "Rebuild button follows the entities textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('schema: "entity-compliance-calendar"'), "extraction calls POST /api/extract with the artifact schema key");
});

test("static: the import wiring touches only the mount and the entities box — Rebuild is never auto-clicked", () => {
  const ids = [...blocks["docx-import-wiring"].matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["docxImportMount", "entIn"],
    "additive: fills the entities box only; 'entBtn' (the rebuild gate) is NOT referenced by the import wiring");
});

test("readDocxText on the real fixture returns the SoS record text the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: .docx → POST /api/extract → editable entities-JSON preview with confidence chip; nothing applied before explicit Apply", async () => {
  const calls = [];
  const restore = okFetch(calls);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.equal(calls.length, 1, "exactly one /api/extract call");
    assert.equal(calls[0].url, "/api/extract");
    const body = JSON.parse(calls[0].opts.body);
    assert.deepEqual(body, { schema: "entity-compliance-calendar", text: EXPECTED_TEXT });
    assert.match(dom.mount.innerHTML, /docx-import-preview/, "preview panel shown");
    assert.match(dom.mount.innerHTML, /xchip[^>]*flag[^>]*>entities: low/, "low-confidence chip flagged for review");
    assert.match(dom.mount.innerHTML, /Northwind Holdings II, Inc\./, "verbatim legal name in the preview");
    assert.match(dom.mount.innerHTML, /formedOn(?:&quot;|"): null/, "unreadable formation date surfaced as null, never guessed (quotes HTML-escaped in the textarea)");
    assert.ok(dom.mount.querySelector(".xent"), "entities JSON is an editable textarea");
    assert.equal(dom.els["entIn"].value, "", "entities box untouched before the explicit Apply");
  } finally { restore(); }
});

test("wiring: explicit Apply fills the entities box (user edits win); Rebuild stays manual", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    const edited = JSON.stringify(EXTRACTED.entities.map((e) => ({ ...e, status: "active" })), null, 2);
    dom.mount.querySelector(".xent").value = edited; // the user edited the JSON in the preview
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(dom.els["entIn"].value, edited, "user-EDITED entities JSON wins over the raw proposal");
    assert.equal(dom.els["entBtn"].handlers.click, undefined, "the Rebuild calendar button was never clicked by the wiring");
  } finally { restore(); }
});

test("gate: the applied entities feed the tested buildMatrix against the worked-example rule base", () => {
  const m = buildMatrix({ ...EXAMPLE, entities: EXTRACTED.entities });
  assert.equal(m.counts.cells, EXTRACTED.entities.length * EXAMPLE.obligations.length, "matrix rebuilds for the imported entities");
  assert.ok(m.entities.every((e) => EXTRACTED.entities.some((x) => x.name === e.name)), "verbatim names carried through");
});

test("rebuild wiring: valid entities JSON in the box → setEntities rebuild; the message names the cell count", () => {
  const calls = [];
  const dom = stubDom();
  runRebuildWiring(dom.document, (entities) => { calls.push(entities); return buildMatrix({ ...EXAMPLE, entities }); });
  dom.els["entIn"].value = JSON.stringify(EXTRACTED.entities);
  dom.els["entBtn"].fire("click");
  assert.equal(calls.length, 1, "setEntities called exactly once");
  assert.equal(calls[0].length, 2);
  const cells = EXTRACTED.entities.length * EXAMPLE.obligations.length;
  assert.match(dom.els["entMsg"].textContent, new RegExp(`Rebuilt ${cells} cells`), "result surfaced to the user");
});

test("rebuild wiring: invalid JSON → fail-closed message, no rebuild, prior calendar intact", () => {
  const calls = [];
  const dom = stubDom();
  runRebuildWiring(dom.document, (entities) => { calls.push(entities); return buildMatrix({ ...EXAMPLE, entities }); });
  dom.els["entIn"].value = "{not json";
  dom.els["entBtn"].fire("click");
  assert.equal(calls.length, 0, "setEntities never called on invalid input");
  assert.match(dom.els["entMsg"].textContent, /Not applied/, "honest error surfaced");
});

test("wiring: ok:false from /api/extract → fail-closed banner + raw text preserved; entities box only filled on explicit Apply", async () => {
  const restore = mockFetch(async () => jsonRes(502, { ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable" }));
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw record text offered in a fallback textarea");
    assert.match(dom.mount.innerHTML, /Northwind Holdings II/, "text preserved, never lost");
    assert.equal(dom.els["entIn"].value, "", "existing inputs untouched without Apply");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(dom.els["entIn"].value, EXPECTED_TEXT, "Apply in fallback mode still lands the record text in the entities box");
    assert.match(dom.mount.querySelector(".docx-import-preview").innerHTML, /structure it into entities JSON/, "honest fallback note surfaced");
  } finally { restore(); }
});

test("wiring: fetch throws → same fail-closed fallback", async () => {
  const restore = mockFetch(async () => { throw new Error("network down"); });
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw record text offered");
    assert.equal(dom.els["entIn"].value, "", "untouched before Apply");
  } finally { restore(); }
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const dom = stubDom();
  dom.els["entIn"].value = "user's pasted entities JSON";
  await runWiringImportFails(dom.document);
  assert.match(dom.mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(dom.els["entIn"].value, "user's pasted entities JSON", "existing input value untouched");
});

test("wiring: junk (non-docx) file → inline error, Apply unreachable, entities box untouched", async () => {
  const dom = stubDom();
  await runWiring(dom.document, await import("../../_shared/docx-import.js"));
  const input = dom.mount.querySelector(".docx-file-input");
  input.files = [{ name: "sos.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  input.fire("change");
  await settle();
  assert.match(dom.mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(dom.els["entIn"].value, "", "target never fed garbage");
  assert.equal(dom.mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
});
