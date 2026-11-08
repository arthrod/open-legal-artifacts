/**
 * ask-legal — deterministic core.
 *
 * Guidance-base Q&A over a local JSON knowledge base: retrieval by topic
 * tags + token overlap, per-answer confidence gating (high/medium/low with
 * reasons), escalation flag when confidence is low, and a full audit log of
 * every question asked. No network, no LLM required for the deterministic
 * path; an optional LLM step (prompt schema in spec.md) may only rephrase
 * the retrieved approved answer, never generate new legal content.
 *
 * Dependency-free plain-JavaScript ES module; browser + Node compatible.
 * No hidden clocks: freshness math anchors to caller-supplied `asOf`.
 * @module core
 */

/* ---------- helpers ---------- */

const STOPWORDS = new Set(
  "a an the is are was were be been being of for to in on at by with about into from as that this it its do does did can could should would will shall may might must need needs i we you our your their what when where who whom how which and or if not no yes".split(" ")
);

/** Tokenize a string into meaningful lowercase terms (stopwords removed).
 * @param {string} s
 * @returns {string[]} */
export function tokenize(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Deterministic plural folding so "vendors" matches "vendor" (and back).
 * Conservative: strips a regular plural "s", strips "es" only after a sibilant
 * stem ending in x/z/ch/sh or a double "s" ("boxes" → "box", "classes" → "class"),
 * and maps "…ies" → "…y". A trailing "es" after any other stem is a regular -e
 * base taking plain -s, so only the "s" goes: "licenses" → "license",
 * "clauses" → "clause". Never touches "ss" words (class, business). Known
 * limit: "-ses" after a single-s stem is ambiguous without a lexicon
 * ("buses" folds to "buse", not "bus").
 * @param {string} t
 * @returns {string} */
export function foldToken(t) {
  if (t.endsWith("ies") && t.length > 4) return t.slice(0, -3) + "y";
  if (t.length > 4 && /(?:x|z|ch|sh|ss)es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss") && t.length > 3) return t.slice(0, -1);
  return t;
}

/** Synonym groups as rules-as-data: key and values are one equivalence class
 * (query vocabulary expands across the group; override per deployment).
 * @type {Record<string, string[]>} */
export const DEFAULT_SYNONYMS = {
  confidentiality: ["nda"],
  supplier: ["vendor"],
  staff: ["employee"],
  spend: ["expense"],
};

/** Expand tokens with their synonym-group members (no self-duplicates).
 * @param {Iterable<string>} tokens
 * @param {Record<string, string[]>|null} synonyms
 * @returns {string[]} */
export function expandTokens(tokens, synonyms) {
  const groups = Object.entries(synonyms ?? {}).map(([k, v = []]) => [k, ...v]);
  const extra = [];
  for (const t of tokens) for (const g of groups) if (g.includes(t)) extra.push(...g.filter((x) => x !== t));
  return extra;
}

/** Parse "YYYY-MM-DD" to UTC Date; null when unparseable (never guessed).
 * @param {string|null|undefined} d
 * @returns {Date|null} */
export function parseDate(d) {
  if (!d || typeof d !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/* ---------- retrieval ---------- */

/**
 * Deterministic retrieval: score each KB entry by
 *   3 × exact tag keyword hit + 2 × question-title token overlap + answer token overlap.
 * Tokens compare plural-folded ("vendors" ≡ "vendor") and queries expand across
 * the synonym map; tag substring matching requires both sides ≥ 4 chars so a
 * query like "tips" cannot hit a short tag like "ip".
 * Entries with a status other than "approved" (e.g. pending-approval corrections)
 * are never retrieved or served.
 * @param {Array<any>} kb — [{ id, question, answer, tags: string[], jurisdiction, updated, approvedBy, status? }]
 * @param {string} question
 * @param {Record<string, string[]>|null} [synonyms] — defaults to DEFAULT_SYNONYMS; pass null to disable
 * @returns {Array<{ entry: any, score: number, matchedTags: string[], matchedTerms: string[] }>} ranked, best first; matchedTerms are recorded plural-folded ("vendors" → "vendor")
 */
export function retrieve(kb, question, synonyms = DEFAULT_SYNONYMS) {
  const qBase = tokenize(question);
  const qSet = new Set([...qBase, ...expandTokens(qBase, synonyms)]);
  const qFolded = new Set([...qSet].map(foldToken));
  const results = (kb ?? []).flatMap((entry) => {
    if (entry && entry.status && entry.status !== "approved") return []; // pending corrections are invisible
    /** @type {string[]} */ const matchedTags = [];
    for (const tag of entry?.tags ?? []) {
      const t = String(tag).toLowerCase();
      const substringHit = [...qSet].some(
        (qt) => qt.length >= 4 && t.length >= 4 && (t.includes(qt) || qt.includes(t))
      );
      if (qSet.has(t) || qFolded.has(foldToken(t)) || substringHit) matchedTags.push(String(tag));
    }
    const eFolded = tokenize(entry?.question ?? "").map(foldToken);
    const aFolded = tokenize(entry?.answer ?? "").map(foldToken);
    const matchedTerms = [...qSet].filter((t) => eFolded.includes(foldToken(t))).map(foldToken);
    const answerHits = [...qSet].filter((t) => aFolded.includes(foldToken(t))).map(foldToken);
    const score = matchedTags.length * 3 + matchedTerms.length * 2 + answerHits.length;
    return [{ entry, score, matchedTags, matchedTerms: [...new Set([...matchedTerms, ...answerHits])] }];
  });
  return results.filter((r) => r.score > 0).sort(
    (a, b) => b.score - a.score || String(a.entry.id).localeCompare(String(b.entry.id))
  );
}

/* ---------- confidence gating ---------- */

/** Default gating thresholds (rules-as-data; override per deployment).
 * @type {{ high: number, medium: number, freshnessDays: number }} */
export const DEFAULT_THRESHOLDS = { high: 9, medium: 5, freshnessDays: 365 };

/**
 * Score-based confidence with written reasons. Freshness penalizes stale
 * guidance down one tier; a jurisdiction mismatch between the question and the
 * matched guidance also downgrades one tier (with a receipt); zero retrieval is
 * always "low".
 * @param {Array<any>} kb
 * @param {string} question
 * @param {{ high?: number, medium?: number, freshnessDays?: number }} [thresholds]
 * @param {string} [asOfIso] — anchor for freshness; omit to skip freshness check
 * @param {{ jurisdiction?: string, synonyms?: Record<string, string[]>|null }} [opts]
 * @returns {{ level: "high"|"medium"|"low", reasons: string[], top: null|any, ranked: Array<any> }}
 */
export function gaugeConfidence(kb, question, thresholds = {}, asOfIso, opts = {}) {
  const th = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const ranked = retrieve(kb, question, opts.synonyms ?? DEFAULT_SYNONYMS);
  /** @type {string[]} */ const reasons = [];

  if (ranked.length === 0) {
    return { level: "low", reasons: ["no knowledge-base entry matched any question term or tag"], top: null, ranked: [] };
  }
  const top = ranked[0];
  const margin = ranked[1] ? top.score - ranked[1].score : top.score;
  reasons.push(`best match "${top.entry.question}" scored ${top.score} (tags: ${top.matchedTags.join(", ") || "none"}; terms: ${top.matchedTerms.join(", ") || "none"})`);

  let level = top.score >= th.high ? "high" : top.score >= th.medium ? "medium" : "low";
  if (level !== "low") reasons.push(`score ${top.score} ${top.score >= th.high ? "≥" : "<"} high threshold ${th.high}`);
  if (level === "low") reasons.push(`score ${top.score} below medium threshold ${th.medium}`);

  if (level === "high" && margin < 2 && ranked[1]) {
    level = "medium";
    reasons.push(`downgraded: runner-up "${ranked[1].entry.question}" is close (margin ${margin}) — ambiguity between entries`);
  }

  const asOf = parseDate(asOfIso ?? null);
  const updated = parseDate(top.entry.updated ?? null);
  if (asOf && updated) {
    const ageDays = Math.round((asOf.getTime() - updated.getTime()) / 86400000);
    if (ageDays > th.freshnessDays) {
      reasons.push(`guidance is ${ageDays}d old (> ${th.freshnessDays}d freshness window) — downgraded one tier`);
      level = level === "high" ? "medium" : "low";
    } else {
      reasons.push(`guidance verified ${ageDays}d ago (within ${th.freshnessDays}d window)`);
    }
  }

  const askedJur = opts.jurisdiction ? String(opts.jurisdiction).toLowerCase() : null;
  const entryJur = top.entry.jurisdiction ? String(top.entry.jurisdiction).toLowerCase() : null;
  if (askedJur && entryJur && askedJur !== entryJur) {
    reasons.push(`jurisdiction mismatch: guidance covers ${top.entry.jurisdiction} but question is under ${opts.jurisdiction} — downgraded one tier; confirm with local counsel`);
    level = level === "high" ? "medium" : "low";
  }
  return { level, reasons, top: top.entry, ranked };
}

/* ---------- answering + escalation ---------- */

/**
 * Route table resolution: topic → owning team (rules-as-data). Values may be a
 * plain team string or `{ team, slaDays }` (per-topic SLA; see overdueEscalations).
 * @param {any} entry — KB entry (may be null)
 * @param {Record<string,string|{team:string,slaDays:number}>} routing — { [tagOrTopic]: team }
 * @returns {string} */
export function routeTo(entry, routing = {}) {
  const pick = (r) => (r == null ? null : typeof r === "string" ? r : r.team);
  if (!entry) return pick(routing["default"]) ?? "legal-intake";
  for (const tag of entry.tags ?? []) {
    const r = pick(routing[tag]);
    if (r) return r;
  }
  return pick(routing["default"]) ?? "legal-intake";
}

/**
 * Validate a knowledge base before serving. Every servable entry (no status, or
 * status "approved") must have: unique id, answer text, an approver, and a
 * parseable YYYY-MM-DD updated date. `pending-approval` entries are skipped —
 * they are an expected lifecycle state and are never served.
 * @param {Array<any>} kb
 * @returns {Array<{ entryId: string|null, field: string, issue: string }>} issues (empty = valid)
 */
export function validateKb(kb) {
  /** @type {Array<{ entryId: string|null, field: string, issue: string }>} */ const issues = [];
  const seen = new Set();
  for (const entry of kb ?? []) {
    if (entry?.status === "pending-approval") continue;
    const id = entry && entry.id != null ? String(entry.id) : null;
    const ref = id ?? "(entry without id)";
    if (!id) issues.push({ entryId: null, field: "id", issue: "missing id" });
    else if (seen.has(id)) issues.push({ entryId: id, field: "id", issue: "duplicate id" });
    if (id) seen.add(id);
    if (!entry || typeof entry.answer !== "string" || !entry.answer.trim()) {
      issues.push({ entryId: ref, field: "answer", issue: "missing answer text" });
    }
    if (!entry || !entry.approvedBy) {
      issues.push({ entryId: ref, field: "approvedBy", issue: "missing approver — unapproved guidance must not be served" });
    }
    if (!entry || !parseDate(entry.updated)) {
      issues.push({ entryId: ref, field: "updated", issue: "missing or unparseable YYYY-MM-DD updated date" });
    }
  }
  return issues;
}

/**
 * Answer a question against the KB with confidence gating, escalation, and
 * an audit-log entry appended to `auditLog`.
 *
 * Rules: the KB must pass validateKb (invalid KBs are refused — unapproved
 * guidance is never served); only "high" and "medium" confidence return
 * guidance text; "medium" is flagged provisional with a label; "low"
 * escalates and returns no answer (NEVER guesses), carrying a suggested
 * entry snapshot for the lawyer. A jurisdiction mismatch (opts.jurisdiction
 * vs the matched entry's jurisdiction) downgrades confidence one tier.
 * @param {Array<any>} kb
 * @param {string} question
 * @param {{ thresholds?: object, asOf?: string, askedBy?: string, routing?: Record<string,any>, jurisdiction?: string, synonyms?: Record<string, string[]>|null }} [opts]
 * @param {Array<any>} [auditLog] — mutated in place; caller persists it
 * @returns {{ answered: boolean, answer: string|null, sourceId: string|null, confidence: { level: string, reasons: string[] }, escalate: boolean, route: string|null, auditId: string, provisional: boolean, label: string|null, suggestedEntry: { id: string, question: string }|null }}
 * @throws {Error} when the knowledge base fails validation
 */
export function answerQuestion(kb, question, opts = {}, auditLog = []) {
  const issues = validateKb(kb);
  if (issues.length) {
    const detail = issues.map((i) => `${i.entryId ?? "?"}.${i.field}: ${i.issue}`).join("; ");
    throw new Error(`knowledge base failed validation (${issues.length} issue${issues.length === 1 ? "" : "s"}): ${detail}`);
  }
  const { level, reasons, top, ranked } = gaugeConfidence(kb, question, opts.thresholds, opts.asOf, {
    jurisdiction: opts.jurisdiction,
    synonyms: opts.synonyms,
  });
  const escalate = level === "low";
  const route = escalate ? routeTo(top, opts.routing) : null;
  const auditId = `AUD-${String(auditLog.length + 1).padStart(5, "0")}`;
  const provisional = !escalate && level === "medium";
  const result = {
    answered: !escalate,
    answer: escalate ? null : top.answer,
    sourceId: escalate ? null : top.id,
    confidence: { level, reasons },
    escalate,
    route: escalate ? route : null,
    auditId,
    provisional,
    label: provisional ? "Provisional guidance — confirm with Legal." : null,
    suggestedEntry: escalate && top ? { id: top.id, question: top.question } : null,
  };
  auditLog.push({
    auditId,
    ts: opts.asOf ?? null, // deterministic timestamp supplied by caller (or null for caller-side stamping)
    askedBy: opts.askedBy ?? "anonymous",
    question,
    matched: ranked.map((r) => r.entry.id),
    confidenceLevel: level,
    escalated: escalate,
    route: result.route,
  });
  return result;
}

/**
 * Create an empty audit log (explicit so persistence is a visible decision).
 * @returns {Array<any>} */
export function createAuditLog() {
  return [];
}

/**
 * Serialize the audit log for export (append-only JSON lines).
 * @param {Array<any>} auditLog
 * @returns {string} */
export function exportAuditLog(auditLog) {
  return (auditLog ?? []).map((e) => JSON.stringify(e)).join("\n") + ((auditLog ?? []).length ? "\n" : "");
}

/* ---------- escalation ticket (drafts the ask) ---------- */

/**
 * Draft a deterministic intake ticket from an escalated answer + its audit-log
 * entry: what was asked, by whom, what matched, why it escalated, where it
 * routed, and the closest KB entry (if any) for the lawyer to start from.
 * Plain data — JSON-serializable as-is.
 * @param {{ auditId: string, route: string|null, confidence?: { reasons: string[] }, suggestedEntry?: any }} result — escalated answerQuestion result
 * @param {Array<any>} auditLog
 * @returns {{ route: string|null, question: string|null, asker: string|null, matchedIds: string[], reasons: string[], suggestedEntry: { id: string, question: string }|null }}
 */
export function escalationTicket(result, auditLog = []) {
  const audit = (auditLog ?? []).find((e) => e.auditId === result?.auditId) ?? {};
  return {
    route: result?.route ?? null,
    question: audit.question ?? null,
    asker: audit.askedBy ?? null,
    matchedIds: audit.matched ?? [],
    reasons: result?.confidence?.reasons ?? [],
    suggestedEntry: result?.suggestedEntry ?? null,
  };
}

/* ---------- correction loop (lawyer feedback → guidance base) ---------- */

/**
 * Record a lawyer's correction to an escalated question as a NEW KB entry in
 * `pending-approval` state, linked to the audit entry that asked it. The entry
 * is unretrievable (and exempt from validation) until approveEntry flips it.
 * @param {Array<any>} kb — mutated in place (entry appended)
 * @param {Array<any>} auditLog — source of the original question
 * @param {{ auditId: string, answer: string, approvedBy?: string, tags?: string[], jurisdiction?: string, updated?: string }} correction
 * @returns {{ entry: any, status: "pending-approval" }}
 * @throws {Error} when the audit id is unknown (corrections must link to an asked question)
 */
export function applyCorrection(kb, auditLog, correction = {}) {
  const audit = (auditLog ?? []).find((e) => e.auditId === correction.auditId);
  if (!audit) {
    throw new Error(`applyCorrection: audit entry ${correction.auditId} not found — corrections must link to an asked question`);
  }
  const entry = {
    id: `kb-corr-${String(correction.auditId).toLowerCase().replace(/^aud-/, "")}`,
    question: audit.question,
    answer: correction.answer,
    tags: correction.tags ?? [],
    jurisdiction: correction.jurisdiction ?? null,
    updated: correction.updated ?? null,
    approvedBy: null, // set by approveEntry; pending entries are never served
    status: "pending-approval",
    sourceAuditId: correction.auditId,
    submittedBy: correction.approvedBy ?? null,
  };
  (kb ?? []).push(entry);
  return { entry, status: entry.status };
}

/**
 * Approve a pending-approval correction: flips status to "approved" and stamps
 * the approver, making the entry retrievable from that point on. The entry must
 * carry a non-empty answer and a parseable YYYY-MM-DD `updated` date — approving
 * anything less would poison validateKb and brick every later answerQuestion.
 * @param {Array<any>} kb
 * @param {string} entryId
 * @param {string} approvedBy
 * @returns {{ entry: any, status: "approved" }}
 * @throws {Error} when the entry is missing, not pending, the approver is blank,
 *   or the entry would fail validateKb (no answer text / unparseable updated)
 */
export function approveEntry(kb, entryId, approvedBy) {
  const e = (kb ?? []).find((x) => x.id === entryId);
  if (!e) throw new Error(`approveEntry: no entry with id ${entryId}`);
  if (e.status !== "pending-approval") {
    throw new Error(`approveEntry: entry ${entryId} is '${e.status ?? "approved"}', not pending-approval — only pending corrections can be approved`);
  }
  if (!approvedBy) throw new Error("approveEntry: approvedBy is required");
  if (typeof e.answer !== "string" || !e.answer.trim()) {
    throw new Error(`approveEntry: entry ${entryId} has no answer text — approving it would fail validateKb`);
  }
  if (!parseDate(e.updated)) {
    throw new Error(`approveEntry: entry ${entryId} has no parseable YYYY-MM-DD updated date — approving it would fail validateKb`);
  }
  e.status = "approved";
  e.approvedBy = approvedBy;
  return { entry: e, status: e.status };
}

/* ---------- escalation SLAs ---------- */

/** Parse "YYYY-MM-DD" (UTC midnight) or a full ISO timestamp; null when unparseable.
 * @param {string|null|undefined} v
 * @returns {Date|null} */
function parseTs(v) {
  if (!v || typeof v !== "string") return null;
  const d = parseDate(v);
  if (d) return d;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * Flag escalated audit entries whose owning team is past its routing SLA.
 * SLAs come from the routing table's `{ team, slaDays }` values (rules-as-data);
 * teams without a configured SLA and entries without a parseable ts are skipped.
 * @param {Array<any>} auditLog
 * @param {Record<string,string|{team:string,slaDays:number}>} routing
 * @param {string} asOfIso — anchor date; no hidden clocks
 * @returns {Array<{ auditId: string, route: string, question: string|null, opened: string|null, ageDays: number, slaDays: number, overdueByDays: number }>}
 */
export function overdueEscalations(auditLog, routing = {}, asOfIso) {
  const asOf = parseTs(asOfIso);
  if (!asOf) return [];
  const slaByTeam = {};
  for (const v of Object.values(routing ?? {})) {
    if (v && typeof v === "object" && v.team && Number.isFinite(v.slaDays)) slaByTeam[v.team] = v.slaDays;
  }
  const out = [];
  for (const e of auditLog ?? []) {
    if (!e || !e.escalated || !e.route) continue;
    const slaDays = slaByTeam[e.route];
    if (slaDays == null) continue; // no SLA configured for this team — cannot judge
    const opened = parseTs(e.ts);
    if (!opened) continue;
    const ageDays = Math.round((asOf.getTime() - opened.getTime()) / 86400000);
    if (ageDays > slaDays) {
      out.push({
        auditId: e.auditId,
        route: e.route,
        question: e.question ?? null,
        opened: e.ts ?? null,
        ageDays,
        slaDays,
        overdueByDays: ageDays - slaDays,
      });
    }
  }
  return out;
}
