// adapter.test.js — class-LA DOCX import adapter test for the record-clearance demo (Wave W5).
// The page's OWN wiring is under test, not a copy: the [docx-import-wiring] block is
// extracted verbatim from ../demo/index.html and executed against a stub DOM with the
// real _shared/docx-import.js module injected in place of the dynamic import, the real
// core validateIntake (the deterministic post-gate) and the page's EXAMPLES binding
// injected as parameters, and globalThis.fetch MOCKED — no network, ever. Red until
// demo/index.html carries the Import DOCX control; green after wiring. Fictional
// rap-sheet data; [verify] tags per fleet rules.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { validateIntake } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier
const TARGET_ID = "input"; // the client-record JSON textarea (the engine's run path)
const SCHEMA = "record-clearance"; // POST /api/extract schema key (registered post-wave)

const PARAS = [
  "STATE RAP SHEET — FICTIONAL RECORD (example)",
  "Client: Dana Whitfield (fictional)",
  "Probation status: completed. Fines: a balance is shown; the amount is unclear.",
  "CONVICTION 1",
  "Offense: Forgery (fictional)",
  "Offense category: fraud — Class: felony class W",
  "Disposition date: 2018-05-04. Sentence completed: 2020-08-21. Probation terminated: 2020-08-21.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Realistic /api/extract reply (spec § "Prompt schema for the LLM part" example shape):
// client + convictions + uncertain — the uncertain field (finesPaid) is ALSO still
// present in client, exactly as the model would emit it; validateIntake must drop it.
const REPLY_DATA = {
  client: { probationStatus: "completed", finesPaid: true, pendingCases: false, rapSheetObtained: true },
  convictions: [
    { id: "V1", offense: "Forgery (fictional)", offenseCategory: "fraud", offenseClass: "felony_class_W",
      dispositionDate: "2018-05-04", sentenceCompletedDate: "2020-08-21", probationTerminatedDate: "2020-08-21" },
  ],
  uncertain: [{ field: "finesPaid", reason: "rap sheet shows a balance; amount unclear" }],
};
const REPLY = {
  ok: true,
  data: REPLY_DATA,
  confidence: { client: "low", convictions: "high", uncertain: "high" },
  source: "gpt-5-nano",
};
// The EXAMPLES binding the page passes the wiring (asOf fallback only).
const EXAMPLES = { CA: { asOf: "2026-11-07" } };

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
  const jur = new StubElement();
  jur.value = "CA"; // the page's jurisdiction select (default CA)
  const els = { docxImportMount: mount, [TARGET_ID]: target, jur };
  return { mount, target, jur, document: { getElementById: (id) => els[id] ?? null } };
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
  new Function("document", "__SHARED__", "validateIntake", "EXAMPLES", injectable)(document, shared, validateIntake, EXAMPLES);
  await settle();
}

async function runWiringImportFails(document) {
  const injectable = wiringBlock().replace(`import("${SPECIFIER}")`, 'Promise.reject(new Error("module unavailable (file:// or offline)"))');
  new Function("document", "validateIntake", "EXAMPLES", injectable)(document, validateIntake, EXAMPLES);
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

/** Full happy path: pick file → preview (mocked extract) → user edit → explicit Apply. */
async function importAndApply({ edit } = {}) {
  const dom = await importPreviewOnly();
  try {
    // simulate the browser rendering the preview textarea + the user editing it
    const ta = dom.mount.querySelector("textarea.extract-out");
    ta.value = edit !== undefined ? edit : JSON.stringify(REPLY_DATA, null, 2);
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    return dom;
  } catch (e) {
    dom.fetchMock.restore();
    throw e;
  }
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic-import line, additive mount above the record box, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf(`id="${TARGET_ID}"`), "control sits above the client-record textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes('id="jur"') && HTML.includes('id="run"') && HTML.includes('id="err"'), "existing inputs untouched");
  assert.ok(HTML.includes("validateIntake"), "the deterministic post-gate is imported for the apply path");
});

test("static: the wiring only ever touches the mount, the jurisdiction select (read), and the record textarea", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^\"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["docxImportMount", "jur", TARGET_ID], "additive: no other page input is referenced");
});

test("static: the extraction posts to /api/extract with the artifact schema key", () => {
  assert.ok(wiringBlock().includes('"/api/extract"'), "posts to the shared extract route");
  assert.ok(wiringBlock().includes(`"${SCHEMA}"`), "schema key is the artifact name");
});

