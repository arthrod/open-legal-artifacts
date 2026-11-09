// adapter.test.js — class-T DOCX import adapter test for the tabular-review demo (Wave W1).
// The page's OWN wiring is under test, not a copy: the [docx-import-wiring] block is
// extracted verbatim from ../demo/index.html and executed against a stub DOM with the
// real _shared/docx-import.js module injected in place of the dynamic import. Red until
// demo/index.html carries the Import DOCX control; green after wiring. The DOCX fixture
// is a real archive built by docio's writeDocx (STORE). Fictional contract text.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier
const TARGET_ID = "docText"; // the document-text paste box (JSON MatrixInput mode stays untouched)

const PARAS = [
  "1. Term. This Agreement commences on the Effective Date and continues for three (3) years.",
  "2. Termination. Either party may terminate this Agreement for convenience upon ninety (90) days prior written notice.",
  "3. Liability. Each party's aggregate liability shall not exceed the fees paid in the twelve (12) months preceding the claim.",
];
const EXPECTED_TEXT = PARAS.join("\n");

/* ---------- fixture: a real .docx (STORE) via docio's writer ---------- */
const docxFile = (name) => {
  const b = writeDocx(PARAS);
  return { name, size: b.length, arrayBuffer: async () => new Uint8Array(b).slice().buffer };
};

/* ---------- minimal DOM stub (wireDocxImport stub pattern from _shared/docx-import.test.js) ---------- */
class StubElement {
  constructor() { this._html = ""; this._kids = {}; this.handlers = {}; this.clicks = 0; this.files = null; this.disabled = false; this.value = ""; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._kids = {}; }
  querySelector(sel) { if (!this._kids[sel]) this._kids[sel] = new StubElement(); return this._kids[sel]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  click() { this.clicks++; for (const f of this.handlers.click ?? []) f(); }
  fire(type) { for (const f of this.handlers[type] ?? []) f(); }
}
const settle = () => new Promise((r) => setTimeout(r, 15));

function stubDom() {
  const mount = new StubElement();
  const target = new StubElement();
  const els = { docxImportMount: mount, [TARGET_ID]: target };
  return { mount, target, document: { getElementById: (id) => els[id] ?? null } };
}

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

/* ---------- tests ---------- */

test("static: D1-pinned dynamic-import line, additive mount above the paste box, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf(`id="${TARGET_ID}"`), "control sits above the document-text textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('id="jsonIn"'), "existing advanced JSON input untouched");
});

test("static: the wiring only ever touches the mount and the document-text textarea", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["docxImportMount", TARGET_ID], "additive: no other page input is referenced");
});

test("readDocxText on the real fixture returns the paragraphs the page will apply", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: real .docx → preview gates → explicit Apply fills the document-text textarea", async () => {
  const { mount, target, document } = stubDom();
  await runWiring(document, await import("../../_shared/docx-import.js"));
  assert.match(mount.innerHTML, /class="docx-import-btn"[^>]*>Import DOCX</, "control mounted");
  assert.equal(target.value, "", "target untouched before a file is chosen");
  const input = mount.querySelector(".docx-file-input");
  input.files = [docxFile("imported-agreement.docx")];
  input.fire("change");
  await settle();
  assert.match(mount.innerHTML, /docx-import-preview/, "preview panel shown before Apply");
  assert.equal(target.value, "", "preview gates: nothing lands in the textarea before the explicit Apply");
  const applyBtn = mount.querySelector(".docx-apply-btn");
  assert.equal(applyBtn.disabled, false, "Apply enabled once ready");
  applyBtn.fire("click");
  assert.equal(target.value, EXPECTED_TEXT, "DOCX text lands verbatim in the document-text textarea");
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const { mount, target, document } = stubDom();
  target.value = "user's pasted text";
  await runWiringImportFails(document);
  assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(target.value, "user's pasted text", "existing input value untouched");
});

test("wiring: junk (non-docx) file → inline error, Apply unreachable, target untouched", async () => {
  const { mount, target, document } = stubDom();
  await runWiring(document, await import("../../_shared/docx-import.js"));
  const input = mount.querySelector(".docx-file-input");
  input.files = [{ name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  input.fire("change");
  await settle();
  assert.match(mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(target.value, "", "target never fed garbage");
  const applyBtn = mount.querySelector(".docx-apply-btn");
  assert.equal(applyBtn.disabled, true, "Apply stays disabled in the error state");
});
