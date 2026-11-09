// adapter.test.js — class-LA DOCX import adapter test for the sell-side-qa-log demo
// (Wave W7). This demo had NO input surface today: the wiring adds a Log input section
// (JSON textarea + Load + Back-to-example), an Import DOCX control, and binds the
// Load/Reset handlers so a log actually drives the board (the page exposes sqLoadLog /
// sqResetLog hooks that swap the render input). The [docx-import-wiring] block is
// extracted verbatim from ../demo/index.html and executed against a stub DOM with the
// real _shared/docx-import.js module injected in place of the dynamic import and a
// mocked globalThis.fetch standing in for POST /api/extract. Buyer-questions DOCX →
// items[{id,buyerId,category,question,receivedAt}] (IO contract shape); the model never
// drafts answers. Red until wired. Fictional buyer-questions document.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier
const SCHEMA_KEY = "sell-side-qa-log"; // POST /api/extract schema key = artifact name
const START = "/* ---- [docx-import-wiring] ---- */";
const END = "/* ---- [/docx-import-wiring] ---- */";

const PARAS = [
  "Project Copperfield — buyer diligence questions (fictional)",
  "B1 — Oryx Growth Partners: Are there any pending lawsuits against the target? Received 2026-09-28.",
  "B2 — Lantern Harbor Capital: What was 2025 revenue growth? Received 2026-10-02.",
];
const EXPECTED_TEXT = PARAS.join("\n");
const SAMPLE = {
  items: [
    { id: "Q-001", buyerId: "B1", category: "litigation", question: "Are there any pending lawsuits against the target?", receivedAt: "2026-09-28" },
    { id: "Q-002", buyerId: "B2", category: "financials", question: "What was 2025 revenue growth?", receivedAt: "2026-10-02" },
  ],
};
const EDITED = { items: [{ ...SAMPLE.items[0], question: "EDITED BY SELLER — pending lawsuits?" }] };

/* ---------- fixture: a real .docx (STORE) via docio's writer ---------- */
const docxFile = (name) => {
  const b = writeDocx(PARAS);
  return { name, size: b.length, arrayBuffer: async () => new Uint8Array(b).slice().buffer };
};

/* ---------- minimal DOM stub (wireDocxImport stub pattern from _shared/docx-import.test.js) ---------- */
class StubElement {
  constructor() { this._html = ""; this._kids = {}; this.handlers = {}; this.clicks = 0; this.files = null; this.disabled = false; this.value = ""; this.textContent = ""; this.onclick = null; }
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
  const map = { docxImportMount: mount, sqxJson: new StubElement(), sqxStatus: new StubElement(), logJson: new StubElement(), loadLogBtn: new StubElement(), resetLogBtn: new StubElement(), gateText: new StubElement(), ...els };
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
  assert.ok(i >= 0 && j > i, "demo/index.html must carry the [docx-import-wiring] block (log input + Import DOCX control)");
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

/* ---------- page-hook stubs ---------- */
function hookStub(name, impl = () => 0) {
  const calls = [];
  const orig = globalThis[name];
  globalThis[name] = (v) => { calls.push(v); return impl(v); };
  return { calls, restore: () => { globalThis[name] = orig; } };
}

/* ---------- tests ---------- */

test("static: the NEW input section exists (log JSON + Load + Reset) beside the Import DOCX mount", () => {
  assert.ok(HTML.includes('id="logJson"'), "log JSON textarea present");
  assert.ok(HTML.includes('id="loadLogBtn"'), "Load button present");
  assert.ok(HTML.includes('id="resetLogBtn"'), "Back-to-example button present");
  assert.ok(HTML.includes('id="docxImportMount"'), "Import DOCX mount present");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="logJson"'), "the docx control sits with the log input it feeds");
  assert.ok(HTML.includes('id="gateText"') && HTML.includes('id="gateApprover"'), "the existing release-gate editor is untouched");
});

test("static: D1-pinned dynamic-import line, no static import", () => {
  assert.ok(wiringBlock().includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
});

test("static: the wiring touches only the input section's own ids", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^\"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids, ["docxImportMount", "loadLogBtn", "logJson", "resetLogBtn", "sqxJson", "sqxStatus"], "additive: no other page input is referenced");
});

test("static: the page hooks drive the board through buildQaLog — never a second render path", () => {
  const i = HTML.indexOf("globalThis.sqLoadLog");
  assert.ok(i >= 0, "page defines the sqLoadLog hook the wiring calls");
  const seg = HTML.slice(i, HTML.indexOf("};", i) + 2);
  assert.match(seg, /render\(\)/, "loading a log re-renders the board");
  const r = HTML.indexOf("globalThis.sqResetLog");
  assert.ok(r >= 0, "page defines the sqResetLog hook");
  assert.match(HTML.slice(r, HTML.indexOf("};", r) + 2), /render\(\)/, "reset re-renders the board");
  assert.ok(HTML.includes("buildQaLog(logInput)"), "render() is parameterized over the loaded log input");
});

test("readDocxText on the real fixture returns the text the page will send to /api/extract", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("log input: Load parses the box, validates items, and drives the board hook", async () => {
  const { map, document } = stubDom();
  const hook = hookStub("sqLoadLog", (v) => v.items.length);
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    map.logJson.value = JSON.stringify({ items: SAMPLE.items });
    map.loadLogBtn.click();
    assert.equal(hook.calls.length, 1, "the page hook ran once");
    assert.deepEqual(hook.calls[0].items, SAMPLE.items, "the hook received the parsed items");
    assert.match(map.sqxStatus.textContent, /2 item/, "status confirms the load");
    map.logJson.value = "{ not json";
    map.loadLogBtn.click();
    assert.equal(hook.calls.length, 1, "bad JSON never reaches the board");
    assert.match(map.sqxStatus.textContent, /Not loaded/i, "fail-closed status message");
    map.logJson.value = JSON.stringify({ items: [{ id: "Q-9", question: "" }] });
    map.loadLogBtn.click();
    assert.equal(hook.calls.length, 1, "items without a question are refused");
  } finally { hook.restore(); }
});

test("log input: Reset restores the worked example through the page hook", async () => {
  const { map, document } = stubDom();
  const hook = hookStub("sqResetLog");
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    map.resetLogBtn.click();
    assert.equal(hook.calls.length, 1, "reset hook ran");
    assert.match(map.sqxStatus.textContent, /worked example/i, "status confirms the reset");
  } finally { hook.restore(); }
});

