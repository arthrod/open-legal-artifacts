// adapter.test.js — class-LA (+ csvToSnapshot D-path) DOCX import adapter test for the
// matter-board demo (Wave W2). The page's OWN wiring is under test, not a copy: the
// [docx-import-wiring] and [csv-paste-wiring] blocks are extracted verbatim from
// ../demo/index.html and executed against a stub DOM — the real _shared/docx-import.js
// is injected in place of the dynamic import, a mocked globalThis.fetch stands in for
// POST /api/extract, and the REAL frozen core's csvToSnapshot is injected for the CSV
// path. Red until demo/index.html carries the Import DOCX control + CSV paste box.
// The DOCX fixture is a real archive built by docio's writeDocx (STORE). Fictional
// matter names. No console output; fail-closed everywhere.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { csvToSnapshot } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

const PARAS = [
  "ENGAGEMENT LETTER (fictional)",
  "Re: Halberd v. Perigee — we will respond to RFP set two; the opposition is due November 20, 2026.",
  "Re: Northwind vendor suite — conflicts check next; no deadline stated.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Realistic /api/extract reply payload (matter-board schema): a fully-stated matter
// plus one with unknown owner / no stated deadline (null, never guessed).
const MATTERS = [
  { id: "M-101", name: "Halberd v. Perigee (fictional)", client: "Halberd Logistics", owner: "j.moreau", stage: "discovery", nextStep: "Respond to RFP set two", nextDeadline: "2026-11-20", updatedAt: "2026-10-28T14:00:00Z" },
  { id: "northwind-vendor-suite", name: "Northwind vendor suite", client: "Northwind Robotics", owner: null, stage: null, nextStep: "Conflicts check", nextDeadline: null, updatedAt: null },
];
const EDITED_MATTERS = [MATTERS[0], { ...MATTERS[1], owner: "a.fern" }];

/* ---------- fixture: a real .docx (STORE) via docio's writer ---------- */
const docxFile = (name) => {
  const b = writeDocx(PARAS);
  return { name, size: b.length, arrayBuffer: async () => new Uint8Array(b).slice().buffer };
};

/* ---------- minimal DOM stub (wireDocxImport stub pattern from _shared/docx-import.test.js) ---------- */
class StubElement {
  constructor() { this._html = ""; this._kids = {}; this.handlers = {}; this.clicks = 0; this.files = null; this.disabled = false; this.value = ""; this.onclick = null; this.textContent = ""; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._kids = {}; }
  querySelector(sel) { if (!this._kids[sel]) this._kids[sel] = new StubElement(); return this._kids[sel]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  click() { this.clicks++; if (typeof this.onclick === "function") this.onclick(); for (const f of this.handlers.click ?? []) f(); }
  fire(type) { for (const f of this.handlers[type] ?? []) f(); }
}
const settle = () => new Promise((r) => setTimeout(r, 15));

function stubDom() {
  const els = {};
  for (const id of ["docxImportMount", "currIn", "prevIn", "asOfIn", "formMsg", "csvIn", "csvCapturedAt", "csvParseBtn"]) els[id] = new StubElement();
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

/* ---------- extract + execute the page's actual wiring blocks ---------- */
function block(tag) {
  const START = `/* ---- [${tag}] ---- */`;
  const END = `/* ---- [/${tag}] ---- */`;
  const i = HTML.indexOf(START);
  const j = HTML.indexOf(END);
  assert.ok(i >= 0 && j > i, `demo/index.html must carry the [${tag}] block`);
  return HTML.slice(i, j + END.length);
}

async function runDocxWiring(document, shared) {
  const wiring = block("docx-import-wiring");
  assert.equal(wiring.split(`import("${SPECIFIER}")`).length - 1, 1, "exactly one dynamic import, with the D1-pinned specifier");
  const injectable = wiring.replace(`import("${SPECIFIER}")`, "Promise.resolve(__SHARED__)");
  new Function("document", "__SHARED__", injectable)(document, shared);
  await settle();
}

async function runDocxWiringImportFails(document) {
  const injectable = block("docx-import-wiring").replace(`import("${SPECIFIER}")`, 'Promise.reject(new Error("module unavailable (file:// or offline)"))');
  new Function("document", injectable)(document);
  await settle();
}

function runCsvWiring(document) {
  // the block reads module-scope csvToSnapshot; the REAL frozen core is injected
  new Function("document", "csvToSnapshot", block("csv-paste-wiring"))(document, csvToSnapshot);
}

async function pickFile(mount, file) {
  const input = mount.querySelector(".docx-file-input");
  input.files = [file];
  input.fire("change");
  await settle();
}

/* ---------- static: additive control + CSV box; existing inputs untouched ---------- */

test("static: D1-pinned dynamic import, additive mount above currIn, csvToSnapshot wired, no static docx-import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="currIn"'), "control sits above the current-snapshot textarea");
  for (const id of ["csvIn", "csvCapturedAt", "csvParseBtn"]) assert.ok(HTML.includes(`id="${id}"`), `CSV affordance element ${id} present`);
  assert.ok(/import\s*\{[^}]*csvToSnapshot[^}]*\}\s*from\s*"\.\.\/core\/core\.js"/.test(HTML), "the tested csvToSnapshot is imported from the frozen core");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
});

