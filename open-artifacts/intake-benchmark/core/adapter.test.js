// adapter.test.js — class-LA DOCX import adapter test for the intake-benchmark demo
// (Wave W4 finish). The page's OWN wiring is under test, not a copy: the
// [docx-import-wiring] block is extracted verbatim from ../demo/index.html and
// executed against a stub DOM — the real _shared/docx-import.js module injected
// in place of the D1 dynamic import, globalThis.fetch mocked for POST
// /api/extract, and the page's own module-scope bindings (validateCapture,
// state, renderFlows, run, saveSoon — the frozen core's audit gate + the demo's
// builder pipeline) injected as parameters. Red until demo/index.html carries
// the Import DOCX control in the Flows section. The fixture is a real archive
// built by docio's writeDocx. Fictional legal-aid session.
//
// Behavior pinned here (spec.md §"LLM prompt schema (optional capture step)"):
// the capture step "Extract ONLY what is observable; never invent fields,
// latencies, or fallbacks" — unobservable latencies are OMITTED keys; the
// deterministic validateCapture(json) gate audits the model's output AND the
// user's edited JSON before anything reaches the rubric; scoring stays in the
// frozen core. The wiring never auto-clicks the page's Compare button.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { validateCapture } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional recorded intake session (the DOCX under import). Only step 1's
// duration is observable; the conflicts-check duration is NOT — the model must
// omit latency_seconds there, never guess one.
const PARAS = [
  "Recorded intake session (fictional) — Harborview Legal Aid front desk, 2026-11-05.",
  "Step 1: receptionist asks the caller's full name and phone number on the paper intake sheet; the segment runs 95 seconds.",
  "Step 2: caller states the problem; receptionist writes a short summary. If the caller hangs up, the sheet goes to the callback pile.",
  "Step 3: conflicts check against past clients — the recording does not show how long this took.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema intake-benchmark): observable
// steps only — s2/s3 carry NO latency_seconds key, s1 carries no fallback.
const FLOWS = [{
  id: "front-desk-paper",
  name: "Front-desk paper intake",
  kind: "human",
  steps: [
    { id: "s1", purpose: "collect caller identity", fields: ["full_name", "phone_number"], latency_seconds: 95 },
    { id: "s2", purpose: "record problem summary", fields: ["problem_description"], fallback: "If the caller hangs up, the sheet goes to the callback pile." },
    { id: "s3", purpose: "conflicts check against past clients", fields: ["conflict_check"] },
  ],
}];
// The user edits the proposed capture: renames the flow and drops s2's fields.
const EDITED_FLOWS = [{
  ...FLOWS[0],
  name: "Front-desk paper intake (annotated)",
  steps: FLOWS[0].steps.map((s, i) => (i === 1 ? { ...s, fields: [] } : s)),
}];

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
  const els = { docxImportMount: new StubElement(), flows: new StubElement(), input: new StubElement() };
  return { mount: els.docxImportMount, els, document: { getElementById: (id) => els[id] ?? null } };
}

/** The page-scope bindings the wiring uses: a sentinel state + spies. */
function stubPage() {
  const sentinelFlow = { id: "sentinel", name: "Sentinel flow", kind: "human", steps: [{ id: "x", purpose: "hold", fields: [] }] };
  const page = {
    state: { scenario: { name: "fictional clinic intake" }, flows: [sentinelFlow], config: {} },
    counts: { renderFlows: 0, run: 0, saveSoon: 0 },
  };
  page.renderFlows = () => { page.counts.renderFlows++; };
  page.run = () => { page.counts.run++; };
  page.saveSoon = () => { page.counts.saveSoon++; };
  return page;
}

/* ---------- fetch mocking ---------- */
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function mockFetch(handler) {
  const calls = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts, body: opts && typeof opts.body === "string" ? JSON.parse(opts.body) : null });
    return handler(calls.length);
  };
  return { calls, restore: () => { globalThis.fetch = prev; } };
}
const okExtract = () => jsonRes(200, { ok: true, data: { flows: FLOWS }, confidence: { flows: "high" }, source: "gpt-5-nano" });

