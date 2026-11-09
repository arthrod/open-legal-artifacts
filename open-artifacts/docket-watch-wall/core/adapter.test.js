// adapter.test.js — class-LA DOCX import adapter test for the docket-watch-wall demo
// (Wave W7). The page's OWN wiring is under test, not a copy: the [docx-import-wiring]
// block is extracted verbatim from ../demo/index.html and executed against a stub DOM with
// the real _shared/docx-import.js module injected in place of the dynamic import and a
// mocked globalThis.fetch standing in for POST /api/extract. Apply fills the existing
// feed JSON textarea and clicks the existing Review-wall button (the page's run path).
// The extraction targets the feed-JSON entry shape directly — parties are ALWAYS arrays.
// Red until demo/index.html carries the Import DOCX control. Fictional docket report.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier
const SCHEMA_KEY = "docket-watch-wall"; // POST /api/extract schema key = artifact name
const START = "/* ---- [docx-import-wiring] ---- */";
const END = "/* ---- [/docx-import-wiring] ---- */";

const PARAS = [
  "UNITED STATES DISTRICT COURT — N.D. Ill. (fictional)",
  "Meridian Foods, Inc. v. Bluecrest Logistics LLC — Hon. A. Whitfield — commercial-litigation",
  "Entry 12 — 2026-04-02 — Motion for sanctions for discovery misconduct filed by plaintiffs.",
];
const EXPECTED_TEXT = PARAS.join("\n");
const SAMPLE = {
  entries: [
    { id: "12", date: "2026-04-02", description: "Motion for sanctions for discovery misconduct filed by plaintiffs.",
      case: { name: "Meridian Foods, Inc. v. Bluecrest Logistics LLC", judge: "Hon. A. Whitfield", parties: ["Meridian Foods, Inc.", "Bluecrest Logistics LLC"], practiceArea: "commercial-litigation", court: "N.D. Ill. (fictional)" } },
  ],
};
const EDITED = { entries: [{ ...SAMPLE.entries[0], description: "EDITED BY REVIEWER — sanctions motion." }] };

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
  const map = { docxImportMount: mount, dwJson: new StubElement(), dwStatus: new StubElement(), feed: new StubElement(), run: new StubElement(), ...els };
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

test("static: D1-pinned dynamic-import line, mount above the feed textarea, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}").catch(() => import("/open-artifacts/_shared/docx-import.js"));`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="feed"'), "control sits above the feed textarea it fills");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('id="feed"') && HTML.includes('id="run"') && HTML.includes('id="mark"') && HTML.includes('id="ics"'), "existing feed controls untouched");
});

test("static: the wiring only ever touches the mount, its own preview ids, the feed, and the run button", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^\"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids, ["docxImportMount", "dwJson", "dwStatus", "feed", "run"], "additive: no other page input is referenced");
});

test("readDocxText on the real fixture returns the text the page will send to /api/extract", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: real .docx → POST /api/extract (schema docket-watch-wall) → editable preview + chip, feed untouched", async () => {
  const { mount, map, document } = stubDom();
  map.feed.value = "[]";
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { entries: "high" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    const input = mount.querySelector(".docx-file-input");
    input.files = [docxFile("docket-report.docx")];
    input.fire("change");
    await settle();
    assert.equal(fetchMock.calls.length, 1, "exactly one extraction call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    const body = JSON.parse(fetchMock.calls[0].opts.body);
    assert.equal(body.schema, SCHEMA_KEY, "schema key is the artifact name");
    assert.equal(body.text, EXPECTED_TEXT, "the imported docket report text is what is sent");
    assert.match(mount.innerHTML, /docx-extract-json/, "editable extraction textarea in the preview");
    assert.match(mount.innerHTML, /Motion for sanctions/, "extracted entry visible");
    assert.match(mount.innerHTML, /docx-chip[^>]*>entries: high/, "per-field confidence chip shown");
    assert.doesNotMatch(mount.innerHTML, /docx-chip flag/, "high confidence is not flagged");
    assert.equal(map.feed.value, "[]", "the feed textarea is not clobbered before the explicit Apply");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: low confidence flags the chip for review", async () => {
  const { mount, document } = stubDom();
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { entries: "low" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("docket-report.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-chip flag/, "low confidence is flagged");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: Apply reads the USER-EDITED entries, fills the feed JSON, and clicks the existing Review-wall path", async () => {
  const { mount, map, document } = stubDom();
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { entries: "high" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("docket-report.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    map.dwJson.value = JSON.stringify(EDITED); // the reviewer edits before applying
    mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    const applied = JSON.parse(map.feed.value);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].description, EDITED.entries[0].description, "the USER-EDITED value landed, not the raw model output");
    assert.ok(Array.isArray(applied[0].case.parties), "parties stay an array in the applied feed");
    assert.deepEqual(applied[0].case.parties, ["Meridian Foods, Inc.", "Bluecrest Logistics LLC"]);
    assert.equal(map.run.clicks, 1, "the page's existing Review-wall run path is triggered");
    assert.match(map.dwStatus.textContent, /entries/, "status confirms what landed");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: ok:false → fail-closed banner + raw report text preserved, feed untouched", async () => {
  const { mount, map, document } = stubDom();
  map.feed.value = "[]";
  const fetchMock = mockFetch({ ok: false, status: 502, body: { ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable." } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("docket-report.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-err/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /docx-fallback/, "fallback textarea offered");
    assert.match(mount.innerHTML, /Hon\. A\. Whitfield/, "the imported report text is preserved, never lost");
    assert.equal(map.feed.value, "[]", "existing feed untouched");
    mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    assert.match(mount.innerHTML, /docx-import-warning/, "Apply in the fallback state warns instead of applying");
    assert.equal(map.feed.value, "[]", "still untouched");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: fetch throws → same fail-closed fallback, text preserved", async () => {
  const { mount, map, document } = stubDom();
  const fetchMock = mockFetch(new Error("network down"));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("docket-report.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-err/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /UNITED STATES DISTRICT COURT/, "raw report text preserved");
    assert.equal(map.feed.value, "", "nothing applied");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const { mount, map, document } = stubDom();
  map.feed.value = "[]";
  await runWiringImportFails(document);
  assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(map.feed.value, "[]", "existing feed value untouched");
});