test("static: existing inputs and controls untouched", () => {
  for (const id of ["currIn", "prevIn", "asOfIn", "loadBtn", "formMsg", "jsonBtn", "csvBtn", "icsBtn", "board", "changelog", "counts"]) {
    assert.ok(HTML.includes(`id="${id}"`), `existing element ${id} untouched`);
  }
  assert.ok(HTML.includes('import EXAMPLE from "./example.js"'), "example import untouched");
});

test("static: the docx wiring only ever touches the mount and the current-snapshot path", () => {
  const ids = [...block("docx-import-wiring").matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)], ["docxImportMount", "asOfIn", "formMsg", "currIn"], "additive: no other page input is referenced");
});

test("static: the CSV wiring only ever touches the CSV box, the message, and currIn", () => {
  const ids = [...block("csv-paste-wiring").matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)], ["csvParseBtn", "formMsg", "csvIn", "csvCapturedAt", "currIn"], "additive: no other page input is referenced");
});

/* ---------- fixture sanity ---------- */

test("readDocxText on the real fixture returns the paragraphs the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

/* ---------- LA path: mocked /api/extract ---------- */

test("LA wiring: real .docx + mocked ok extract → editable matters JSON + capturedAt + chip, then Apply fills currIn", async () => {
  const { els, mount, document } = stubDom();
  els.asOfIn.value = "2026-11-07";
  els.prevIn.value = "sentinel-prev";
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { matters: MATTERS }, confidence: { matters: "high" }, source: "gpt-5-nano" }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("engagement-letters.docx"));
    assert.equal(fetchMock.calls.length, 1, "exactly one extraction call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    assert.equal(fetchMock.calls[0].body.schema, "matter-board");
    assert.equal(fetchMock.calls[0].body.text, EXPECTED_TEXT, "document text is what the route receives");
    assert.match(mount.innerHTML, /class="matters-draft"/, "editable matters JSON textarea in the preview");
    assert.match(mount.innerHTML, /class="mb-captured-at"/, "caller-supplied capturedAt input in the preview");
    assert.match(mount.innerHTML, /value="2026-11-07"/, "capturedAt prefilled from the page's caller-supplied asOf field");
    assert.match(mount.innerHTML, /matters · high confidence/, "per-field confidence chip (high)");
    assert.equal(els.currIn.value, "", "preview gates: currIn untouched before the explicit Apply");
    // the user edits the preview — Apply must read the EDITED values, not the model's
    mount.querySelector(".matters-draft").value = JSON.stringify(EDITED_MATTERS, null, 2);
    mount.querySelector(".mb-captured-at").value = "2026-11-08";
    mount.querySelector(".docx-apply-btn").fire("click");
    const snap = JSON.parse(els.currIn.value);
    assert.equal(snap.capturedAt, "2026-11-08", "capturedAt comes from the user-edited preview field");
    assert.equal(snap.source, "docx-import");
    assert.deepEqual(snap.matters, EDITED_MATTERS, "user-EDITED matters land in the current-snapshot box");
    assert.equal(els.prevIn.value, "sentinel-prev", "previous-snapshot input untouched");
    assert.match(els.formMsg.textContent, /2 matters applied to the current-snapshot box — click Load snapshots/);
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: low confidence is flagged for review in the chip", async () => {
  const { els, mount, document } = stubDom();
  els.asOfIn.value = "2026-11-07";
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { matters: MATTERS }, confidence: { matters: "low" }, source: "gpt-5-nano" }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("engagement-letters.docx"));
    assert.match(mount.innerHTML, /low confidence — review before applying/, "low confidence flagged, not presented as ok");
    assert.ok(!mount.innerHTML.includes("matters · high confidence"));
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: empty capturedAt (no asOf) → snapshot still applies with a visible caller-supplied warning", async () => {
  const { els, mount, document } = stubDom();
  els.asOfIn.value = "";
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { matters: MATTERS }, confidence: { matters: "high" }, source: "gpt-5-nano" }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("engagement-letters.docx"));
    mount.querySelector(".matters-draft").value = JSON.stringify(MATTERS, null, 2);
    mount.querySelector(".docx-apply-btn").fire("click");
    const snap = JSON.parse(els.currIn.value);
    assert.equal(snap.capturedAt, "", "capturedAt never guessed — left empty for the caller to supply");
    assert.deepEqual(snap.matters, MATTERS);
    assert.match(els.formMsg.textContent, /capturedAt left empty/, "the empty capturedAt is surfaced, not hidden");
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: ok:false reply → fail-closed banner + raw text preserved, currIn untouched", async () => {
  const { els, mount, document } = stubDom();
  els.asOfIn.value = "2026-11-07";
  els.currIn.value = "sentinel-curr";
  const fetchMock = mockFetch(() => ({ ok: false, status: 400, json: async () => ({ ok: false, error: "INVALID", message: "The extracted structure did not match" }) }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("engagement-letters.docx"));
    assert.equal(fetchMock.calls.length, 1);
    assert.match(mount.innerHTML, /docx-import-warning/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /<textarea class="docx-import-text"[^>]*>[\s\S]*Halberd v\. Perigee/, "raw document text offered in a fallback textarea — never lost");
    assert.equal(els.currIn.value, "sentinel-curr", "existing input untouched");
    mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(els.currIn.value, "sentinel-curr", "apply in the fallback state feeds nothing to currIn");
    assert.match(els.formMsg.textContent, /No extracted matters to apply/);
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: fetch throws → same fail-closed fallback, currIn untouched", async () => {
  const { els, mount, document } = stubDom();
  els.asOfIn.value = "2026-11-07";
  els.currIn.value = "sentinel-curr";
  const fetchMock = mockFetch(() => { throw new Error("network down"); });
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("engagement-letters.docx"));
    assert.match(mount.innerHTML, /docx-import-warning/);
    assert.match(mount.innerHTML, /Northwind vendor suite/, "imported text preserved in the fallback textarea");
    assert.equal(els.currIn.value, "sentinel-curr");
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: junk (non-docx) file → inline error, no extraction call, target untouched", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { matters: MATTERS }, confidence: { matters: "high" } }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, { name: "export.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer });
    assert.equal(fetchMock.calls.length, 0, "no API call for an unreadable file");
    assert.match(mount.innerHTML, /docx-import-error/, "inline error, no crash");
    assert.equal(els.currIn.value, "", "target never fed garbage");
    assert.equal(mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const { els, mount, document } = stubDom();
  els.currIn.value = "user's pasted snapshot";
  await runDocxWiringImportFails(document);
  assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(els.currIn.value, "user's pasted snapshot", "existing input value untouched");
});

