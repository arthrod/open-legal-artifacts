// adapter.test.js — class-LA DOCX import adapter test for the ask-legal demo (Wave W7).
// The page's OWN wiring is under test, not a copy: the [docx-import-wiring] block is
// extracted verbatim from ../demo/index.html and executed against a stub DOM with the
// real _shared/docx-import.js module injected in place of the dynamic import, and a
// mocked globalThis.fetch standing in for POST /api/extract. Red until demo/index.html
// carries the Import DOCX control; green after wiring. Fictional policy document.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier
const SCHEMA_KEY = "ask-legal"; // POST /api/extract schema key = artifact name
const START = "/* ---- [docx-import-wiring] ---- */";
const END = "/* ---- [/docx-import-wiring] ---- */";

const PARAS = [
  "Meridian Software — Guidance Bulletin 2026-14 (fictional). Updated 2026-10-30.",
  "Vendor NDAs. Use the Mutual NDA (Form L-102) for all prospective vendors; shorter terms or residuals-clause exceptions route to Commercial Legal.",
  "Expense pre-approval. Entertainment above $500 requires pre-approval from Finance and the responsible partner before the event.",
];
const EXPECTED_TEXT = PARAS.join("\n");
const SAMPLE = {
  entries: [
    { id: "kb-imp-001", question: "Which NDA template do I use for a prospective vendor?", answer: "Use the Mutual NDA (Form L-102) for all prospective vendors; exceptions route to Commercial Legal.", tags: ["nda", "vendor", "contracts"], jurisdiction: "US", updated: "2026-10-30" },
    { id: "kb-imp-002", question: "Can I expense client entertainment over $500?", answer: "Entertainment above $500 requires pre-approval from Finance and the responsible partner before the event.", tags: ["expenses", "finance"], jurisdiction: "US", updated: "2026-10-30" },
  ],
};
const EDITED = { entries: [{ ...SAMPLE.entries[0], answer: "EDITED BY REVIEWER — use Form L-102." }] };

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
  const map = { docxImportMount: mount, ...els };
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

