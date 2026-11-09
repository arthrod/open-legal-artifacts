// adapter.test.js — class-LA DOCX import adapter test for the obligations-checker
// demo (Wave W3). The page's OWN wiring block is extracted verbatim from
// ../demo/index.html and executed against a stub DOM with the real
// _shared/docx-import.js injected in place of the dynamic import, and
// globalThis.fetch mocked to stand in for POST /api/extract (schema
// "obligations-checker" — the F3 exemplar registered in vt-val/api/validate.ts).
// Red until demo/index.html carries the Import DOCX control; green after
// wiring. The DOCX fixture is a real archive built by docio's writeDocx
// (STORE). Fictional contract text.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText, wireDocxImport } from "../../_shared/docx-import.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier
const SCHEMA_KEY = "obligations-checker"; // POST /api/extract registry key (validate.ts exemplar)

const PARAS = [
  "MASTER SERVICES AGREEMENT (fictional excerpt)",
  "§ 4.1 Customer shall pay the Phase 2 milestone fee of $48,000 within thirty (30) days of acceptance of the Phase 2 deliverables, and in no event later than October 30, 2026.",
  "§ 5.4 Supplier shall notify Customer of any actual or reasonably suspected security incident affecting the Services within seventy-two (72) hours of discovery of such incident.",
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
  const els = {
    docxImportMount: new StubElement(),
    asof: new StubElement(),
    duesoon: new StubElement(),
    input: new StubElement(),
    run: new StubElement(),
    paste: new StubElement(),
  };
  els.asof.value = "2026-11-08";
  els.duesoon.value = "21";
  return { mount: els.docxImportMount, els, document: { getElementById: (id) => els[id] ?? null } };
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

/* ---------- /api/extract mocking ---------- */
const API_DATA = {
  obligations: [
    { id: "OBL-4-1", clause: "§ 4.1", party: "Customer", owner: null, verb: "pay", text: "pay the Phase 2 milestone fee of $48,000", dueDate: "2026-10-30", condition: null, recurrence: null, amount: 48000, sourceQuote: "Customer shall pay the Phase 2 milestone fee of $48,000 within thirty (30) days of acceptance of the Phase 2 deliverables, and in no event later than October 30, 2026." },
    { id: "OBL-5-4", clause: "§ 5.4", party: "Supplier", owner: null, verb: "notify", text: "notify Customer of any security incident within 72 hours of discovery", dueDate: null, condition: "within 72 hours of discovery of a security incident", recurrence: null, amount: null, sourceQuote: "Supplier shall notify Customer of any actual or reasonably suspected security incident affecting the Services within seventy-two (72) hours of discovery of such incident." },
  ],
};

function withFetch(mock, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = mock;
  return fn().finally(() => { globalThis.fetch = orig; });
}
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/* ---------- tests ---------- */

test("static: D1-pinned dynamic-import line, additive mount above the register input, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="input"'), "control sits above the register JSON textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes(`schema: "${SCHEMA_KEY}"`), "extraction POSTs under the registered schema key");
  assert.ok(HTML.includes('fetch("/api/extract"'), "extraction calls the shared route");
  assert.ok(HTML.includes("DOCX import is available on the hosted site."), "D1 fail-closed hint copy");
  assert.ok(HTML.includes('class="conf-chip'), "per-field confidence chips are styled in house conventions");
});

test("static: the wiring only ever touches the mount, the register input, its run button, and the fallback paste box", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["docxImportMount", "asof", "duesoon", "input", "run", "paste"], "additive: no other page input is referenced");
});

