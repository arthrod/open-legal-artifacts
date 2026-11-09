// adapter.test.js — class-LA DOCX import adapter test for the record-sealing-screener
// demo (Wave W5). The page's OWN wiring is under test, not a copy: the
// [docx-import-wiring] block is extracted verbatim from ../demo/index.html and executed
// against a stub DOM with the real _shared/docx-import.js module injected in place of
// the dynamic import, and globalThis.fetch MOCKED — no network, ever. This artifact's
// extract output is TEXT (the documented rap-sheet paste format), not JSON: the model
// normalizes INTO the deterministic parser's grammar, and Apply lands the text in the
// existing rap paste box. Red until demo/index.html carries the Import DOCX control.
// Fictional rap-sheet data; [verify] tags per fleet rules.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { parseRapSheet } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier
const TARGET_ID = "rap"; // the documented rap-sheet paste box (parseRapSheet's input)
const SCHEMA = "record-sealing-screener"; // POST /api/extract schema key (registered post-wave)

const PARAS = [
  "SUPERIOR COURT OF THE DISTRICT OF COLUMBIA — RAP SHEET (fictional)",
  "Case 2021-CF-0042: Possession of a controlled substance.",
  "Misdemeanor. Adjudicated guilty 2015-09-10; sentence completed 2016-03-01.",
  "Fine paid. No pending matters.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Realistic /api/extract reply: the model's normalization INTO the documented paste
// format (the grammar parseRapSheet accepts — spec § "Prompt schema for the LLM part").
const REPLY_TEXT = [
  "JURISDICTION: DC",
  "CASE C-2001 (2021-CF-0042)",
  "OFFENSE: Possession of a controlled substance (fictional)",
  "CATEGORY: drug_possession",
  "CLASS: misdemeanor",
  "DISPOSITION: conviction",
  "OFFENSE DATE: 2015-04-02",
  "DISPOSITION DATE: 2015-09-10",
  "SENTENCE COMPLETED: 2016-03-01",
  "FINE PAID: yes",
].join("\n");
const REPLY = { ok: true, data: { text: REPLY_TEXT }, confidence: { text: "high" }, source: "gpt-5-nano" };

/* ---------- fixture: a real .docx (STORE) via docio's writer ---------- */
const docxFile = (name) => {
  const b = writeDocx(PARAS);
  return { name, size: b.length, arrayBuffer: async () => new Uint8Array(b).slice().buffer };
};

/* ---------- minimal DOM stub (wireDocxImport stub pattern from _shared/docx-import.test.js) ---------- */
class StubElement {
  constructor() { this._html = ""; this._q = {}; this.handlers = {}; this.clicks = 0; this.files = null; this.disabled = false; this.value = ""; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._q = {}; } // re-render = fresh children (listeners never accumulate)
  querySelector(sel) { if (!this._q[sel]) this._q[sel] = new StubElement(); return this._q[sel]; }
  addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
  click() { this.clicks++; for (const f of this.handlers.click ?? []) f(); }
  fire(type, ev) { for (const f of this.handlers[type] ?? []) f(ev); }
}
const settle = () => new Promise((r) => setTimeout(r, 25));

function stubDom() {
  const mount = new StubElement();
  const target = new StubElement();
  target.value = "JURISDICTION: DC\nCASE C-1001\n…existing pasted rap sheet…";
  const modeRap = new StubElement();
  const els = { docxImportMount: mount, [TARGET_ID]: target, "mode-rap": modeRap };
  return { mount, target, modeRap, document: { getElementById: (id) => els[id] ?? null } };
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

/* ---------- fetch mock (the LA leg: never real network) ---------- */
function mockFetch(reply, opts = {}) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (opts.throw) return Promise.reject(new Error(opts.throw));
    return { ok: opts.httpOk ?? true, status: opts.status ?? 200, json: async () => (typeof reply === "function" ? reply() : reply) };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

/** Drive the preview phase only: pick file → mocked extract → preview rendered, NO Apply. */
async function importPreviewOnly() {
  const dom = stubDom();
  const fetchMock = mockFetch(REPLY);
  try {
    await runWiring(dom.document, await import("../../_shared/docx-import.js"));
    const input = dom.mount.querySelector(".docx-file-input");
    input.files = [docxFile("rap-sheet.docx")];
    input.fire("change");
    await settle();
    return { ...dom, fetchMock };
  } catch (e) {
    fetchMock.restore();
    throw e;
  }
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic-import line, additive mount beside the input panes, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf(`id="${TARGET_ID}"`), "control sits above the rap paste box");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('id="input"') && HTML.includes('id="asof"') && HTML.includes('id="run"'), "existing inputs untouched");
});

test("static: the wiring only ever touches the mount, the rap paste box, and the rap-mode tab", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^\"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["docxImportMount", TARGET_ID, "mode-rap"], "additive: no other page input is referenced");
});