test("static: D1-pinned dynamic-import line, mount on the legal desk, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}").catch(() => import("/open-artifacts/_shared/docx-import.js"));`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="approvals"'), "control sits above the pending-approvals panel it feeds");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('id="q"') && HTML.includes('id="corrAnswer"'), "existing inputs untouched");
  assert.ok(HTML.includes('fetch("/api/ask-legal"'), "the live askAi control is left untouched");
});

test("static: the wiring only ever touches the mount, its own preview ids, and the KB hook", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^\"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids, ["docxImportMount", "kbxJson", "kbxStatus"], "additive: no other page input is referenced");
});

test("static: imported drafts land pending-approval — the page hook never calls approveEntry", () => {
  const i = HTML.indexOf("globalThis.applyKbDrafts");
  assert.ok(i >= 0, "page defines the applyKbDrafts hook the wiring block calls");
  const seg = HTML.slice(i, HTML.indexOf("};", i) + 2);
  assert.match(seg, /status:\s*"pending-approval"/, "hooked entries land pending-approval");
  assert.doesNotMatch(seg, /approveEntry/, "the import hook never auto-approves — approveEntry stays the human gate");
});

test("readDocxText on the real fixture returns the text the page will send to /api/extract", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: real .docx → POST /api/extract (schema ask-legal) → editable preview + confidence chip, nothing applied yet", async () => {
  const { mount, map, document } = stubDom({ kbxJson: new StubElement(), kbxStatus: new StubElement(), corrAnswer: new StubElement(), q: new StubElement() });
  const hookCalls = [];
  const origHook = globalThis.applyKbDrafts;
  globalThis.applyKbDrafts = (d) => { hookCalls.push(d); return d.length; };
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { entries: "high" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    const input = mount.querySelector(".docx-file-input");
    input.files = [docxFile("guidance-bulletin.docx")];
    input.fire("change");
    await settle();
    assert.equal(fetchMock.calls.length, 1, "exactly one extraction call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    const body = JSON.parse(fetchMock.calls[0].opts.body);
    assert.equal(body.schema, SCHEMA_KEY, "schema key is the artifact name");
    assert.equal(body.text, EXPECTED_TEXT, "the imported document text is what is sent");
    assert.match(mount.innerHTML, /docx-extract-json/, "editable extraction textarea in the preview");
    assert.match(mount.innerHTML, /kb-imp-001/, "extracted entries visible");
    assert.match(mount.innerHTML, /docx-chip[^>]*>entries: high/, "per-field confidence chip shown");
    assert.doesNotMatch(mount.innerHTML, /docx-chip flag/, "high confidence is not flagged");
    assert.equal(map.corrAnswer.value, "", "existing correction input untouched before Apply");
    assert.equal(map.q.value, "", "existing question input untouched before Apply");
    assert.equal(hookCalls.length, 0, "nothing applied before the explicit Apply");
    fetchMock.restore();
  } finally { fetchMock.restore(); globalThis.applyKbDrafts = origHook; }
});

test("wiring: low confidence flags the chip for review", async () => {
  const { mount, document } = stubDom({ kbxJson: new StubElement(), kbxStatus: new StubElement() });
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { entries: "low" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("guidance-bulletin.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-chip flag/, "low confidence is flagged");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: Apply reads the USER-EDITED JSON and routes drafts through the pending-approval hook", async () => {
  const { mount, map, document } = stubDom({ kbxJson: new StubElement(), kbxStatus: new StubElement(), corrAnswer: new StubElement() });
  const hookCalls = [];
  const origHook = globalThis.applyKbDrafts;
  globalThis.applyKbDrafts = (d) => { hookCalls.push(d); return d.length; };
  const fetchMock = mockFetch({ ok: true, status: 200, body: { ok: true, data: SAMPLE, confidence: { entries: "high" }, source: "gpt-5-nano" } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("guidance-bulletin.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    map.kbxJson.value = JSON.stringify(EDITED); // the reviewer edits the preview before applying
    mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    assert.equal(hookCalls.length, 1, "the page hook ran once");
    assert.deepEqual(hookCalls[0], EDITED.entries, "the hook received the USER-EDITED entries, not the raw model output");
    assert.match(map.kbxStatus.textContent, /pending-approval/, "status tells the reviewer where the drafts landed");
    assert.equal(map.corrAnswer.value, "", "existing inputs still untouched");
    fetchMock.restore();
  } finally { fetchMock.restore(); globalThis.applyKbDrafts = origHook; }
});

test("wiring: ok:false → fail-closed banner + raw text preserved, Apply warns, nothing applied", async () => {
  const { mount, map, document } = stubDom({ kbxStatus: new StubElement(), corrAnswer: new StubElement() }); // no kbxJson: faithful to the fallback DOM
  const hookCalls = [];
  const origHook = globalThis.applyKbDrafts;
  globalThis.applyKbDrafts = (d) => { hookCalls.push(d); return d.length; };
  const fetchMock = mockFetch({ ok: false, status: 400, body: { ok: false, error: "INVALID", message: "The extracted structure did not match the artifact's schema." } });
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("guidance-bulletin.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-err/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /docx-fallback/, "fallback textarea offered");
    assert.match(mount.innerHTML, /Form L-102/, "the imported document text is preserved, never lost");
    assert.equal(map.corrAnswer.value, "", "existing inputs untouched");
    assert.equal(hookCalls.length, 0, "nothing applied");
    mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    assert.match(mount.innerHTML, /docx-import-warning/, "Apply in the fallback state warns instead of applying");
    assert.equal(hookCalls.length, 0, "still nothing applied");
    fetchMock.restore();
  } finally { fetchMock.restore(); globalThis.applyKbDrafts = origHook; }
});

test("wiring: fetch throws → same fail-closed fallback, text preserved", async () => {
  const { mount, map, document } = stubDom({ kbxStatus: new StubElement() });
  const fetchMock = mockFetch(new Error("network down"));
  try {
    await runWiring(document, await import("../../_shared/docx-import.js"));
    mount.querySelector(".docx-file-input").files = [docxFile("guidance-bulletin.docx")];
    mount.querySelector(".docx-file-input").fire("change");
    await settle();
    assert.match(mount.innerHTML, /docx-err/, "fail-closed banner shown");
    assert.match(mount.innerHTML, /Entertainment above \$500/, "raw document text preserved in the fallback textarea");
    fetchMock.restore();
  } finally { fetchMock.restore(); }
});

test("wiring: junk (non-docx) file → inline error, Apply unreachable, existing input untouched", async () => {
  const { mount, map, document } = stubDom({ corrAnswer: new StubElement() });
  await runWiring(document, await import("../../_shared/docx-import.js"));
  mount.querySelector(".docx-file-input").files = [{ name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer }];
  mount.querySelector(".docx-file-input").fire("change");
  await settle();
  assert.match(mount.innerHTML, /docx-import-error/, "inline error, no crash");
  assert.equal(map.corrAnswer.value, "", "target never fed garbage");
  assert.equal(mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const { mount, map, document } = stubDom({ corrAnswer: new StubElement() });
  map.corrAnswer.value = "user's drafted correction";
  await runWiringImportFails(document);
  assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(map.corrAnswer.value, "user's drafted correction", "existing input value untouched");
});
