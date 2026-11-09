// adapter.test.js — class-LA DOCX import adapter test for the criminal-charge-reality-check
// demo (Wave W5 FINISH). The page's OWN wiring is under test, not a copy: the
// [docx-import-wiring] block is extracted verbatim from ../demo/index.html and executed
// against a stub DOM with the real _shared/docx-import.js module injected in place of the
// dynamic import, and globalThis.fetch mocked for POST /api/extract. Red until
// demo/index.html carries the Import DOCX control above the charge-facts box. The fixture
// is a real archive built by docio's writeDocx. Fictional charging instrument.
//
// Behavior pinned here (per-artifact note): upload previews the proposed ChargeInput with
// confidence chips; Apply fills the charge-facts #input textarea; when the class is
// uncertain the applied JSON carries uncertain[] with EVERY candidate so the frozen
// realityCheckMulti runs per candidate — the wiring must never collapse candidates and
// never auto-click "Run reality check".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { realityCheckMulti } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional charging instrument (the DOCX under import).
const PARAS = [
  "Superior Court of Fiction County (example)",
  "State v. A. Ruiz (fictional)",
  "Filed: November 2, 2026",
  "COUNT 1 — XPL-911.20, fictional value-dependent offense: the defendant possessed",
  "stolen property whose value has not yet been determined by the magistrate.",
  "The defendant is held in custody pending arraignment; one prior conviction is alleged.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema criminal-charge-reality-check).
const EXTRACTED = {
  jurisdiction: "NY",
  chargeClass: null,
  charge: "Fictional value-dependent offense (code XPL-911.20)",
  filedOn: "2026-11-02",
  client: { priorConvictions: 1, detained: true },
  uncertain: [
    { field: "chargeClass", candidates: ["felony_class_D", "felony_class_E"], reason: "degree depends on value of property" },
  ],
};
const CONFIDENCE = { jurisdiction: "high", chargeClass: "low", charge: "high", filedOn: "high", client: "high", uncertain: "high" };

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
  for (const id of ["input", "run", "out", "err", "example"]) els[id] = new StubElement();
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
  input.files = [docxFile("complaint.docx")];
  input.fire("change");
  await settle();
  return dom;
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic import, mount above the charge-facts box, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="input"'), "control sits above the charge-facts textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('schema: "criminal-charge-reality-check"'), "extraction calls POST /api/extract with the artifact schema key");
});

test("static: the wiring touches only the mount and the charge-facts box — Run is never auto-clicked", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["docxImportMount", "input"],
    "additive: fills the charge-facts textarea only; 'run' (the reality-check gate) is NOT referenced");
});

test("readDocxText on the real fixture returns the charging narrative the page will extract from", async () => {
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
    assert.deepEqual(body, { schema: "criminal-charge-reality-check", text: EXPECTED_TEXT });
    assert.match(dom.mount.innerHTML, /docx-import-preview/, "preview panel shown");
    assert.match(dom.mount.innerHTML, /xchip[^>]*>chargeClass: low/, "low-confidence chip flagged for review");
    assert.match(dom.mount.innerHTML, /class="x-charge"[^>]*value="Fictional value-dependent offense \(code XPL-911\.20\)"/, "verbatim charge description in an editable field");
    assert.match(dom.mount.innerHTML, /value of property/, "uncertainty reason surfaced");
    assert.match(dom.mount.innerHTML, /felony_class_E/, "both candidates visible — never collapsed");
    assert.equal(dom.els["input"].value, "", "charge-facts box untouched before the explicit Apply");
  } finally { restore(); }
});