/* ---------- extract + execute the page's actual wiring block ---------- */
const START = "/* ---- [docx-import-wiring] ---- */";
const END = "/* ---- [/docx-import-wiring] ---- */";

function wiringBlock() {
  const i = HTML.indexOf(START);
  const j = HTML.indexOf(END);
  assert.ok(i >= 0 && j > i, "demo/index.html must carry the [docx-import-wiring] block (Import DOCX control)");
  return HTML.slice(i, j + END.length);
}

// The block sits inside the page module, so it may use the page's own
// module-scope bindings; each is injected here as a parameter (the same trick
// matter-board's test used for csvToSnapshot).
async function runWiring(document, shared, page) {
  const wiring = wiringBlock();
  assert.equal(wiring.split(`import("${SPECIFIER}")`).length - 1, 1, "exactly one dynamic import, with the D1-pinned specifier");
  const injectable = wiring
    .replace(`import("${SPECIFIER}")`, "Promise.resolve(__SHARED__)")
    .replace(/\bvalidateCapture\b/g, "__VC__")
    .replace(/\bstate\b/g, "__STATE__")
    .replace(/\brenderFlows\b/g, "__RENDER__")
    .replace(/\brun\b/g, "__RUN__")
    .replace(/\bsaveSoon\b/g, "__SAVE__");
  new Function("document", "__SHARED__", "__VC__", "__STATE__", "__RENDER__", "__RUN__", "__SAVE__", injectable)(
    document, shared, validateCapture, page.state, page.renderFlows, page.run, page.saveSoon);
  await settle();
}

async function runWiringImportFails(document) {
  const injectable = wiringBlock().replace(`import("${SPECIFIER}")`, 'Promise.reject(new Error("module unavailable (file:// or offline)"))');
  new Function("document", injectable)(document);
  await settle();
}

async function pickFile(mount, file) {
  const input = mount.querySelector(".docx-file-input");
  input.files = [file];
  input.fire("change");
  await settle();
}

async function importAndPreview(shared, handler = okExtract) {
  const dom = stubDom();
  const page = stubPage();
  const fetchMock = mockFetch(handler);
  await runWiring(dom.document, shared, page);
  await pickFile(dom.mount, docxFile("recorded-session.docx"));
  return { dom, page, fetchMock };
}

// The stub does not hydrate .value from rendered HTML — the proposed draft is
// read back out of the markup (what the browser user sees in the textarea).
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#0?39;/g, "'");
const draftFromHtml = (dom) => {
  const m = /class="flows-draft"[^>]*>([\s\S]*?)<\/textarea>/.exec(dom.mount.innerHTML);
  return m ? JSON.parse(unesc(m[1])) : null;
};
const previewNoteHtml = (dom) => { const p = dom.mount.querySelector(".docx-import-preview"); return p ? p.innerHTML : ""; };

/* ---------- tests ---------- */

test("static: D1-pinned dynamic import, mount inside the Flows section above the builder, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  const flowsHeading = HTML.indexOf('id="flows-h"');
  assert.ok(flowsHeading > 0, "Flows section present");
  assert.ok(HTML.indexOf('id="docxImportMount"') > flowsHeading, "mount sits inside the Flows section");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="flows"'), "control sits above the flows builder");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(wiringBlock().includes('schema: "intake-benchmark"'), "extraction calls POST /api/extract with the artifact schema key");
});