test("wiring: real .docx → POST /api/extract (schema sell-side-qa-log) → editable preview + chip, log box untouched", async () => {
  const { mount, map, document } = stubDom();
  map.logJson.value = "";
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { items: "high" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    const input = mount.querySelector(".docx-file-input");
    input.files = [docxFile("buyer-questions.docx")];
    input.fire("change");
    await settle();
    assert.equal(fetchMock.calls.length, 1, "exactly one extraction call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    const body = JSON.parse(fetchMock.calls[0].opts.body);
    assert.equal(body.schema, SCHEMA_KEY, "schema key is the artifact name");
    assert.equal(body.text, EXPECTED_TEXT, "the imported questions text is what is sent");
    assert.match(mount.innerHTML, /docx-extract-json/, "editable extraction textarea in the preview");
    assert.match(mount.innerHTML, /pending lawsuits/, "extracted questions visible");
    assert.match(mount.innerHTML, /docx-chip[^>]*>items: high/, "per-field confidence chip shown");
    assert.doesNotMatch(mount.innerHTML, /docx-chip flag/, "high confidence is not flagged");
    assert.equal(map.logJson.value, "", "log box untouched before Apply");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: low confidence flags the chip for review", async () => {
  const { mount, document } = stubDom();
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { items: "low" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("buyer-questions.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-chip flag/, "low confidence is flagged");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: Apply reads the USER-EDITED items, fills the log box, and drives the board through Load", async () => {
  const { mount, map, document } = stubDom();
  const hook = hookStub("sqLoadLog", (v) => v.items.length);
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { items: "high" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("buyer-questions.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    map.sqxJson.value = JSON.stringify(EDITED); // the seller edits before applying
    mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    assert.deepEqual(hook.calls.length >= 1 && hook.calls[hook.calls.length - 1].items, EDITED.items, "the board hook received the USER-EDITED items");
    assert.equal(JSON.parse(map.logJson.value).items[0].answers, undefined, "imported items start open — no answers, no auto-drafting");
    assert.match(map.sqxStatus.textContent, /2 item|Loaded/, "status confirms what landed");
    fetchMock.restore();
  } finally { fetchMock.restore(); hook.restore(); }
});

test("wiring: ok:false → fail-closed banner + raw questions text preserved, log box untouched", async () => {
  const { mount, map, document } = stubDom({ sqxJson: undefined });
  delete map.sqxJson; // faithful to the fallback DOM: no editable extraction textarea exists
  map.logJson.value = "";
  const fetchMock = mockFetch({ ok: false, status: 400, body: { ok: false, error: "INVALID", message: "The extracted structure did not match the artifact's schema." } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("buyer-questions.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-err/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /docx-fallback/, "fallback textarea offered");
    assert.match(mount.innerHTML, /Oryx Growth Partners/, "the imported questions text is preserved, never lost");
    assert.equal(map.logJson.value, "", "log box untouched");
    mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    assert.match(mount.innerHTML, /docx-import-warning/, "Apply in the fallback state warns instead of applying");
    assert.equal(map.logJson.value, "", "still untouched");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: fetch throws → same fail-closed fallback, text preserved", async () => {
  const { mount, map, document } = stubDom();
  const fetchMock = mockFetch(new Error("network down"));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("buyer-questions.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-err/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /Project Copperfield/, "raw questions text preserved");
    assert.equal(map.logJson.value, "", "nothing applied");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: failed shared-module import renders the hosted-site hint; the log input keeps working", async () => {
  const { mount, map, document } = stubDom();
  const hook = hookStub("sqLoadLog", (v) => v.items.length);
  try {
    await runWiringImportFails(document);
    assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
    map.logJson.value = JSON.stringify({ items: SAMPLE.items });
    map.loadLogBtn.click();
    assert.equal(hook.calls.length, 1, "the log input works without the docx module (paste + Load)");
  } finally { hook.restore(); }
});