test("wiring: explicit Apply fills the charge-facts box with a ChargeInput whose uncertain[] carries BOTH candidates; per-candidate runs preserved", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    // the browser carries the proposed values in the preview inputs; the user edited nothing
    dom.mount.querySelector(".x-jur").value = EXTRACTED.jurisdiction;
    dom.mount.querySelector(".x-charge").value = EXTRACTED.charge;
    dom.mount.querySelector(".x-filed").value = EXTRACTED.filedOn;
    EXTRACTED.uncertain[0].candidates.forEach((c, i) => { dom.mount.querySelector(".x-cand-" + i).value = c; });
    const xc = dom.mount.querySelector(".x-client");
    if (xc) xc.value = JSON.stringify(EXTRACTED.client);
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    const applied = JSON.parse(dom.els["input"].value);
    assert.equal(applied.jurisdiction, "NY");
    assert.equal(applied.charge, "Fictional value-dependent offense (code XPL-911.20)");
    assert.equal(applied.filedOn, "2026-11-02");
    assert.deepEqual(applied.client, { priorConvictions: 1, detained: true });
    const unc = applied.uncertain?.find((u) => u.field === "chargeClass");
    assert.ok(unc, "uncertain[] block applied");
    assert.deepEqual(unc.candidates, ["felony_class_D", "felony_class_E"], "every candidate survives the apply");
    // the frozen core fans out per candidate — uncertainty is never collapsed
    const multi = realityCheckMulti(applied);
    assert.equal(multi.reports.length, 2, "both candidate classes run");
    assert.deepEqual(multi.reports.map((r) => r.chargeClass), ["felony_class_D", "felony_class_E"]);
    assert.equal(dom.els["run"].handlers.click, undefined, "the Run reality check button was never clicked by the wiring");
  } finally { restore(); }
});

test("gate: a user-editable candidate field wins over the proposal (edits flow into uncertain[])", async () => {
  const restore = okFetch([]);
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    const candInputs = ["felony_class_D", "misdemeanor"].map((v, i) => {
      const el = dom.mount.querySelector(".x-cand-" + i);
      assert.ok(el, "candidate input " + i + " present");
      el.value = v;
      return v;
    });
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    const applied = JSON.parse(dom.els["input"].value);
    assert.deepEqual(applied.uncertain.find((u) => u.field === "chargeClass").candidates, candInputs, "user-EDITED candidates win");
    const multi = realityCheckMulti(applied);
    assert.deepEqual(multi.reports.map((r) => r.chargeClass), ["felony_class_D", "misdemeanor"], "the edited fan-out runs per candidate");
  } finally { restore(); }
});

test("wiring: ok:false from /api/extract → fail-closed banner + raw text preserved; input only filled on explicit Apply", async () => {
  const restore = mockFetch(async () => jsonRes(502, { ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable" }));
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw document text offered in a fallback textarea");
    assert.match(dom.mount.innerHTML, /November 2, 2026/, "text preserved, never lost");
    assert.equal(dom.els["input"].value, "", "existing inputs untouched without Apply");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(dom.els["input"].value, EXPECTED_TEXT, "Apply in fallback mode still lands the document text in the facts box");
    assert.match(dom.mount.querySelector(".docx-import-preview").innerHTML, /type the charge facts yourself|facts yourself/, "honest fallback note surfaced");
  } finally { restore(); }
});

test("wiring: fetch throws → same fail-closed fallback", async () => {
  const restore = mockFetch(async () => { throw new Error("network down"); });
  try {
    const dom = await importAndPreview(await import("../../_shared/docx-import.js"));
    assert.match(dom.mount.innerHTML, /xfail/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="xtext"/, "raw document text offered");
    assert.equal(dom.els["input"].value, "", "untouched before Apply");
  } finally { restore(); }
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const dom = stubDom();
  dom.els["input"].value = "user's pasted charge facts";
  await runWiringImportFails(dom.document);
  assert.match(dom.mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(dom.els["input"].value, "user's pasted charge facts", "existing input value untouched");
});

test("wiring: junk (non-docx) file → inline error, Apply unreachable, inputs untouched", async () => {
  const dom = stubDom();
  await runWiring(dom.document, await import("../../_shared/docx-import.js"));
  const input = dom.mount.querySelector(".docx-file-input");
  input.files = [{ name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  input.fire("change");
  await settle();
  assert.match(dom.mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(dom.els["input"].value, "", "target never fed garbage");
  assert.equal(dom.mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
});
