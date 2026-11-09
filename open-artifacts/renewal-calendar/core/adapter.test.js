// adapter.test.js — class-LA DOCX import adapter test for the renewal-calendar
// demo (Wave W3). The page's OWN wiring is under test, not a copy: the
// [docx-import-wiring] block is extracted verbatim from ../demo/index.html and
// executed against a stub DOM with the real _shared/docx-import.js injected in
// place of the dynamic import, and globalThis.fetch mocked for POST
// /api/extract (schema "renewal-calendar", spec prompt contract: temporal
// phrases ride verbatim in dateExpression, never interpreted; no invented
// dates). The demo shipped with NO input surface (worked example only) — this
// test pins the added Input section (mount + calendar JSON box + render
// button) and the contract DOCX → clauses[] preview → Apply → render path.
// The DOCX fixture is a real archive built by docio's writeDocx (STORE).
// Fictional contract text. No console output; fail-closed everywhere.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText, wireDocxImport } from "../../_shared/docx-import.js";
import { buildCalendar } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier
const SCHEMA_KEY = "renewal-calendar"; // POST /api/extract registry key (schemas/renewal-calendar.ts)

const PARAS = [
  "SUPPLY AGREEMENT (fictional excerpt)",
  "This Agreement renews automatically for successive one (1) year terms unless either party gives written notice at least ninety (90) days prior to the end of the then-current term.",
  "Base rent shall adjust to CPI within sixty (60) days of quarter end.",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Realistic /api/extract reply (renewal-calendar schema): one explicit-date
// clause and one verbatim-expression clause — exactly one anchor each, quotes
// verbatim, no invented dates.
const CLAUSES = [
  { type: "auto-renewal", date: "2027-04-01", dateExpression: null, quote: "This Agreement renews automatically for successive one (1) year terms unless either party gives written notice at least ninety (90) days prior to the end of the then-current term.", leadTimeDaysOverride: null, renewalTermMonths: 12 },
  { type: "price-adjustment", date: null, dateExpression: "within 60 days of quarter end", quote: "Base rent shall adjust to CPI within sixty (60) days of quarter end.", leadTimeDaysOverride: null, renewalTermMonths: null },
];
const EDITED_CLAUSES = [{ ...CLAUSES[0], leadTimeDaysOverride: 45 }]; // the user drops the price-adjustment clause and sets her own notice window

// The page's calendar-input JSON the wiring builds on top of (rules + asOf are
// preserved; confirmations are reset — imported clauses are unconfirmed).
const BASE_INPUT = {
  asOf: "2026-11-07",
  company: "Northwind Robotics, Inc. (fictional)",
  rules: { defaultLeadTimeDays: 60, byClauseType: { "auto-renewal": 90, "price-adjustment": 120 } },
  confirmations: [{ contractId: "CTR-002", clauseType: "price-adjustment", date: "2027-03-01", confirmedBy: "K. Alvarez, outside counsel", on: "2026-11-06" }],
  contracts: [{ id: "CTR-001", name: "Foundry SaaS MSA", counterparty: "Foundry Cloud Ltd.", clauses: [] }],
};

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
  click() { this.clicks++; for (const f of this.handlers.click ?? []) f(); }
  fire(type) { for (const f of this.handlers[type] ?? []) f(); }
}
const settle = () => new Promise((r) => setTimeout(r, 15));

function stubDom() {
  const els = {};
  for (const id of ["docxImportMount", "calInput", "calRun", "calMsg", "icsBtn", "stats", "timeline", "unresolved", "coverage", "legend"]) els[id] = new StubElement();
  els.calInput.value = JSON.stringify(BASE_INPUT);
  return { els, mount: els.docxImportMount, document: { getElementById: (id) => els[id] ?? null } };
}

/* ---------- fetch mocking for POST /api/extract ---------- */
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