test("static: additive — the wiring touches only the mount, feeds the page pipeline, and never auto-clicks Compare", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["docxImportMount"], "additive: the only DOM id the wiring resolves is its own mount");
  for (const id of ["flows", "flows-h", "add-flow", "run", "example", "clear", "adv", "input", "apply-json", "jerr", "out", "log-tbl"]) {
    assert.ok(HTML.includes(`id="${id}"`), `existing element ${id} untouched`);
  }
  const wiring = wiringBlock();
  assert.match(wiring, /validateCapture\(/, "the frozen core's audit gate is used");
  assert.match(wiring, /\brenderFlows\(\)/, "applied flows re-render through the page's own builder");
  assert.match(wiring, /\brun\(\)/, "applied flows re-score through the page's own Compare pipeline");
  assert.ok(!/\.click\(\)/.test(wiring), "the wiring never clicks anything — Compare stays a human action");
});

test("readDocxText on the real fixture returns the session text the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("gate sanity: the mocked capture passes validateCapture; a steps-free flow does not", () => {
  const ok = validateCapture({ flows: FLOWS });
  assert.equal(ok.valid, true, "observable-only capture clears the deterministic gate");
  const bad = validateCapture({ flows: [{ id: "broken", name: "Broken", kind: "human", steps: [] }] });
  assert.equal(bad.valid, false, "a flow with no steps is refused by the gate the wiring must run");
});

