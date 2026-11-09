// adapter.test.js — class-LA DOCX import adapter test for the intake-queue demo (Wave W4).
// The page's OWN wiring is under test, not a copy: the [docx-import-wiring] block is
// extracted verbatim from ../demo/index.html and executed against a stub DOM with the
// real _shared/docx-import.js module injected in place of the dynamic import, and
// globalThis.fetch mocked for POST /api/extract. Red until demo/index.html carries the
// Import DOCX control in the paste-&-verify section. The fixture is a real archive built
// by docio's writeDocx. Fictional intake email.
//
// Behavior pinned here (per-artifact note): upload fills #ing-source; the extraction
// proposes {client, opposing, matterType, deadlineSeen} into the editable preview; Apply
// fills the four paste-&-verify fields; the user STILL verifies through the tested
// ingestSubmission gate — the wiring must never auto-click "Verify & add to queue".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { ingestSubmission } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional enquiry email (the DOCX under import).
const PARAS = [
  "From: m.okafor@example.org (fictional)",
  "Our company Northgate Tool Works LLC was served with a complaint filed by Brightline Capital Partners LP over a machine-service contract.",
  "The seller's counsel says our answer is due December 18, 2026. Please call back this week.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema intake-queue).
const EXTRACTED = {
  client: { name: "Northgate Tool Works LLC" },
  opposing: { name: "Brightline Capital Partners LP" },
  matterType: "contract dispute",
  deadlineSeen: { date: "2026-12-18", quote: "our answer is due December 18, 2026" },
};
const CONFIDENCE = { client: "high", opposing: "high", matterType: "low", deadlineSeen: "high" };

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
  for (const id of ["ing-source", "ing-client", "ing-opposing", "ing-matter", "ing-deadline", "ing-go", "ing-out"]) els[id] = new StubElement();
  return { mount, els, document: { getElementById: (id) => els[id] ?? null } };
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
  input.files = [docxFile("enquiry.docx")];
  input.fire("change");
  await settle();
  return dom;
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic import, mount inside paste-&-verify above the source box, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}").catch(() => import("/open-artifacts/_shared/docx-import.js"));`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  const section = HTML.indexOf("New enquiry");
  assert.ok(section > 0, "paste-&-verify section present");
  assert.ok(HTML.indexOf('id="docxImportMount"') > section, "mount sits inside the paste-&-verify section");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="ing-source"'), "control sits above the source textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('schema: "intake-queue"'), "extraction calls POST /api/extract with the artifact schema key");
});

test("static: the wiring touches only the mount and the paste-&-verify fields — the verify gate button is never auto-clicked", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^\"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["docxImportMount", "ing-source", "ing-client", "ing-opposing", "ing-matter", "ing-deadline"],
    "additive: fills the source + proposed fields only; 'ing-go' (the ingestSubmission gate) is NOT referenced");
});

test("readDocxText on the real fixture returns the enquiry text the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: .docx → POST /api/extract → editable preview with confidence chips; nothing applied before explicit Apply", async () => {
  const calls = [];
  const restore = okFetch(calls);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.equal(calls.length, 1, "exactly one /api/extract call");
    assert.equal(calls[0].url, "/api/extract");
    const body = JSON.parse(calls[0].opts.body);
    assert.deepEqual(body, { schema: "intake-queue", text: EXPECTED_TEXT });
    assert.match(dom.mount.innerHTML, /docx-import-preview/, "preview panel shown");
    assert.match(dom.mount.innerHTML, /xchip[^>]*>client: high/, "high-confidence chip");
    assert.match(dom.mount.innerHTML, /xchip[^>]*flag[^>]*>matterType: low/, "low-confidence chip flagged for review");
    assert.match(dom.mount.innerHTML, /class="x-client"[^>]*value="Northgate Tool Works LLC"/, "proposed client name in an editable field");
    assert.match(dom.mount.innerHTML, /answer is due December 18, 2026/, "deadline source quote surfaced for verification");
    for (const id of ["ing-source", "ing-client", "ing-opposing", "ing-matter", "ing-deadline"]) {
      assert.equal(dom.els[id].value, "", `${id} untouched before the explicit Apply`);
    }
  } finally { restore(); }
});