async function pickFile(mount, file) {
  const input = mount.querySelector(".docx-file-input");
  input.files = [file];
  input.fire("change");
  await settle();
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic import, new Input section with mount + JSON box, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}");`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the new Input section");
  for (const id of ["calInput", "calRun", "calMsg"]) assert.ok(HTML.includes(`id="${id}"`), `input-section element ${id} present`);
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="calInput"'), "import control sits above the calendar JSON box");
  assert.ok(HTML.includes('import EXAMPLE from "./example.js"'), "worked example untouched");
  assert.ok(HTML.includes('id="icsBtn"'), "existing export button untouched");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(HTML.includes(`schema: "${SCHEMA_KEY}"`), "extraction POSTs under the artifact schema key");
  assert.ok(HTML.includes('fetch("/api/extract"'), "extraction calls the shared route");
  assert.ok(HTML.includes("DOCX import is available on the hosted site."), "D1 fail-closed hint copy");
});

test("static: the wiring only ever touches the mount, the calendar JSON box, its render button, and the message line", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["docxImportMount", "calInput", "calRun", "calMsg"], "additive: no other page input is referenced");
});

test("readDocxText on the real fixture returns the contract text the extraction will carry", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("wiring: real .docx + mocked /api/extract ok → editable clauses preview + confidence chip; Apply composes the calendar input and fires the render path", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { clauses: CLAUSES }, confidence: { clauses: "high" }, source: "gpt-5-nano" }));
  try {
    await runWiring(document, { wireDocxImport });
    await pickFile(mount, docxFile("supply-agreement.docx"));
    assert.equal(fetchMock.calls.length, 1, "exactly one extraction call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    assert.deepEqual(fetchMock.calls[0].body, { schema: SCHEMA_KEY, text: EXPECTED_TEXT }, "document text is what the route receives");
    assert.match(mount.innerHTML, /rc-clauses-draft/, "editable clauses JSON textarea in the preview");
    assert.match(mount.innerHTML, /clauses: high/, "confidence chip shows the field verdict");
    assert.match(mount.innerHTML, /within 60 days of quarter end/, "the temporal phrase rides verbatim in the preview — never interpreted");
    assert.equal(els.calInput.value, JSON.stringify(BASE_INPUT), "calendar JSON box untouched before the explicit Apply");
    // the user edits the preview — Apply must read the EDITED values, not the model's
    mount.querySelector(".rc-clauses-draft").value = JSON.stringify(EDITED_CLAUSES, null, 2);
    mount.querySelector(".docx-apply-btn").fire("click");
    const applied = JSON.parse(els.calInput.value);
    assert.equal(applied.asOf, "2026-11-07", "as-of preserved from the page's current input");
    assert.deepEqual(applied.rules, BASE_INPUT.rules, "lead-time rules preserved (rules-as-data, never model-touched)");
    assert.deepEqual(applied.confirmations, [], "confirmations reset — imported clauses are unconfirmed");
    assert.equal(applied.contracts.length, 1);
    assert.deepEqual(applied.contracts[0].clauses, EDITED_CLAUSES, "user-EDITED clauses land in the calendar input");
    assert.ok(els.calRun.clicks >= 1, "the page's Render-calendar path is invoked");
    assert.match(els.calMsg.textContent, /1 clause applied/, "apply outcome surfaced");
  } finally { fetchMock.restore(); }
});

test("wiring: low confidence is flagged for review in the chip", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { clauses: CLAUSES }, confidence: { clauses: "low" }, source: "gpt-5-nano" }));
  try {
    await runWiring(document, { wireDocxImport });
    await pickFile(mount, docxFile("supply-agreement.docx"));
    assert.match(mount.innerHTML, /clauses: low — review before applying/, "low confidence flagged, not presented as ok");
    assert.ok(!mount.innerHTML.includes("clauses: high"));
  } finally { fetchMock.restore(); }
});