test("LA wiring: real .docx + mocked ok extract → editable capture + confidence chip + QA verdict; nothing applied before explicit Apply", async () => {
  const shared = await import("../../_shared/docx-import.js");
  const { dom, page, fetchMock } = await importAndPreview(shared);
  try {
    assert.equal(fetchMock.calls.length, 1, "exactly one /api/extract call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    assert.deepEqual(fetchMock.calls[0].body, { schema: "intake-benchmark", text: EXPECTED_TEXT });
    assert.match(dom.mount.innerHTML, /xchip[^>]*>flows: high/, "high-confidence chip");
    assert.match(dom.mount.innerHTML, /class="flows-draft"/, "editable flows JSON textarea in the preview");
    const draft = draftFromHtml(dom);
    assert.ok(draft, "the proposed capture is serialized into the textarea");
    assert.equal(draft[0].name, "Front-desk paper intake");
    assert.equal(draft[0].steps[0].latency_seconds, 95, "observable latency kept");
    assert.ok(!("latency_seconds" in draft[0].steps[2]), "unobservable latency is an OMITTED key, never a guess");
    assert.ok(!("latency_seconds" in draft[0].steps[1]) && !("fallback" in draft[0].steps[0]), "unobservable fallback omitted likewise");
    assert.match(dom.mount.innerHTML, /vc-ok/, "validateCapture verdict surfaced (no errors)");
    assert.deepEqual(page.state.flows, [{ id: "sentinel", name: "Sentinel flow", kind: "human", steps: [{ id: "x", purpose: "hold", fields: [] }] }], "state untouched before the explicit Apply");
    assert.equal(page.counts.renderFlows, 0, "builder not re-rendered before Apply");
  } finally { fetchMock.restore(); }
});

test("LA wiring: explicit Apply gates the EDITED JSON through validateCapture, then feeds the page pipeline (user edits win)", async () => {
  const shared = await import("../../_shared/docx-import.js");
  const { dom, page, fetchMock } = await importAndPreview(shared);
  try {
    dom.mount.querySelector(".flows-draft").value = JSON.stringify(EDITED_FLOWS, null, 2);
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.deepEqual(page.state.flows, EDITED_FLOWS, "user-EDITED flows land in the page state, not the model's raw proposal");
    assert.equal(page.state.scenario.name, "fictional clinic intake", "scenario untouched by the import");
    assert.equal(page.counts.renderFlows, 1, "builder re-rendered once");
    assert.equal(page.counts.run, 1, "Compare re-scored once");
    assert.equal(page.counts.saveSoon, 1, "persistence hooked once");
    assert.match(previewNoteHtml(dom), /Applied — 1 flow\(s\) loaded into the builder/, "apply note surfaced");
  } finally { fetchMock.restore(); }
});

test("LA wiring: an edited capture that fails validateCapture is refused — nothing reaches the pipeline", async () => {
  const shared = await import("../../_shared/docx-import.js");
  const { dom, page, fetchMock } = await importAndPreview(shared);
  try {
    dom.mount.querySelector(".flows-draft").value = JSON.stringify({ flows: [{ id: "broken", name: "Broken", kind: "human", steps: [] }] });
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(page.state.flows[0].id, "sentinel", "state untouched — the gate refused the edit");
    assert.equal(page.counts.renderFlows, 0, "builder never re-rendered");
    assert.equal(page.counts.run, 0, "Compare never re-scored");
    assert.match(previewNoteHtml(dom), /vc-errors/, "gate errors surfaced in the preview");
    assert.match(previewNoteHtml(dom), /missing non-empty &quot;steps&quot; array/, "the core's own error text is shown (HTML-escaped)");
  } finally { fetchMock.restore(); }
});

test("LA wiring: model output that fails the gate is flagged in the preview before any Apply", async () => {
  const shared = await import("../../_shared/docx-import.js");
  const broken = { flows: [{ id: "m-broken", name: "Model slip", kind: "human", steps: [] }] };
  const { dom, page, fetchMock } = await importAndPreview(shared, () => jsonRes(200, { ok: true, data: broken, confidence: { flows: "high" }, source: "gpt-5-nano" }));
  try {
    assert.match(dom.mount.innerHTML, /vc-errors/, "the model's own capture is audited in the preview");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(page.state.flows[0].id, "sentinel", "gated: model output never reaches the rubric");
    assert.equal(page.counts.run, 0);
  } finally { fetchMock.restore(); }
});

test("LA wiring: ok:false from /api/extract → fail-closed banner + raw text preserved; pipeline untouched", async () => {
  const shared = await import("../../_shared/docx-import.js");
  const { dom, page, fetchMock } = await importAndPreview(shared, () => jsonRes(502, { ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable" }));
  try {
    assert.match(dom.mount.innerHTML, /docx-import-warning/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="docx-import-text"/, "raw document text offered in a fallback textarea");
    assert.match(dom.mount.innerHTML, /conflicts check against past clients/, "text preserved, never lost");
    assert.equal(page.state.flows[0].id, "sentinel", "pipeline untouched");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(page.state.flows[0].id, "sentinel", "apply in fallback mode feeds nothing to the rubric");
    assert.equal(page.counts.run, 0);
    assert.match(previewNoteHtml(dom), /No extracted flows to apply/, "honest fallback note surfaced");
  } finally { fetchMock.restore(); }
});

test("LA wiring: fetch throws → same fail-closed fallback", async () => {
  const shared = await import("../../_shared/docx-import.js");
  const { dom, page, fetchMock } = await importAndPreview(shared, () => { throw new Error("network down"); });
  try {
    assert.match(dom.mount.innerHTML, /docx-import-warning/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="docx-import-text"/, "raw document text offered");
    assert.equal(page.state.flows[0].id, "sentinel", "pipeline untouched");
  } finally { fetchMock.restore(); }
});

test("LA wiring: junk (non-docx) file → inline error, no extraction call, Apply unreachable, pipeline untouched", async () => {
  const dom = stubDom();
  const page = stubPage();
  const fetchMock = mockFetch(okExtract);
  try {
    await runWiring(dom.document, await import("../../_shared/docx-import.js"), page);
    await pickFile(dom.mount, { name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer });
    assert.equal(fetchMock.calls.length, 0, "no API call for an unreadable file");
    assert.match(dom.mount.innerHTML, /docx-import-error/, "inline error, no crash");
    assert.equal(page.state.flows[0].id, "sentinel", "pipeline never fed garbage");
    assert.equal(dom.mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
  } finally { fetchMock.restore(); }
});

test("LA wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const dom = stubDom();
  const page = stubPage();
  await runWiringImportFails(dom.document);
  assert.match(dom.mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(page.state.flows[0].id, "sentinel", "existing page state untouched");
});
