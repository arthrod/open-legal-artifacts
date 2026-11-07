/** Tests: privilege-log-builder core. Run: node --test 'core/*.test.js' */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize, tokens, jaccard, parseDate,
  inferPrivilege, buildEntry, detectNearDuplicates, buildLog, renderLog, toCSV, INFERENCE_RULES,
} from "./core.js";

const atty = (name = "A. Moreno") => ({ name, role: "attorney" });
const client = (name = "J. Vale") => ({ name, role: "client" });
const third = (name = "T. Boyd") => ({ name, role: "third_party" });

const doc = (over = {}) => ({
  id: "DOC-001",
  date: "2026-03-04",
  docType: "email",
  author: atty(),
  recipients: [client()],
  subject: "Initial case assessment",
  ...over,
});

test("similarity helpers: normalize, tokens, jaccard", () => {
  assert.equal(normalize("Re: Initial  Case-Assessment!"), "re initial case assessment");
  assert.equal(jaccard(tokens("case assessment memo"), tokens("case assessment memo")), 1);
  assert.equal(jaccard(tokens("case assessment"), tokens("trial brief")), 0);
  const sim = jaccard(tokens("draft memo re trade secrets"), tokens("draft memo re trade secret"));
  assert.ok(sim > 0.5 && sim < 1); // 4/6 shared tokens — morphological drift
  assert.equal(parseDate("2026-13-01"), null);
});

test("attorney→client email with no third parties infers attorney_client with basis text", () => {
  const r = inferPrivilege(doc());
  assert.equal(r.types[0], "attorney_client");
  assert.ok(r.basis[0].text.includes("attorney"));
  assert.equal(r.flags.length, 0);
});

test("client→attorney direction also infers attorney_client", () => {
  const r = inferPrivilege(doc({ author: client(), recipients: [atty()] }));
  assert.equal(r.types[0], "attorney_client");
});

test("third-party recipient blocks attorney-client inference and flags review", () => {
  const r = inferPrivilege(doc({ recipients: [client(), third()] }));
  assert.equal(r.types.length, 0);
  const f = r.flags.find((x) => x.code === "third_party_present");
  assert.ok(f && f.text.includes("T. Boyd"));
});

test("counsel memo flagged anticipation-of-litigation infers work_product", () => {
  const r = inferPrivilege(doc({ docType: "memo", recipients: [], anticipationOfLitigation: true }));
  assert.equal(r.types[0], "work_product");
});

test("counsel docType alone (notes) is enough for the work-product heuristic", () => {
  const r = inferPrivilege(doc({ docType: "notes", recipients: [] }));
  assert.equal(r.types[0], "work_product");
});

test("attorney-client + work-product markers combine into 'both'", () => {
  const r = inferPrivilege(doc({ docType: "memo", anticipationOfLitigation: true }));
  assert.equal(r.types[0], "both");
});

test("no counsel pattern and no markers => no_privilege_signal flag, no inference", () => {
  const r = inferPrivilege(doc({ author: { name: "P. Kerr", role: "engineer" }, recipients: [{ name: "M. Ito", role: "vendor" }] }));
  assert.equal(r.types.length, 0);
  assert.ok(r.flags.some((f) => f.code === "no_privilege_signal"));
});

test("entry: FRE 26(b)(5)-style fields present, description drafted from metadata", () => {
  const e = buildEntry(doc(), 1);
  assert.equal(e.logNumber, 1);
  assert.equal(e.date, "2026-03-04");
  assert.equal(e.author, "A. Moreno");
  assert.deepEqual(e.recipients, ["J. Vale"]);
  assert.equal(e.privilegeType, "attorney_client");
  assert.match(e.description, /email re: initial case assessment/i);
  assert.equal(e.confidence, "metadata_heuristic");
  assert.equal(e.status, "draft");
});

test("entry: missing fields produce incomplete_entry flags and status incomplete", () => {
  const e = buildEntry({ id: "DOC-9", author: { name: "X" }, recipients: [] }, 9);
  assert.equal(e.status, "incomplete");
  assert.ok(e.reviewFlags.some((f) => f.code === "incomplete_entry" && f.text.includes("role missing")));
  assert.ok(e.reviewFlags.some((f) => f.code === "incomplete_entry" && f.text.includes("recipients")));
  assert.equal(e.date, null);
});

test("near-duplicate: identical signature groups; fuzzy same-author subjects group below 1.0", () => {
  const docs = [
    doc({ id: "A1" }),
    doc({ id: "A2" }),                                                    // identical signature
    doc({ id: "A3", subject: "Initial case assessment notes" }),          // fuzzy same author (0.8 sim)
    doc({ id: "B1", author: atty("L. Chu"), subject: "Completely different topic" }),
  ];
  const groups = detectNearDuplicates(docs);
  const exact = groups.find((g) => g.reason.includes("identical"));
  assert.ok(exact && exact.docIds.includes("A1") && exact.docIds.includes("A2") && !exact.docIds.includes("A3"));
  const fuzzy = groups.find((g) => g.reason.includes("similarity"));
  assert.ok(fuzzy && fuzzy.docIds.includes("A3"));
  assert.ok(!groups.some((g) => g.docIds.includes("B1")));
});

test("full log: summary counts, near-duplicate flags propagate to entries", () => {
  const log = buildLog({
    matter: "Kestrel v. Kestrel Dynamics (fictional)",
    documents: [
      doc({ id: "D1" }),
      doc({ id: "D2" }),
      doc({ id: "D3", author: client(), recipients: [atty()], docType: "letter", subject: "Follow-up questions" }),
      doc({ id: "D4", author: { name: "R. Silva", role: "operations" }, recipients: [{ name: "M. Ito", role: "vendor" }], docType: "email", subject: "Shipping schedule" }),
    ],
  });
  assert.equal(log.summary.total, 4);
  assert.equal(log.summary.attorneyClient, 3);   // D1, D2, D3
  assert.equal(log.summary.noneInferred, 1);      // D4
  assert.equal(log.summary.nearDuplicateGroups, 1); // D1/D2
  const d1 = log.entries.find((e) => e.docId === "D1");
  assert.ok(d1.reviewFlags.some((f) => f.code === "near_duplicate" && f.text.includes("ND-1")));
  assert.equal(log.summary.incomplete, 0);
});

test("CSV export: FRE-style header, CRLF, quoted fields", () => {
  const log = buildLog({ documents: [doc(), doc({ id: "D2", subject: "has, commas \" and quotes" })] });
  const csv = toCSV(log);
  const lines = csv.split("\r\n").filter(Boolean);
  assert.equal(lines[0], "log_number,doc_id,date,doc_type,author,author_role,recipients,cc,privilege_type,description,flags");
  assert.equal(lines.length, 3);
  assert.match(lines[2], /"email re: has, commas "" and quotes",/);
});

test("markdown log renders table, near-duplicate section, and attorney-review disclaimer", () => {
  const log = buildLog({ matter: "Kestrel v. Kestrel Dynamics (fictional)", documents: [doc(), doc({ id: "D2" })] });
  const md = renderLog(log);
  assert.match(md, /Privilege log \(DRAFT/);
  assert.match(md, /Kestrel v\. Kestrel Dynamics/);
  assert.match(md, /Near-duplicate groups/);
  assert.match(md, /attorney review/i);
});