test("wiring: ok:false → fail-closed banner + raw text preserved; Apply feeds nothing, honest message", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => ({ ok: false, status: 502, json: async () => ({ ok: false, error: "UNAVAILABLE", message: "Live AI is unavailable or returned an unusable extraction" }) }));
  try {
    await runWiring(document, { wireDocxImport });
    await pickFile(mount, docxFile("supply-agreement.docx"));
    assert.equal(fetchMock.calls.length, 1);
    assert.match(mount.innerHTML, /docx-import-error/, "fail-closed banner");
    assert.match(mount.innerHTML, /unavailable/i, "banner states the reason");
    assert.match(mount.innerHTML, /docx-import-text/, "raw document text offered in a fallback textarea");
    assert.ok(mount.innerHTML.includes("quarter end"), "no text lost");
    assert.equal(els.calInput.value, JSON.stringify(BASE_INPUT), "calendar JSON untouched by the failure");
    mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(els.calInput.value, JSON.stringify(BASE_INPUT), "apply in the fallback state feeds nothing to the calendar input");
    assert.match(els.calMsg.textContent, /No extracted clauses to apply/, "honest fallback note surfaced");
  } finally { fetchMock.restore(); }
});

test("wiring: fetch throws → same fail-closed fallback, calendar untouched", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => { throw new TypeError("Failed to fetch"); });
  try {
    await runWiring(document, { wireDocxImport });
    await pickFile(mount, docxFile("supply-agreement.docx"));
    assert.match(mount.innerHTML, /docx-import-error/, "fail-closed banner");
    assert.match(mount.innerHTML, /docx-import-text/, "raw document text preserved");
    assert.equal(els.calInput.value, JSON.stringify(BASE_INPUT), "calendar input untouched");
  } finally { fetchMock.restore(); }
});

test("wiring: junk (non-docx) file → inline error, no extraction call, Apply unreachable", async () => {
  const { els, mount, document } = stubDom();
  const fetchMock = mockFetch(() => okRes({ ok: true, data: { clauses: CLAUSES }, confidence: { clauses: "high" } }));
  try {
    await runWiring(document, { wireDocxImport });
    await pickFile(mount, { name: "notes.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer });
    assert.equal(fetchMock.calls.length, 0, "no API call for an unreadable file");
    assert.match(mount.innerHTML, /docx-import-error/, "inline error, no crash");
    assert.equal(els.calInput.value, JSON.stringify(BASE_INPUT), "target never fed garbage");
    assert.equal(mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
  } finally { fetchMock.restore(); }
});

test("wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const { els, mount, document } = stubDom();
  await runWiringImportFails(document);
  assert.match(mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(els.calInput.value, JSON.stringify(BASE_INPUT), "existing input value untouched");
});

test("gate: the applied calendar input renders through the frozen deterministic core — explicit date schedules, verbatim expression stays flagged", () => {
  // exactly what the wiring composes on Apply (test 4's path, unedited clauses)
  const applied = {
    asOf: BASE_INPUT.asOf,
    company: BASE_INPUT.company,
    rules: BASE_INPUT.rules,
    confirmations: [],
    contracts: [{ id: "IMPORT-001", name: "Imported contract", counterparty: null, clauses: CLAUSES }],
  };
  const cal = buildCalendar(applied, applied.rules, applied.confirmations);
  const renewal = cal.events.find((e) => e.clauseType === "auto-renewal");
  assert.ok(renewal, "explicit-date clause produces an event");
  assert.equal(renewal.status, "confirmed", "an explicit ISO date schedules exactly");
  assert.equal(renewal.leadTimeDays, 90, "lead time from rules.byClauseType, never model-touched");
  const price = cal.events.find((e) => e.clauseType === "price-adjustment");
  assert.ok(price, "the verbatim expression resolves through the deterministic grammar");
  assert.equal(price.status, "ambiguous", "the ambiguous phrase is scheduled conservatively and FLAGGED — never silently resolved");
  assert.ok(price.expression === "within 60 days of quarter end", "the temporal phrase rides verbatim");
  assert.equal(cal.summary.unresolved, 0, "resolvable phrases never land in the review list");
  // and with the user's clause override applied (test 4's EDITED_CLAUSES)
  const cal2 = buildCalendar({ ...applied, contracts: [{ id: "IMPORT-001", name: "Imported contract", clauses: EDITED_CLAUSES }] }, applied.rules, []);
  assert.equal(cal2.events.find((e) => e.clauseType === "auto-renewal").leadTimeDays, 45, "the user's clause-level override wins over the rules");
  assert.equal(cal2.events.length, 2, "auto-renewal projects its two recurring cycles");
});
