// adapter.test.js — class-LA DOCX import adapter test for the pro-bono-case-board
// demo (Wave W4 finish). The page's OWN wiring is under test, not a copy: the
// [docx-import-wiring] block is extracted verbatim from ../demo/index.html and
// executed against a stub DOM — the real _shared/docx-import.js injected in
// place of the D1 dynamic import, and globalThis.fetch mocked for POST
// /api/extract. Red until demo/index.html carries the Import DOCX control in
// the Board input section. The fixture is a real archive built by docio's
// writeDocx. Fictional client.
//
// Behavior pinned here (spec.md §"Prompt schema for the LLM part (input prep
// only)"): the intake note is normalized into case-board fields — "Use only
// the skill tags from the provided taxonomy. Never invent a volunteer match."
// unknownTerms are surfaced, never silently folded into skills; Apply appends a
// draft case with NO invented dates (null, flagged by the frozen core) and NO
// volunteer (matching stays the core's deterministic job); the wiring never
// auto-clicks Rebuild board.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { writeDocx } from "../../_shared/docio.js";
import { readDocxText } from "../../_shared/docx-import.js";
import { buildBoard } from "./core.js";

const HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");
const SPECIFIER = "../../_shared/docx-import.js"; // D1-pinned dynamic-import specifier

// Fictional intake note (the DOCX under import). "benefits-law" is not a
// taxonomy tag — it must surface in unknownTerms, never in the skill fields.
const PARAS = [
  "Intake note (fictional) — recorded by Harborview Legal Aid, 2026-11-06.",
  "Client: T. Alvarez. Tenant received a 3-day notice after a benefits overpayment cut her income; she asked for a Spanish-speaking volunteer.",
  "Problem: eviction defense with a benefits component; a hearing is mentioned for December 2, 2026.",
  "Skills wanted: housing, tenant-defense, spanish, and benefits-law (coordinator unsure of that tag).",
];
const EXPECTED_TEXT = PARAS.join("\n");

// Mocked /api/extract success payload (schema pro-bono-case-board). Note:
// "benefits" IS a taxonomy tag but is NOT on this test roster — the preview
// must surface it as absent from the roster rather than silently keeping it.
const EXTRACTED = {
  problem: "eviction defense after a benefits overpayment",
  requiredSkills: ["housing", "tenant-defense"],
  optionalSkills: ["spanish", "benefits"],
  confidence: 0.7,
  unknownTerms: ["benefits-law"],
};
const CONFIDENCE = { problem: "high", requiredSkills: "high", optionalSkills: "low", unknownTerms: "low" };

// The board currently in the demo's input box (roster WITHOUT 'benefits').
const STUB_BOARD = {
  asOf: "2026-11-08",
  settings: { staleDays: 30, matchLimit: 3 },
  volunteers: [
    { id: "V-01", name: "D. Whitfield (fictional)", skills: ["housing", "tenant-defense", "spanish"] },
    { id: "V-03", name: "K. Osei (fictional)", skills: ["family"] },
  ],
  cases: [
    { id: "PB-2026-010", client: "C. Moreau (fictional)", problem: "eviction defense", state: "active", openedDate: "2026-10-21", lastActivityDate: "2026-10-29", requiredSkills: ["housing", "tenant-defense"], optionalSkills: ["spanish"], volunteerId: "V-01", hours: 8 },
  ],
};
const DRAFT_APPLIED = {
  id: "PB-DRAFT-1",
  client: "",
  problem: "eviction defense after a benefits overpayment",
  state: "intake",
  openedDate: null,
  lastActivityDate: null,
  requiredSkills: ["housing", "tenant-defense"],
  optionalSkills: ["spanish"],
  volunteerId: null,
  hours: 0,
};

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
  const els = {};
  for (const id of ["docxImportMount", "input", "run", "ics", "err", "impact", "capacity", "board"]) els[id] = new StubElement();
  els.input.value = JSON.stringify(STUB_BOARD, null, 2);
  return { mount: els.docxImportMount, els, document: { getElementById: (id) => els[id] ?? null } };
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
const okExtract = () => jsonRes(200, { ok: true, data: EXTRACTED, confidence: CONFIDENCE, source: "gpt-5-nano" });

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

async function importAndPreview(shared, handler = okExtract) {
  const dom = stubDom();
  const fetchMock = mockFetch(handler);
  await runWiring(dom.document, shared);
  await pickFile(dom.mount, docxFile("intake-note.docx"));
  return { dom, fetchMock };
}

/* ---------- tests ---------- */

test("static: D1-pinned dynamic import, additive mount above the board input, no static import", () => {
  assert.ok(HTML.includes(`const M = await import("${SPECIFIER}").catch(() => import("/open-artifacts/_shared/docx-import.js"));`), "the exact pinned D1 import line");
  assert.ok(HTML.includes('id="docxImportMount"'), "mount element present in the page");
  const section = HTML.indexOf("Board input (JSON)");
  assert.ok(section > 0, "board-input section present");
  assert.ok(HTML.indexOf('id="docxImportMount"') > section, "mount sits inside the board-input section");
  assert.ok(HTML.indexOf('id="docxImportMount"') < HTML.indexOf('id="input"'), "control sits above the input textarea");
  assert.ok(!/import\s[^;]*from\s*"[^"]*docx-import\.js"/.test(HTML), "the shared module is never statically imported (build must not inline it)");
  assert.ok(wiringBlock().includes('schema: "pro-bono-case-board"'), "extraction calls POST /api/extract with the artifact schema key");
});

