/**
 * privilege-log-builder — deterministic core. (original-idea artifact)
 *
 * Document-set JSON in (author / recipients / date / type / subject) →
 * draft privilege log entries with FRE 26(b)(5)-style fields, privilege-type
 * inference from metadata heuristics (attorney-client / work-product),
 * near-duplicate detection, incomplete-entry flags, and court-ready log
 * exports (Markdown + CSV). The core infers ONLY from metadata and marks
 * every inference as a heuristic for attorney confirmation — it never
 * declares privilege on its own authority.
 * @module core
 */

/* ---------- rules-as-data (inference heuristics, editable) ---------- */

/**
 * Inference heuristics. These are metadata-level heuristics, not legal
 * determinations; every inferred entry is tagged `metadata_heuristic` and
 * routed for attorney confirmation.
 * @type {Object}
 */
export const INFERENCE_RULES = {
  version: "2026-11-example",
  attorneyRoles: ["attorney", "paralegal"],      // sender/side roles treated as counsel side
  clientRoles: ["client", "corporate_officer"],  // recipient roles treated as client side
  thirdPartyRoles: ["third_party", "vendor", "opposing_counsel", "expert"],
  workProductDocTypes: ["memo", "notes", "draft", "brief_draft", "research_memo"],
  nearDuplicate: {
    subjectJaccard: 0.6,      // same-author subject similarity threshold
    signatureExact: true,     // identical (author+recipients+docType+subject) always groups
  },
};

/* ---------- small helpers ---------- */

/** Normalize a string for comparison: lowercase, collapse non-alphanumerics.
 * @param {string} s @returns {string} */