test("wiring: explicit Apply fills the source + the four proposed fields (user edits win); gate stays manual", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    // the browser carries the proposed values in the preview inputs; the user edited matter type
    dom.mount.querySelector(".x-client").value = "Northgate Tool Works LLC";
    dom.mount.querySelector(".x-opposing").value = "Brightline Capital Partners LP";
    dom.mount.querySelector(".x-matter").value = "machine-service contract dispute";
    dom.mount.querySelector(".x-deadline").value = "2026-12-18";
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(dom.els["ing-source"].value, EXPECTED_TEXT, "document text fills the enquiry source box");
    assert.equal(dom.els["ing-client"].value, "Northgate Tool Works LLC");
    assert.equal(dom.els["ing-opposing"].value, "Brightline Capital Partners LP");
    assert.equal(dom.els["ing-matter"].value, "machine-service contract dispute", "user-EDITED value wins over the proposal");
    assert.equal(dom.els["ing-deadline"].value, "2026-12-18", "stated deadline date fills the deadline field");
    assert.equal(dom.els["ing-go"].handlers.click, undefined, "the Verify & add button was never clicked by the wiring");
  } finally { restore(); }
});

test("gate: the applied fields pass the tested ingestSubmission verbatim gate; a mutated name is rejected", () => {
  const applied = { client: { name: "Northgate Tool Works LLC" }, opposing: { name: "Brightline Capital Partners LP" }, matterType: "contract dispute", deadline: "2026-12-18", description: null, occurredOn: null };
  const ok = ingestSubmission(applied, EXPECTED_TEXT);
  assert.ok(ok.ok, "verbatim names clear the gate the page still runs");
  const mutated = ingestSubmission({ ...applied, client: { name: "Northgate Tool Wrks LLC" } }, EXPECTED_TEXT);
  assert.equal(mutated.ok, false, "a non-verbatim name is still rejected — the gate is never bypassed");
});

test("wiring: ok:false from /api/extract → fail-closed banner + raw text preserved; source box only filled on explicit Apply", async () => {
  const restore = mockFetch(async () => jsonRes(502, { ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable" }));
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw document text offered in a fallback textarea");
    assert.match(dom.mount.innerHTML, /December 18, 2026/, "text preserved, never lost");
    assert.equal(dom.els["ing-source"].value, "", "existing inputs untouched without Apply");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(dom.els["ing-source"].value, EXPECTED_TEXT, "Apply in fallback mode still lands the document text in the source box");
    assert.equal(dom.els["ing-client"].value, "", "no proposed names when extraction failed");
    assert.match(dom.mount.querySelector(".docx-import-preview").innerHTML, /type the names and verify as usual/, "honest fallback note surfaced");
  } finally { restore(); }
});

test("wiring: fetch throws → same fail-closed fallback", async () => {
  const restore = mockFetch(async () => { throw new Error("network down"); });
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw document text offered");
    assert.equal(dom.els["ing-source"].value, "", "untouched before Apply");
  } finally { restore(); }
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const dom = stubDom();
  dom.els["ing-source"].value = "user's pasted enquiry";
  await runWiringImportFails(dom.document);
  assert.match(dom.mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(dom.els["ing-source"].value, "user's pasted enquiry", "existing input value untouched");
});

test("wiring: junk (non-docx) file → inline error, Apply unreachable, inputs untouched", async () => {
  const dom = stubDom();
  await runWiring(dom.document, await import("../../_shared/docx-import.js"));
  const input = dom.mount.querySelector(".docx-file-input");
  input.files = [{ name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  input.fire("change");
  await settle();
  assert.match(dom.mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(dom.els["ing-source"].value, "", "target never fed garbage");
  assert.equal(dom.mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
});