test("static: the wiring touches only the mount and the board input; it never proposes a volunteer and never auto-rebuilds", () => {
  const ids = [...wiringBlock().matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)], ["docxImportMount", "input"], "additive: no other page input is referenced — Rebuild board stays a human click");
  const wiring = wiringBlock();
  assert.match(wiring, /volunteerId:\s*null/, "the appended draft explicitly carries no volunteer");
  assert.ok(!/x-volunteer/.test(wiring), "no volunteer proposal field exists in the preview");
  assert.ok(!/getElementById\("run"\)|\.click\(\)/.test(wiring), "the wiring never clicks Rebuild board");
  for (const id of ["input", "run", "ics", "err", "impact", "capacity", "board"]) {
    assert.ok(HTML.includes(`id="${id}"`), `existing element ${id} untouched`);
  }
});

test("readDocxText on the real fixture returns the intake note the page will extract from", async () => {
  const res = await readDocxText(writeDocx(PARAS));
  assert.deepEqual(res, { text: EXPECTED_TEXT, paragraphs: PARAS, error: null });
});

test("LA wiring: real .docx + mocked ok extract → editable fields, unknownTerms surfaced, roster misses flagged; input untouched before Apply", async () => {
  const { dom, fetchMock } = await importAndPreview(await import("../../_shared/docx-import.js"));
  try {
    assert.equal(fetchMock.calls.length, 1, "exactly one /api/extract call");
    assert.equal(fetchMock.calls[0].url, "/api/extract");
    assert.deepEqual(fetchMock.calls[0].body, { schema: "pro-bono-case-board", text: EXPECTED_TEXT });
    assert.match(dom.mount.innerHTML, /xchip[^>]*>problem: high/, "high-confidence chip");
    assert.match(dom.mount.innerHTML, /xchip[^>]*flag[^>]*>optionalSkills: low/, "low-confidence chip flagged for review");
    assert.match(dom.mount.innerHTML, /class="x-problem"[^>]*value="eviction defense after a benefits overpayment"/, "proposed problem summary in an editable field");
    assert.match(dom.mount.innerHTML, /class="x-required"[^>]*value="housing, tenant-defense"/, "proposed required tags");
    assert.match(dom.mount.innerHTML, /Terms not in the taxonomy:<\/strong>[^<]*benefits-law/, "unknownTerms surfaced, never folded into skills");
    assert.match(dom.mount.innerHTML, /Not in the current roster:<\/strong>[^<]*benefits/, "a taxonomy tag missing from this board's roster is flagged");
    assert.ok(!dom.mount.innerHTML.includes('value="benefits-law"'), "unknown terms never land in a skills field");
    assert.equal(JSON.parse(dom.els.input.value).cases.length, 1, "board input untouched before the explicit Apply");
  } finally { fetchMock.restore(); }
});

test("LA wiring: explicit Apply appends an honest draft case (edited values win, no dates, no volunteer); Rebuild never auto-clicked", async () => {
  const { dom, fetchMock } = await importAndPreview(await import("../../_shared/docx-import.js"));
  try {
    // the user edits: drops the off-roster optional tag, tweaks the summary
    dom.mount.querySelector(".x-problem").value = "eviction defense after a benefits overpayment (verified by phone)";
    dom.mount.querySelector(".x-required").value = "housing, tenant-defense";
    dom.mount.querySelector(".x-optional").value = "spanish";
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    const board = JSON.parse(dom.els.input.value);
    assert.equal(board.cases.length, 2, "one draft appended, nothing dropped");
    assert.deepEqual(board.cases[0], STUB_BOARD.cases[0], "the existing case is untouched");
    assert.deepEqual(board.cases[1], { ...DRAFT_APPLIED, problem: "eviction defense after a benefits overpayment (verified by phone)" },
      "user-EDITED values win; dates null (never invented); volunteerId null (never a match); unknownTerms excluded");
    assert.equal(board.volunteers.length, 2, "roster untouched");
    assert.equal(dom.els.run.handlers.click, undefined, "Rebuild board was never clicked by the wiring");
    const noteHtml = dom.mount.querySelector(".docx-import-preview").innerHTML;
    assert.match(noteHtml, /Applied — draft case PB-DRAFT-1/, "apply note names the draft id");
    assert.match(noteHtml, /Rebuild board/, "note points at the human's next step");
  } finally { fetchMock.restore(); }
});

