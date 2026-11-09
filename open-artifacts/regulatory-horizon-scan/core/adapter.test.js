// adapter.test.js — class-LA DOCX import adapter test for the regulatory-horizon-scan
// demo (Wave W7). The page's OWN wiring is under test, not a copy: the [docx-import-wiring]
// block is extracted verbatim from ../demo/index.html and executed against a stub DOM with
// the real _shared/docx-import.js module injected in place of the dynamic import and a
// mocked globalThis.fetch standing in for POST /api/extract. Apply feeds the pasteBox path
// (the existing Add/Replace buttons stay the run path). Red until demo/index.html carries
// the Import DOCX control. Fictional regulator bulletin; the LLM never scores or ranks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier
const SCHEMA_KEY = "regulatory-horizon-scan"; // POST /api/extract schema key = artifact name
const START = "/* ---- [docx-import-wiring] ---- */";
const END = "/* ---- [/docx-import-wiring] ---- */";

const PARAS = [
  "FEDERAL PRIVACY COMMISSION — PROPOSED RULE (fictional)",
  "Breach Notification Rulemaking, NPRM. The Commission proposes requiring notification within 30 days of discovery.",
  "Comments due 2027-01-15. Published 2026-11-01. Docket FPC-2026-09.",
];
const EXPECTED_TEXT = PARAS.join("\n");
const SAMPLE = {
  items: [
    { id: "fpc-breach-nprm", title: "Breach Notification Rulemaking", jurisdiction: "US-FED", status: "proposed", itemType: "NPRM", effectiveDate: null, commentDeadline: "2027-01-15", publishedDate: "2026-11-01", summary: "Proposes requiring breach notification within 30 days of discovery.", source: "Federal Privacy Commission (fictional)", provenance: "primary", link: "https://example.gov/fpc-breach-nprm" },
  ],
};
const EDITED = { items: [{ ...SAMPLE.items[0], summary: "EDITED BY REVIEWER — 30-day breach notification proposed." }] };

/* ---------- fixture: a real .docx (STORE) via docio's writer ---------- */
const docxFile = (name) => {
  const b = writeDocx(PARAS);
  return { name, size: b.length, arrayBuffer: async () => new Uint8Array(b).slice().buffer };
};