test("static: the extraction posts to /api/extract with the artifact schema key", () => {
  assert.ok(wiringBlock().includes('"/api/extract"'), "posts to the shared extract route");
  assert.ok(wiringBlock().includes(`"${SCHEMA}"`), "schema key is the artifact name");
});

test("readDocxText on the real fixture returns the paragraphs the page will send", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("deterministic downstream: parseRapSheet on the mocked normalized text maps the case cleanly", () => {
  const parsed = parseRapSheet(REPLY_TEXT);
  assert.equal(parsed.jurisdiction, "DC");
  assert.equal(parsed.cases.length, 1);
  assert.equal(parsed.cases[0].id, "C-2001");
  assert.equal(parsed.cases[0].caseNumber, "2021-CF-0042");
  assert.equal(parsed.cases[0].offenseCategory, "drug_possession");
  assert.equal(parsed.cases[0].disposition, "conviction");
  assert.equal(parsed.cases[0].sentenceCompletedDate, "2016-03-01");
  assert.equal(parsed.cases[0].finePaid, true);
  assert.deepEqual(parsed.unmappedLines, [], "a clean normalization maps every line");
});

test("wiring: mocked extract → editable TEXT preview + confidence chip; rap box untouched before Apply", async () => {
  const { mount, target, fetchMock } = await importPreviewOnly();
  try {
    assert.equal(fetchMock.calls.length, 1, "exactly one /api/extract call");
    const body = JSON.parse(fetchMock.calls[0].init.body);
    assert.deepEqual(body, { schema: SCHEMA, text: EXPECTED_TEXT }, "request carries the schema key and the DOCX text verbatim");
    assert.match(mount.innerHTML, /textarea class="extract-out"/, "editable preview rendered");
    assert.ok(mount.innerHTML.includes("JURISDICTION: DC"), "preview shows the paste-format text");
    assert.match(mount.innerHTML, /class="xchip xhi"[^>]*>text/, "the text field's confidence is chipped");
    assert.notEqual(target.value, REPLY_TEXT, "preview gates: the rap box keeps its existing content before Apply");
  } finally {
    fetchMock.restore();
  }
});

test("wiring: Apply lands the (edited) text in the rap box and switches to the rap pane", async () => {
  const dom = await importPreviewOnly();
  try {
    const ta = dom.mount.querySelector("textarea.extract-out");
    ta.value = REPLY_TEXT + "\nFINE PAID: no"; // the user's edit is what must land
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    assert.equal(dom.target.value, REPLY_TEXT + "\nFINE PAID: no", "the user-EDITED text lands verbatim in the rap box");
    assert.equal(dom.modeRap.clicks, 1, "the rap-mode tab is clicked once to reveal the paste box (display only)");
    const parsed = parseRapSheet(dom.target.value);
    assert.equal(parsed.cases[0].finePaid, false, "the edit is real: parseRapSheet sees FINE PAID: no");
  } finally {
    dom.fetchMock.restore();
  }
});

test("wiring: ok:false → fail-closed banner + raw text preserved; Apply leaves the rap box untouched", async () => {
  const dom = stubDom();
  const fetchMock = mockFetch({ ok: false, error: "RATE_LIMITED", message: "Too many requests" }, { httpOk: false, status: 429 });
  try {
    await runWiring(dom.document, await import("../../_shared/docx-import.js"));
    const input = dom.mount.querySelector(".docx-file-input");
    input.files = [docxFile("rap-sheet.docx")];
    input.fire("change");
    await settle();
    assert.match(dom.mount.innerHTML, /docx-import-error/, "fail-closed banner rendered");
    assert.ok(dom.mount.innerHTML.includes("SUPERIOR COURT OF THE DISTRICT"), "the raw document text is offered in the fallback textarea");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    assert.ok(dom.target.value.includes("existing pasted rap sheet"), "existing rap box content untouched on failure");
    assert.equal(dom.modeRap.clicks, 0, "no pane switch on failure");
  } finally {
    fetchMock.restore();
  }
});

test("wiring: fetch throws → same fail-closed posture (banner + text preserved, target untouched)", async () => {
  const dom = stubDom();
  const fetchMock = mockFetch(null, { throw: "network down" });
  try {
    await runWiring(dom.document, await import("../../_shared/docx-import.js"));
    const input = dom.mount.querySelector(".docx-file-input");
    input.files = [docxFile("rap-sheet.docx")];
    input.fire("change");
    await settle();
    assert.match(dom.mount.innerHTML, /docx-import-error/, "fail-closed banner rendered");
    assert.ok(dom.mount.innerHTML.includes("SUPERIOR COURT OF THE DISTRICT"), "raw text never lost");
    assert.ok(dom.target.value.includes("existing pasted rap sheet"), "existing rap box content untouched");
  } finally {
    fetchMock.restore();
  }
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const dom = stubDom();
  await runWiringImportFails(dom.document);
  assert.match(dom.mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.ok(dom.target.value.includes("existing pasted rap sheet"), "existing input value untouched");
});