test("readDocxText on the real fixture returns the paragraphs the page will send", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: mocked extract → editable JSON preview + confidence chips; target untouched before Apply", async () => {
  const { mount, target, fetchMock } = await importPreviewOnly();
  try {
    assert.equal(fetchMock.calls.length, 1, "exactly one /api/extract call");
    assert.match(fetchMock.calls[0].url, /\/api\/extract$/, "posts to the shared extract route");
    const body = JSON.parse(fetchMock.calls[0].init.body);
    assert.deepEqual(body, { schema: SCHEMA, text: EXPECTED_TEXT }, "request carries the schema key and the DOCX text verbatim");
    assert.match(mount.innerHTML, /textarea class="extract-out"/, "editable preview rendered");
    assert.ok(mount.innerHTML.includes("Forgery (fictional)"), "preview shows the extracted convictions");
    assert.match(mount.innerHTML, /class="xchip xlo"[^>]*>client/, "low-confidence client field is flagged for review");
    assert.match(mount.innerHTML, /class="xchip xhi"[^>]*>convictions/, "high-confidence convictions field is ok-styled");
    assert.equal(target.value, "", "preview gates: nothing lands in the record box before the explicit Apply");
    assert.equal(mount.querySelector(".docx-apply-btn").disabled, false, "Apply enabled once ready");
  } finally {
    fetchMock.restore();
  }
});

test("wiring: Apply runs validateIntake — the uncertain field is dropped, never guessed into the record", async () => {
  const { target, mount } = await importAndApply();
  const applied = JSON.parse(target.value);
  assert.equal(applied.client.finesPaid, undefined, "uncertain client.finesPaid dropped by the deterministic post-gate");
  assert.equal(applied.client.probationStatus, "completed", "stated client facts survive");
  assert.equal(applied.jurisdiction, "CA", "jurisdiction falls back to the page's select");
  assert.equal(applied.asOf, "2026-11-07", "asOf falls back to the page example's screening date");
  assert.equal(applied.convictions.length, 1);
  assert.equal(applied.convictions[0].offense, "Forgery (fictional)");
  assert.deepEqual(applied.filings, []);
  // apply() mutates the live .xnote element's textContent (visible in a real browser);
  // the stub captures it as a property:
  assert.match(String(mount.querySelector(".xnote").textContent), /Applied — validateIntake dropped/, "the panel explains what the gate dropped");
});

test("wiring: Apply reads the user-EDITED preview values, not the original reply", async () => {
  const edited = JSON.parse(JSON.stringify(REPLY_DATA));
  edited.client.pendingCases = null;
  delete edited.uncertain;
  const { target } = await importAndApply({ edit: JSON.stringify(edited, null, 2) });
  const applied = JSON.parse(target.value);
  assert.equal(applied.client.pendingCases, null, "the user's edit (null) is what lands, not the model's false");
});

test("wiring: ok:false → fail-closed banner + raw text preserved; Apply leaves the record box untouched", async () => {
  const dom = stubDom();
  const fetchMock = mockFetch({ ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable" }, { httpOk: false, status: 502 });
  try {
    await runWiring(dom.document, await import("../../_shared/docx-import.js"));
    dom.target.value = "user's existing record JSON";
    const input = dom.mount.querySelector(".docx-file-input");
    input.files = [docxFile("rap-sheet.docx")];
    input.fire("change");
    await settle();
    assert.match(dom.mount.innerHTML, /docx-import-error/, "fail-closed banner rendered");
    assert.ok(dom.mount.innerHTML.includes("STATE RAP SHEET"), "the raw document text is offered in the fallback textarea");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    await settle();
    assert.equal(dom.target.value, "user's existing record JSON", "existing inputs untouched on failure");
    assert.match(dom.mount.innerHTML, /nothing was applied/, "the failed Apply is explained in the panel");
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
    assert.ok(dom.mount.innerHTML.includes("STATE RAP SHEET"), "raw text never lost");
    assert.equal(dom.target.value, "", "target untouched");
  } finally {
    fetchMock.restore();
  }
});

test("wiring: non-JSON reply body → same fail-closed posture", async () => {
  const dom = stubDom();
  const fetchMock = mockFetch(null);
  // second-layer failure: the body is not JSON, so res.json() rejects
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error("invalid json body"); } });
  try {
    await runWiring(dom.document, await import("../../_shared/docx-import.js"));
    const input = dom.mount.querySelector(".docx-file-input");
    input.files = [docxFile("rap-sheet.docx")];
    input.fire("change");
    await settle();
    assert.match(dom.mount.innerHTML, /docx-import-error/, "fail-closed banner rendered");
    assert.ok(dom.mount.innerHTML.includes("STATE RAP SHEET"), "raw text never lost");
    assert.equal(dom.target.value, "", "target untouched");
  } finally {
    fetchMock.restore();
  }
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const dom = stubDom();
  dom.target.value = "user's pasted JSON";
  await runWiringImportFails(dom.document);
  assert.match(dom.mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(dom.target.value, "user's pasted JSON", "existing input value untouched");
});

test("post-gate sanity: validateIntake on the fixture reply drops the uncertain field and reports it", () => {
  const { input, issues } = validateIntake(REPLY_DATA);
  assert.equal(input.client.finesPaid, undefined);
  assert.ok(issues.some((i) => i.includes("client.finesPaid dropped")), "the drop is logged as an issue: " + issues.join(" | "));
});