/* ---------- minimal DOM stub (wireDocxImport stub pattern from _shared/docx-import.test.js) ---------- */
class StubElement {
  constructor() { this._html = ""; this._kids = {}; this.handlers = {}; this.clicks = 0; this.files = null; this.disabled = false; this.value = ""; this.textContent = ""; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._kids = {}; }
  querySelector(sel) { if (!this._kids[sel]) this._kids[sel] = new StubElement(); return this._kids[sel]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  click() { this.clicks++; if (typeof this.onclick === "function") this.onclick(); for (const f of this.handlers.click ?? []) f(); }
  fire(type) { for (const f of this.handlers[type] ?? []) f(); }
}
const settle = () => new Promise((r) => setTimeout(r, 25));

function stubDom(els = {}) {
  const mount = new StubElement();
  const map = { docxImportMount: mount, rhsJson: new StubElement(), rhsStatus: new StubElement(), pasteBox: new StubElement(), input: new StubElement(), asOf: new StubElement(), ...els };
  return { mount, map, document: { getElementById: (id) => map[id] ?? null } };
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

test("static: D1-pinned dynamic-import line, mount above the paste box, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}").catch(() => import("/open-artifacts/_shared/docx-import.js"));`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="pasteBox"'), "control sits above the feed paste box it feeds");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('id="pasteBox"') && HTML.includes('id="addBtn"') && HTML.includes('id="replaceBtn"') && HTML.includes('id="input"'), "existing inputs untouched");
});

test("static: the wiring only ever touches the mount, its own preview ids, and the paste box", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^\"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids, ["docxImportMount", "pasteBox", "rhsJson", "rhsStatus"], "additive: no other page input is referenced");
});

test("readDocxText on the real fixture returns the text the page will send to /api/extract", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: real .docx → POST /api/extract (schema regulatory-horizon-scan) → editable preview + chip, paste box untouched", async () => {
  const { mount, map, document } = stubDom();
  map.pasteBox.value = "user's pasted items";
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { items: "high" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    const input = mount.querySelector(".docx-file-input");
    input.files = [docxFile("fpc-nprm.docx")];
    input.fire("change");
    await settle();
    assert.equal(fetchMock.calls.length, 1, "exactly one extraction call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    const body = JSON.parse(fetchMock.calls[0].opts.body);
    assert.equal(body.schema, SCHEMA_KEY, "schema key is the artifact name");
    assert.equal(body.text, EXPECTED_TEXT, "the imported bulletin text is what is sent");
    assert.match(mount.innerHTML, /docx-extract-json/, "editable extraction textarea in the preview");
    assert.match(mount.innerHTML, /Breach Notification Rulemaking/, "extracted item visible");
    assert.match(mount.innerHTML, /docx-chip[^>]*>items: high/, "per-field confidence chip shown");
    assert.doesNotMatch(mount.innerHTML, /docx-chip flag/, "high confidence is not flagged");
    assert.equal(map.pasteBox.value, "user's pasted items", "the paste box is not clobbered before the explicit Apply");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: low confidence flags the chip for review", async () => {
  const { mount, document } = stubDom();
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { items: "low" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("fpc-nprm.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-chip flag/, "low confidence is flagged");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: Apply reads the USER-EDITED items and stages them in the paste box (Add/Replace stay the run path)", async () => {
  const { mount, map, document } = stubDom();
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { items: "high" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("fpc-nprm.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    map.rhsJson.value = JSON.stringify(EDITED); // the reviewer edits before applying
    mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    const lines = map.pasteBox.value.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(lines.length, 1, "one JSON item per line — the pasteBox format parsePaste already accepts");
    assert.equal(lines[0].summary, EDITED.items[0].summary, "the USER-EDITED value landed, not the raw model output");
    assert.match(map.rhsStatus.textContent, /UNVERIFIED/i, "status reminds the reviewer these are unverified feed entries");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: ok:false → fail-closed banner + raw bulletin text preserved, paste box untouched", async () => {
  const { mount, map, document } = stubDom();
  map.pasteBox.value = "user's pasted items";
  const fetchMock = mockFetch({ ok: false, status: 400, body: { ok: false, error: "INVALID", message: "The extracted structure did not match the artifact's schema." } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("fpc-nprm.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-err/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /docx-fallback/, "fallback textarea offered");
    assert.match(mount.innerHTML, /30 days of discovery/, "the imported bulletin text is preserved, never lost");
    assert.equal(map.pasteBox.value, "user's pasted items", "existing paste box untouched");
    mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    assert.match(mount.innerHTML, /docx-import-warning/, "Apply in the fallback state warns instead of applying");
    assert.equal(map.pasteBox.value, "user's pasted items", "still untouched");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: fetch throws → same fail-closed fallback, text preserved", async () => {
  const { mount, map, document } = stubDom();
  const fetchMock = mockFetch(new Error("network down"));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("fpc-nprm.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-err/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /FEDERAL PRIVACY COMMISSION/, "raw bulletin text preserved");
    assert.equal(map.pasteBox.value, "", "nothing staged");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: non-docx junk file → inline error, paste box untouched", async () => {
  const { mount, map, document } = stubDom();
  map.pasteBox.value = "user's pasted items";
  await runWiring(document, await import("../../_shared/docx-import.js"));
  mount.querySelector(".docx-file-input").files = [{ name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  mount.querySelector(".docx-file-input").fire("change");
  await settle();
  assert.match(mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(map.pasteBox.value, "user's pasted items", "paste box never fed garbage");
  assert.equal(mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const { mount, map, document } = stubDom();
  map.pasteBox.value = "user's pasted items";
  await runWiringImportFails(document);
  assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(map.pasteBox.value, "user's pasted items", "existing input value untouched");
});