/* ---------- D path: the tested csvToSnapshot, finally wired ---------- */

test("CSV wiring: header + rows (RFC4180 quotes, embedded commas, CRLF) → snapshot JSON fills currIn", () => {
  const { els, document } = stubDom();
  runCsvWiring(document);
  els.currIn.value = "sentinel";
  els.csvIn.value = 'id,name,client,owner,stage,nextDeadline\r\nM-101,"Halberd v. Perigee (fictional)","Halberd, Logistics",j.moreau,discovery,2026-11-20\r\nM-102,Quill,,,filing,';
  els.csvCapturedAt.value = "2026-11-07";
  els.csvParseBtn.click();
  const snap = JSON.parse(els.currIn.value);
  assert.equal(snap.capturedAt, "2026-11-07", "capture time comes from the caller");
  assert.equal(snap.source, "csv-paste");
  assert.deepEqual(snap.matters, [
    { id: "M-101", name: "Halberd v. Perigee (fictional)", client: "Halberd, Logistics", owner: "j.moreau", stage: "discovery", nextDeadline: "2026-11-20" },
    { id: "M-102", name: "Quill", client: null, owner: null, stage: "filing", nextDeadline: null },
  ], "empty cells become explicit null so the anomaly layer can catch them");
  assert.match(els.formMsg.textContent, /2 matters loaded into the current-snapshot box — click Load snapshots/);
});

test("CSV wiring: missing capturedAt → the core's never-guessed error surfaces, currIn untouched", () => {
  const { els, document } = stubDom();
  runCsvWiring(document);
  els.currIn.value = "sentinel";
  els.csvIn.value = "id,name\r\nM-1,X";
  els.csvCapturedAt.value = "";
  els.csvParseBtn.click();
  assert.equal(els.currIn.value, "sentinel", "nothing applied");
  assert.match(els.formMsg.textContent, /capturedAt is required/, "capture time is caller-supplied, never guessed — surfaced verbatim from the core");
});