export function normalize(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Tokenize a string for Jaccard comparison.
 * @param {string} s @returns {Set<string>} */
export function tokens(s) {
  return new Set(normalize(s).split(" ").filter(Boolean));
}

/** Jaccard similarity of two token sets.
 * @param {Set<string>} a @param {Set<string>} b @returns {number} */
export function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Parse "YYYY-MM-DD" to UTC Date; null when unparseable.
 * @param {string|undefined|null} d @returns {Date|null} */
export function parseDate(d) {
  if (!d || typeof d !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null;
  return dt;
}

/** CSV-quote a field.
 * @param {string} s @returns {string} */
function csvq(s) {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/* ---------- inference ---------- */

/**
 * Infer privilege type(s) from metadata only. Returns inferred types with
 * the rule text behind each, plus flags for review.
 * @param {Object} doc one document record
 * @returns {{types:string[], basis:{type:string,text:string}[], flags:{code:string,text:string}[]}}
 */
export function inferPrivilege(doc) {
  const types = [];
  const basis = [];
  const flags = [];
  const author = doc.author ?? {};
  const recipients = doc.recipients ?? [];
  const ccs = doc.cc ?? [];
  const everyone = [...recipients, ...ccs];
  const authorIsCounsel = INFERENCE_RULES.attorneyRoles.includes(author.role);
  const authorIsClient = INFERENCE_RULES.clientRoles.includes(author.role);
  const anyCounselRecipient = everyone.some((r) => INFERENCE_RULES.attorneyRoles.includes(r.role));
  const anyClientRecipient = everyone.some((r) => INFERENCE_RULES.clientRoles.includes(r.role));
  const thirdParties = everyone.filter((r) => INFERENCE_RULES.thirdPartyRoles.includes(r.role));

  // Attorney-client heuristic: counsel on one side, client on the other, no third parties
  const counselToClient = authorIsCounsel && anyClientRecipient;
  const clientToCounsel = authorIsClient && anyCounselRecipient;
  if ((counselToClient || clientToCounsel) && thirdParties.length === 0) {
    types.push("attorney_client");
    basis.push({
      type: "attorney_client",
      text: counselToClient
        ? `Author "${author.name}" is ${author.role}; client-side recipient(s) present; no third-party recipients.`
        : `Author "${author.name}" is client-side; counsel recipient(s) present; no third-party recipients.`,
    });
  }
  if ((counselToClient || clientToCounsel) && thirdParties.length > 0) {
    flags.push({
      code: "third_party_present",
      text: `Third-party recipient(s) ${thirdParties.map((t) => t.name).join(", ")} break the confidentiality pattern — attorney-client NOT inferred from metadata.`,
    });
  }

  // Work-product heuristic: counsel author + anticipation flag or typical work-product doc type
  const workDoc = INFERENCE_RULES.workProductDocTypes.includes(doc.docType);
  if (authorIsCounsel && (doc.anticipationOfLitigation === true || workDoc)) {
    types.push("work_product");
    basis.push({
      type: "work_product",
      text: doc.anticipationOfLitigation === true
        ? `Counsel author and document flagged anticipationOfLitigation.`
        : `Counsel author and docType "${doc.docType}" matches typical work-product document types.`,
    });
  }

  if (types.length === 2) types.splice(0, types.length, "both");
  if (types.length === 0 && !flags.some((f) => f.code === "third_party_present")) {
    flags.push({
      code: "no_privilege_signal",
      text: "No counsel↔client pattern and no work-product markers in metadata; treated as likely non-privileged pending review.",
    });
  }
  return { types, basis, flags };
}

/* ---------- entry construction ---------- */

/**
 * Build one draft log entry (FRE 26(b)(5)-style fields) from a document.
 * @param {Object} doc
 * @param {number} index 1-based log number
 * @returns {Object} draft entry
 */
export function buildEntry(doc, index) {
  const inf = inferPrivilege(doc);
  const incomplete = [];
  if (!parseDate(doc.date)) incomplete.push(doc.date ? `date "${doc.date}" unparseable` : "date missing");
  if (!doc.author?.name || !doc.author?.role) incomplete.push("author name or role missing");
  if (!(doc.recipients ?? []).length) incomplete.push("no recipients listed");
  if (!doc.docType) incomplete.push("docType missing");
  const description = doc.subject
    ? `${(doc.docType ?? "Document").replace(/_/g, " ")} re: ${doc.subject}`
    : `${(doc.docType ?? "Document").replace(/_/g, " ")} (no subject recorded)`;
  return {
    logNumber: index,
    docId: doc.id ?? `doc-${index}`,
    date: parseDate(doc.date) ? doc.date : null,
    docType: doc.docType ?? null,
    author: doc.author?.name ?? null,
    authorRole: doc.author?.role ?? null,
    recipients: (doc.recipients ?? []).map((r) => r.name),
    cc: (doc.cc ?? []).map((r) => r.name),
    subject: doc.subject ?? null,
    description,                       // draft from metadata — attorney edits before filing
    privilegeType: inf.types.length ? inf.types[0] : "none_inferred",
    basis: inf.basis,
    confidence: "metadata_heuristic",
    reviewFlags: [...inf.flags, ...incomplete.map((i) => ({ code: "incomplete_entry", text: i }))],
    status: incomplete.length ? "incomplete" : "draft",
  };
}

/* ---------- near-duplicate detection ---------- */

/**
 * Detect near-duplicate documents: identical (author+recipients+docType+subject)
 * signatures, or same-author subject Jaccard ≥ threshold.
 * @param {Object[]} entries built entries (with subjects) — pairs returned as docId pairs
 * @param {Object[]} docs original documents (for author context)
 * @returns {{group:string, docIds:string[], reason:string}[]}
 */
export function detectNearDuplicates(docs) {
  const groups = [];
  const seen = new Map(); // signature -> docIds
  for (const d of docs) {
    const sig = [
      normalize(d.author?.name),
      (d.recipients ?? []).map((r) => normalize(r.name)).sort().join("|"),
      normalize(d.docType),
      normalize(d.subject),
    ].join(" :: ");
    if (!seen.has(sig)) seen.set(sig, []);
    seen.get(sig).push(d.id ?? `doc-${docs.indexOf(d) + 1}`);
  }
  let g = 1;
  for (const [sig, ids] of seen) if (ids.length > 1) {
    groups.push({ group: `ND-${g++}`, docIds: ids, reason: `identical author/recipient/type/subject signature` });
  }
  // fuzzy pass: same author, subject Jaccard
  const list = [...docs];
  const grouped = new Set(groups.flatMap((x) => x.docIds));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (normalize(a.author?.name) !== normalize(b.author?.name)) continue;
      const ida = a.id ?? `doc-${i + 1}`, idb = b.id ?? `doc-${j + 1}`;
      if (grouped.has(ida) && grouped.has(idb)) continue;
      const sim = jaccard(tokens(a.subject ?? ""), tokens(b.subject ?? ""));
      if (sim >= INFERENCE_RULES.nearDuplicate.subjectJaccard && sim < 1) {
        groups.push({ group: `ND-${g++}`, docIds: [ida, idb], reason: `same author, subject similarity ${(sim * 100).toFixed(0)}%` });
        grouped.add(ida); grouped.add(idb);
      }
    }
  }
  return groups;
}

/* ---------- engine ---------- */

/**
 * @typedef {Object} LogInput
 * @property {string} [matter]
 * @property {Object[]} documents
 */

/**
 * Build the full draft privilege log.
 * @param {LogInput} input
 * @returns {Object} log
 */
export function buildLog(input) {
  const docs = input?.documents ?? [];
  const entries = docs.map((d, i) => buildEntry(d, i + 1));
  const nearDuplicates = detectNearDuplicates(docs);
  const ndCounts = new Map();
  for (const g of nearDuplicates) for (const id of g.docIds) ndCounts.set(id, g.group);
  for (const e of entries) {
    if (ndCounts.has(e.docId)) {
      e.reviewFlags.push({ code: "near_duplicate", text: `part of near-duplicate group ${ndCounts.get(e.docId)}` });
    }
  }
  return {
    matter: input?.matter ?? null,
    generatedFrom: "metadata heuristics — every entry requires attorney review before service",
    inferenceRulesVersion: INFERENCE_RULES.version,
    entries,
    nearDuplicates,
    summary: {
      total: entries.length,
      attorneyClient: entries.filter((e) => e.privilegeType === "attorney_client").length,
      workProduct: entries.filter((e) => e.privilegeType === "work_product").length,
      both: entries.filter((e) => e.privilegeType === "both").length,
      noneInferred: entries.filter((e) => e.privilegeType === "none_inferred").length,
      incomplete: entries.filter((e) => e.status === "incomplete").length,
      nearDuplicateGroups: nearDuplicates.length,
    },
    disclaimer:
      "Draft log generated from document metadata only. Privilege determinations " +
      "require attorney review of document content; heuristics are not legal conclusions.",
  };
}

/** Court-ready Markdown log.
 * @param {ReturnType<buildLog>} log
 * @returns {string} */
export function renderLog(log) {
  const L = [];
  L.push(`# Privilege log (DRAFT — attorney review required)${log.matter ? ` — ${log.matter}` : ""}`);
  L.push("");
  const s = log.summary;
  L.push(`**${s.total}** entries · ${s.attorneyClient} attorney-client · ${s.workProduct} work-product · ${s.both} both · ${s.noneInferred} no signal · ${s.incomplete} incomplete · ${s.nearDuplicateGroups} near-duplicate groups · inference rules v${log.inferenceRulesVersion}`);
  L.push("");
  L.push("| # | Doc ID | Date | Type | Author | Recipients | Privilege (inferred) | Description (draft) | Flags |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const e of log.entries) {
    L.push(`| ${e.logNumber} | ${e.docId} | ${e.date ?? "—"} | ${e.docType ?? "—"} | ${e.author ?? "—"} (${e.authorRole ?? "?"}) | ${e.recipients.join(", ") || "—"} | ${e.privilegeType} | ${e.description.replace(/\|/g, "\\|")} | ${e.reviewFlags.map((f) => f.code).join(", ") || "—"} |`);
  }
  if (log.nearDuplicates.length) {
    L.push("");
    L.push("## Near-duplicate groups");
    for (const g of log.nearDuplicates) L.push(`- **${g.group}**: ${g.docIds.join(", ")} — ${g.reason}`);
  }
  L.push("");
  L.push("---");
  L.push(`> ⚠️ ${log.disclaimer}`);
  return L.join("\n") + "\n";
}

/** Court-ready CSV log (FRE 26(b)(5)-style columns).
 * @param {ReturnType<buildLog>} log
 * @returns {string} */
export function toCSV(log) {
  const head = "log_number,doc_id,date,doc_type,author,author_role,recipients,cc,privilege_type,description,flags";
  const rows = log.entries.map((e) =>
    [
      e.logNumber, e.docId, e.date ?? "", e.docType ?? "", e.author ?? "", e.authorRole ?? "",
      e.recipients.join("; "), e.cc.join("; "), e.privilegeType, e.description,
      e.reviewFlags.map((f) => f.code).join("; "),
    ].map(csvq).join(","),
  );
  return [head, ...rows].join("\r\n") + "\r\n";
}
