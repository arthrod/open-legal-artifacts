// adapter.test.js — class-LA DOCX import adapter test for the fact-chronology demo (Wave W2).
// The page's OWN wiring is under test, not a copy: the [docx-import-wiring] and
// [chronology-input-wiring] blocks are extracted verbatim from ../demo/index.html and
// executed against a stub DOM — the real _shared/docx-import.js is injected in place of
// the dynamic import, and a mocked globalThis.fetch stands in for POST /api/extract.
// Red until demo/index.html carries the input section + Import DOCX control.
// The DOCX fixture is a real archive built by docio's writeDocx (STORE). Fictional
// complaint text. [verify] posture per fleet rules; no console output.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

const PARAS = [
  "COMPLAINT (fictional)",
  "7. On January 9, 2025, Mr. Reyes told Ms. Delgado she was terminated, effective at the end of her shift.",
  "51. In spring of 2024, the cash-handling policy was updated.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Realistic /api/extract reply payload (fact-chronology schema): a dated fact plus an
// ambiguous-date fact (date:null, wording in dateLabel), quotes anchored to the import.
const FACTS = [
  { id: "F1", date: "2025-01-09", dateLabel: "on or about January 9, 2025", topic: "termination", text: "Reyes told Delgado her employment ended that day.", source: { docId: "imported-docx", quote: "she was terminated, effective at the end of her shift", pinpoint: "¶ 7" } },
  { id: "F2", date: null, dateLabel: "Spring 2024", topic: "policy-update", text: "The cash-handling policy was updated.", source: { docId: "imported-docx", quote: "the cash-handling policy was updated", pinpoint: "" } },
];
const EDITED_FACTS = [
  { id: "F1", date: "2025-01-09", dateLabel: "on or about January 9, 2025", topic: "termination", text: "USER-EDITED text.", source: { docId: "imported-docx", quote: "she was terminated, effective at the end of her shift", pinpoint: "¶ 7", kind: "document" } },
];

/* ---------- fixture: a real .docx (STORE) via docio's writer ---------- */
const docxFile = (name) => {
  const b = writeDocx(PARAS);
  return { name, size: b.length, arrayBuffer: async () => new Uint8Array(b).slice().buffer };
};

/* ---------- minimal DOM stub (wireDocxImport stub pattern from _shared/docx-import.test.js) ---------- */
class StubElement {
  constructor() { this._html = ""; this._kids = {}; this.handlers = {}; this.clicks = 0; this.files = null; this.disabled = false; this.value = ""; this.onclick = null; this.textContent = ""; this.style = {}; }
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
  for (const id of ["docxImportMount", "factsIn", "docsIn", "caseIn", "fcMsg", "buildBtn", "diff"]) els[id] = new StubElement();
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
const wrap = (tag) => ({
  START: `/* ---- [${tag}] ---- */`,
  END: `/* ---- [/${tag}] ---- */`,
});
function block(tag) {
  const { START, END } = wrap(tag);
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

function runInputWiring(document, buildChronology, diffChronology, out, lastUserOut, renderCounts, render, renderDiff) {
  // the block reads module-scope names; each is injected as a parameter
  new Function(
    "document", "buildChronology", "diffChronology", "out", "lastUserOut", "renderCounts", "render", "renderDiff",
    block("chronology-input-wiring"),
  )(document, buildChronology, diffChronology, out, lastUserOut, renderCounts, render, renderDiff);
}

async function pickFile(mount, file) {
  const input = mount.querySelector(".docx-file-input");
  input.files = [file];
  input.fire("change");
  await settle();
}

/* ---------- static: the page carries the additive input section + control ---------- */

test("static: D1-pinned dynamic import, additive mount above the facts input, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}").catch(() => import("/open-artifacts/_shared/docx-import.js"));`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  for (const id of ["factsIn", "docsIn", "caseIn", "buildBtn"]) assert.ok(HTML.includes(`id="${id}"`), `input ${id} present`);
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="factsIn"'), "control sits above the facts textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
});

test("static: worked example stays the default render; existing controls untouched", () => {
  assert.ok(HTML.includes('import EXAMPLE, { EXAMPLE_V1 } from "./example.js"'), "example import untouched");
  assert.ok(HTML.includes('document.getElementById("factsIn").value = JSON.stringify(EXAMPLE.facts'), "facts input boots with the example facts as default");
  assert.ok(HTML.includes('document.getElementById("docsIn").value = JSON.stringify(EXAMPLE.documents'), "documents input boots with the example documents as default");
  for (const id of ["mdBtn", "jsonBtn", "vWorking", "vSof", "vWitness", "timeline", "undated"]) {
    assert.ok(HTML.includes(`id="${id}"`), `existing element ${id} untouched`);
  }
});

test("static: the docx wiring only ever touches the mount and the new input ids", () => {
  const ids = [...block("docx-import-wiring").matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)], ["docxImportMount", "fcMsg", "factsIn", "docsIn"], "additive: no other page input is referenced");
});

test("static: the input wiring only ever touches the new input ids", () => {
  const ids = [...block("chronology-input-wiring").matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)], ["buildBtn", "fcMsg", "docsIn", "factsIn", "caseIn", "diff"], "additive: no other page input is referenced");
});

/* ---------- fixture sanity ---------- */

test("readDocxText on the real fixture returns the paragraphs the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

/* ---------- LA path: mocked /api/extract ---------- */

test("LA wiring: real .docx + mocked ok extract → editable facts JSON + confidence chip, then Apply fills inputs", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { facts: FACTS }, confidence: { facts: "high" }, source: "gpt-5-nano" }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint.docx"));
    assert.equal(fetchMock.calls.length, 1, "exactly one extraction call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    assert.equal(fetchMock.calls[0].body.schema, "fact-chronology");
    assert.equal(fetchMock.calls[0].body.text, EXPECTED_TEXT, "document text is what the route receives");
    assert.match(mount.innerHTML, /class="facts-draft"/, "editable facts JSON textarea in the preview");
    assert.match(mount.innerHTML, /facts · high confidence/, "per-field confidence chip (high)");
    assert.ok(mount.innerHTML.includes("&quot;dateLabel&quot;"), "pretty-printed facts JSON rendered in the preview");
    assert.equal(els.factsIn.value, "", "preview gates: facts input untouched before the explicit Apply");
    // the user edits the preview — Apply must read the EDITED values, not the model's
    mount.querySelector(".facts-draft").value = JSON.stringify(EDITED_FACTS, null, 2);
    mount.querySelector(".docx-apply-btn").fire("click");
    assert.deepEqual(JSON.parse(els.factsIn.value), EDITED_FACTS, "user-EDITED facts land in the facts input");
    const docs = JSON.parse(els.docsIn.value);
    assert.equal(docs.length, 1, "imported text added as a document beside the empty default");
    assert.equal(docs[0].id, "imported-docx");
    assert.equal(docs[0].text, EXPECTED_TEXT, "raw text offered as a document for quote verification");
    assert.equal(els.caseIn.value, "", "case name untouched by the import");
    assert.match(els.fcMsg.textContent, /1 fact applied — click Build chronology/);
    // a second apply replaces the imported document instead of duplicating it
    mount.querySelector(".facts-draft").value = JSON.stringify(FACTS, null, 2);
    mount.querySelector(".docx-apply-btn").fire("click");
    const docs2 = JSON.parse(els.docsIn.value);
    assert.equal(docs2.filter((d) => d.id === "imported-docx").length, 1, "idempotent: one imported-docx document after re-apply");
    assert.match(els.fcMsg.textContent, /2 facts applied — click Build chronology/);
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: low confidence is flagged for review in the chip", async () => {
  const { mount, document } = stubDom();
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { facts: FACTS }, confidence: { facts: "low" }, source: "gpt-5-nano" }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint.docx"));
    assert.match(mount.innerHTML, /low confidence — review before applying/, "low confidence flagged, not presented as ok");
    assert.ok(!mount.innerHTML.includes("facts · high confidence"));
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: ok:false reply → fail-closed banner + raw text preserved, inputs untouched", async () => {
  const { els, mount, document } = stubDom();
  els.factsIn.value = "sentinel-facts";
  els.docsIn.value = "sentinel-docs";
  const fetchMock = mockFetch(() => ({ ok: false, status: 502, json: async () => ({ ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable" }) }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint.docx"));
    assert.equal(fetchMock.calls.length, 1);
    assert.match(mount.innerHTML, /docx-import-warning/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /<textarea class="docx-import-text"[^>]*>[\s\S]*she was terminated/, "raw document text offered in a fallback textarea — never lost");
    assert.equal(els.factsIn.value, "sentinel-facts", "existing input untouched");
    assert.equal(els.docsIn.value, "sentinel-docs", "existing input untouched");
    mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(els.factsIn.value, "sentinel-facts", "apply in the fallback state feeds nothing to the facts input");
    assert.match(els.fcMsg.textContent, /No extracted facts to apply/);
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: fetch throws → same fail-closed fallback, inputs untouched", async () => {
  const { els, mount, document } = stubDom();
  els.factsIn.value = "sentinel-facts";
  const fetchMock = mockFetch(() => { throw new Error("network down"); });
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint.docx"));
    assert.match(mount.innerHTML, /docx-import-warning/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /cash-handling policy was updated/, "imported text preserved in the fallback textarea");
    assert.equal(els.factsIn.value, "sentinel-facts");
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: non-JSON reply body → same fail-closed fallback", async () => {
  const { els, mount, document } = stubDom();
  els.factsIn.value = "sentinel-facts";
  const fetchMock = mockFetch(() => ({ ok: true, status: 200, json: async () => { throw new Error("not json"); } }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint.docx"));
    assert.match(mount.innerHTML, /docx-import-warning/);
    assert.equal(els.factsIn.value, "sentinel-facts");
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: junk (non-docx) file → inline error, no extraction call, target untouched", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { facts: FACTS }, confidence: { facts: "high" } }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, { name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer });
    assert.equal(fetchMock.calls.length, 0, "no API call for an unreadable file");
    assert.match(mount.innerHTML, /docx-import-error/, "inline error, no crash");
    assert.equal(els.factsIn.value, "", "target never fed garbage");
    assert.equal(mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: invalid facts JSON in the preview → warning, facts input untouched, nothing applied", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { facts: FACTS }, confidence: { facts: "high" }, source: "gpt-5-nano" }));
  try {
    await runDocxWiring(document, await import("../../_shared/docx-import.js"));
    await pickFile(mount, docxFile("complaint.docx"));
    mount.querySelector(".facts-draft").value = "{oops not json";
    els.factsIn.value = "sentinel-facts";
    mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(els.factsIn.value, "sentinel-facts", "nothing applied on a broken draft");
    assert.match(els.fcMsg.textContent, /facts JSON invalid/);
    assert.match(mount.innerHTML, /docx-import-warning/, "apply failure surfaces a warning, text still on screen");
  } finally {
    fetchMock.restore();
  }
});

test("LA wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const { els, mount, document } = stubDom();
  els.factsIn.value = "user's pasted facts";
  await runDocxWiringImportFails(document);
  assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(els.factsIn.value, "user's pasted facts", "existing input value untouched");
});

/* ---------- the new input section drives the render ---------- */

test("input wiring: Build chronology parses facts+documents, rebuilds with version, renders every section", () => {
  const { els, document } = stubDom();
  const built = [];
  const diffs = [];
  const diffRenders = [];
  let counts = 0, renders = 0;
  const fakeBuild = (input) => { built.push(input); return { version: input.version, summary: { facts: input.facts.length, conflicts: 0, gaps: 0 } }; };
  const fakeDiff = (a, b) => { diffs.push([a, b]); return { fromVersion: a.version, toVersion: a.version + 1 }; };
  runInputWiring(document, fakeBuild, fakeDiff, null, null, () => counts++, () => renders++, (d, note) => diffRenders.push([d, note]));

  els.factsIn.value = JSON.stringify(FACTS);
  els.docsIn.value = JSON.stringify([{ id: "imported-docx", name: "Doc", text: "..." }]);
  els.caseIn.value = "Test v. Case (fictional)";
  els.buildBtn.click();

  assert.equal(built.length, 1, "first build: one core call");
  assert.deepEqual(built[0].facts, FACTS);
  assert.deepEqual(built[0].documents, [{ id: "imported-docx", name: "Doc", text: "..." }]);
  assert.equal(built[0].caseName, "Test v. Case (fictional)");
  assert.equal(built[0].version, 1, "first user build is version 1");
  assert.ok(!("theory" in built[0]) && !("settings" in built[0]), "user builds carry no example theory/settings — defaults only");
  assert.equal(counts, 1, "counts re-rendered");
  assert.equal(renders, 1, "timeline re-rendered");
  assert.equal(diffRenders.length, 0, "no version diff on the first build");
  assert.match(els.diff.innerHTML, /First build of your chronology/, "diff section explains there is nothing to diff yet");
  assert.match(els.fcMsg.textContent, /built — 2 facts/);

  // second build: version-diff path against the previous user build
  els.factsIn.value = JSON.stringify([FACTS[0]]);
  els.buildBtn.click();
  assert.equal(built.length, 3, "second build: probe (for the diff) + final");
  assert.equal(built[2].version, 2, "version bumps exactly when something changed (diffChronology decides)");
  assert.equal(diffs.length, 2, "diffChronology ran for version + render");
  assert.equal(diffRenders.length, 1, "version diff rendered");
  assert.match(diffRenders[0][1], /your chronology — diff vs your previous build/);
  assert.match(els.fcMsg.textContent, /built — 1 fact\b/);
});

test("input wiring: invalid JSON → inline message, nothing rebuilt", () => {
  const { els, document } = stubDom();
  const built = [];
  runInputWiring(document, (i) => { built.push(i); return { version: 1, summary: { facts: 0, conflicts: 0, gaps: 0 } }; }, () => null, null, null, () => {}, () => {}, () => {});
  els.factsIn.value = "{oops";
  els.docsIn.value = "[]";
  els.buildBtn.click();
  assert.equal(built.length, 0, "fail-closed: no core call on a parse error");
  assert.ok(els.fcMsg.textContent.length > 0, "the parse error is surfaced inline");
});

test("input wiring: wrong shapes → inline message naming the field, nothing rebuilt", () => {
  const { els, document } = stubDom();
  const built = [];
  const nope = (i) => { built.push(i); return { version: 1, summary: { facts: 0, conflicts: 0, gaps: 0 } }; };
  runInputWiring(document, nope, () => null, null, null, () => {}, () => {}, () => {});
  els.docsIn.value = '"just a string"';
  els.factsIn.value = "[]";
  els.buildBtn.click();
  assert.match(els.fcMsg.textContent, /documents: expected an array/);
  els.docsIn.value = "[]";
  els.factsIn.value = '"just a string"';
  els.buildBtn.click();
  assert.match(els.fcMsg.textContent, /facts: expected an array/);
  assert.equal(built.length, 0);
});