test("LA wiring: a second Apply gets a non-colliding draft id", async () => {
  const { dom, fetchMock } = await importAndPreview(await import("../../_shared/docx-import.js"));
  try {
    dom.mount.querySelector(".x-problem").value = EXTRACTED.problem;
    dom.mount.querySelector(".x-required").value = EXTRACTED.requiredSkills.join(", ");
    dom.mount.querySelector(".x-optional").value = EXTRACTED.optionalSkills.join(", ");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    const board = JSON.parse(dom.els.input.value);
    assert.deepEqual(board.cases.map((c) => c.id), ["PB-2026-010", "PB-DRAFT-1", "PB-DRAFT-2"], "ids stay unique");
  } finally { fetchMock.restore(); }
});

test("LA wiring: empty problem after edits → Apply refuses, board input untouched", async () => {
  const { dom, fetchMock } = await importAndPreview(await import("../../_shared/docx-import.js"));
  try {
    dom.mount.querySelector(".x-problem").value = "";
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(JSON.parse(dom.els.input.value).cases.length, 1, "nothing appended");
    assert.match(dom.mount.querySelector(".docx-import-preview").innerHTML, /problem summary is required/, "refusal surfaced in the preview");
  } finally { fetchMock.restore(); }
});

test("gate: the frozen core accepts the applied board and flags — never invents — the draft's missing dates; matching stays deterministic", () => {
  const dom = stubDom();
  const board = JSON.parse(JSON.stringify(STUB_BOARD));
  board.cases.push(JSON.parse(JSON.stringify(DRAFT_APPLIED)));
  const b = buildBoard(board);
  const draft = b.cases.find((c) => c.id === "PB-DRAFT-1");
  assert.ok(draft.flags.some((f) => f.includes("openedDate missing or not ISO")), "missing dates are flagged by the core, not fabricated");
  assert.ok(draft.flags.some((f) => f.includes("lastActivityDate missing")), "both dates flagged");
  assert.equal(draft.volunteerId, null, "no volunteer invented");
  const top = draft.matches[0];
  assert.equal(top.volunteerId, "V-01", "the deterministic core ranks the roster — not the import");
  assert.equal(top.eligible, true, "required housing+tenant-defense matched by V-01");
  assert.equal(top.score, 100, "70 required + 30 optional (spanish) — the core's formula, unchanged");
  assert.equal(b.impact.openCases, 2, "board still builds: the import never feeds garbage");
});

test("LA wiring: ok:false from /api/extract → fail-closed banner + raw text preserved; board input untouched", async () => {
  const { dom, fetchMock } = await importAndPreview(await import("../../_shared/docx-import.js"),
    () => jsonRes(400, { ok: false, error: "INVALID", message: "The extracted structure did not match" }));
  try {
    assert.equal(fetchMock.calls.length, 1);
    assert.match(dom.mount.innerHTML, /docx-import-warning/, "fail-closed banner shown");
    assert.match(dom.mount.innerHTML, /<textarea class="docx-import-text"[^>]*>[\s\S]*3-day notice/, "raw document text offered in a fallback textarea — never lost");
    assert.equal(JSON.parse(dom.els.input.value).cases.length, 1, "existing input untouched");
    dom.mount.querySelector(".docx-apply-btn").fire("click");
    assert.equal(JSON.parse(dom.els.input.value).cases.length, 1, "apply in the fallback state appends nothing");
    assert.match(dom.mount.querySelector(".docx-import-preview").innerHTML, /No extracted fields to apply/, "honest fallback note surfaced");
  } finally { fetchMock.restore(); }
});

test("LA wiring: fetch throws → same fail-closed fallback", async () => {
  const { dom, fetchMock } = await importAndPreview(await import("../../_shared/docx-import.js"), () => { throw new Error("network down"); });
  try {
    assert.match(dom.mount.innerHTML, /docx-import-warning/, "fail-closed banner");
    assert.match(dom.mount.innerHTML, /class="docx-import-text"/, "raw document text offered");
    assert.equal(JSON.parse(dom.els.input.value).cases.length, 1, "existing input untouched");
  } finally { fetchMock.restore(); }
});

test("LA wiring: junk (non-docx) file → inline error, no extraction call, Apply unreachable", async () => {
  const dom = stubDom();
  const fetchMock = mockFetch(okExtract);
  try {
    await runWiring(dom.document, await import("../../_shared/docx-import.js"));
    await pickFile(dom.mount, { name: "export.txt", size: 30, arrayBuffer: async () => new TextEncoder().encode("plain prose, not a zip").buffer });
    assert.equal(fetchMock.calls.length, 0, "no API call for an unreadable file");
    assert.match(dom.mount.innerHTML, /docx-import-error/, "inline error, no crash");
    assert.equal(JSON.parse(dom.els.input.value).cases.length, 1, "board never fed garbage");
    assert.equal(dom.mount.querySelector(".docx-apply-btn").disabled, true, "Apply stays disabled in the error state");
  } finally { fetchMock.restore(); }
});

test("LA wiring: failed shared-module import renders the hosted-site hint, page intact", async () => {
  const dom = stubDom();
  await runWiringImportFails(dom.document);
  assert.match(dom.mount.innerHTML, /DOCX import is available on the hosted site/, "fail-closed hint rendered");
  assert.equal(JSON.parse(dom.els.input.value).cases.length, 1, "existing input value untouched");
});