test("readDocxText on the real fixture returns the contract text the extraction will carry", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: real .docx + mocked /api/extract ok → editable JSON preview + confidence chips; Apply fills the register and fires the existing run path", async () => {
  const { mount, els, document } = stubDom();
  const calls = [];
  await withFetch(
    async (url, opts) => { calls.push({ url, opts }); return jsonResponse(200, { ok: true, data: API_DATA, confidence: { obligations: "high" }, source: "gpt-5-nano" }); },
    async () => {
      await runWiring(document, { wireDocxImport });
      const input = mount.querySelector(".docx-file-input");
      input.files = [docxFile("msa-excerpt.docx")];
      input.fire("change");
      await settle();
    },
  );
  assert.equal(calls.length, 1, "exactly one extraction call");
  assert.equal(calls[0].url, "/api/extract");
  assert.equal(calls[0].opts.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].opts.body), { schema: SCHEMA_KEY, text: EXPECTED_TEXT });
  assert.match(mount.innerHTML, /docx-extract-json/, "editable JSON preview rendered");
  assert.match(mount.innerHTML, /obligations: high/, "confidence chip shows the field verdict");
  assert.match(mount.innerHTML, /2026-11-08/, "preview register carries the page's current as-of date");
  assert.match(mount.innerHTML, /dueSoonDays/, "preview register carries the page's due-soon setting");
  assert.equal(els.input.value, "", "register input untouched before the explicit Apply");
  // user edits the preview JSON (here: trims to one obligation and renames the owner)
  const edited = { asOf: "2026-11-08", settings: { dueSoonDays: 21 }, obligations: [API_DATA.obligations[0]], satisfaction: [] };
  mount.querySelector(".docx-extract-json").value = JSON.stringify(edited, null, 2);
  mount.querySelector(".docx-apply-btn").fire("click");
  assert.equal(els.input.value, JSON.stringify(edited, null, 2), "user-EDITED values land in the register input");
  assert.ok(els.run.clicks >= 1, "the page's existing Apply-JSON-and-rebuild path is invoked");
  assert.equal(els.paste.value, "", "paste box untouched on the success path");
});

test("wiring: ok:false → fail-closed banner + raw text preserved; Apply lands the text in the paste box, register untouched", async () => {
  const { mount, els, document } = stubDom();
  await withFetch(
    async () => jsonResponse(502, { ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable or returned an unusable extraction — nothing was served." }),
    async () => {
      await runWiring(document, { wireDocxImport });
      const input = mount.querySelector(".docx-file-input");
      input.files = [docxFile("msa-excerpt.docx")];
      input.fire("change");
      await settle();
    },
  );
  assert.match(mount.innerHTML, /docx-import-error/, "fail-closed banner");
  assert.match(mount.innerHTML, /unavailable/i, "banner states the reason");
  assert.match(mount.innerHTML, /docx-import-text/, "raw document text offered in a fallback textarea");
  assert.ok(mount.innerHTML.includes("Phase 2 milestone fee"), "no text lost");
  assert.equal(els.input.value, "", "register input untouched by the failure");
  mount.querySelector(".docx-apply-btn").fire("click");
  assert.equal(els.paste.value, EXPECTED_TEXT, "Apply in the fallback state lands the raw text in the source-document paste box");
  assert.equal(els.input.value, "", "register still untouched — nothing unstructured is applied");
});

test("wiring: fetch throws → same fail-closed fallback, register untouched", async () => {
  const { mount, els, document } = stubDom();
  await withFetch(
    async () => { throw new TypeError("Failed to fetch"); },
    async () => {
      await runWiring(document, { wireDocxImport });
      const input = mount.querySelector(".docx-file-input");
      input.files = [docxFile("msa-excerpt.docx")];
      input.fire("change");
      await settle();
    },
  );
  assert.match(mount.innerHTML, /docx-import-error/, "fail-closed banner");
  assert.match(mount.innerHTML, /docx-import-text/, "raw document text preserved");
  assert.equal(els.input.value, "", "register input untouched");
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const { mount, els, document } = stubDom();
  els.input.value = "user's existing register JSON";
  await runWiringImportFails(document);
  assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(els.input.value, "user's existing register JSON", "existing input value untouched");
});

test("wiring: junk (non-docx) file → inline error, Apply unreachable, register untouched", async () => {
  const { mount, els, document } = stubDom();
  await withFetch(
    async () => jsonResponse(200, { ok: true, data: API_DATA, confidence: { obligations: "high" } }),
    () => runWiring(document, { wireDocxImport }),
  );
  const input = mount.querySelector(".docx-file-input");
  input.files = [{ name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  input.fire("change");
  await settle();
  assert.match(mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(els.input.value, "", "register never fed garbage");
  assert.equal(mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
});
