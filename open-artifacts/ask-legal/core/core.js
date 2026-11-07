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
  "a an the is are was were be been being of for to in on at by with about into from as that this it its do does did can could should would will shall may might must i we you our your their what when where who whom how which and or if not no yes".split(" ")
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
 * @param {Array<any>} kb — [{ id, question, answer, tags: string[], jurisdiction, updated, approvedBy }]
 * @param {string} question
 * @returns {Array<{ entry: any, score: number, matchedTags: string[], matchedTerms: string[] }>} ranked, best first
 */
export function retrieve(kb, question) {
  const qTokens = new Set(tokenize(question));
  const results = (kb ?? []).map((entry) => {
    /** @type {string[]} */ const matchedTags = [];
    for (const tag of entry.tags ?? []) {
      const t = String(tag).toLowerCase();
      if (qTokens.has(t) || tokenize(question).some((qt) => qt === t || t.includes(qt) || qt.includes(t))) {
        matchedTags.push(String(tag));
      }
    }
    const eTokens = tokenize(entry.question);
    const aTokens = tokenize(entry.answer);
    const matchedTerms = [...qTokens].filter((t) => eTokens.includes(t));
    const answerHits = [...qTokens].filter((t) => aTokens.includes(t));
    const score = matchedTags.length * 3 + matchedTerms.length * 2 + answerHits.length;
    return { entry, score, matchedTags, matchedTerms: [...new Set([...matchedTerms, ...answerHits])] };
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
 * guidance down one tier; zero retrieval is always "low".
 * @param {Array<any>} kb
 * @param {string} question
 * @param {{ high?: number, medium?: number, freshnessDays?: number }} [thresholds]
 * @param {string} [asOfIso] — anchor for freshness; omit to skip freshness check
 * @returns {{ level: "high"|"medium"|"low", reasons: string[], top: null|any, ranked: Array<any> }}
 */
export function gaugeConfidence(kb, question, thresholds = {}, asOfIso) {
  const th = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const ranked = retrieve(kb, question);
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
  return { level, reasons, top: top.entry, ranked };
}

/* ---------- answering + escalation ---------- */

/**
 * Route table resolution: topic → owning team (rules-as-data).
 * @param {any} entry — KB entry (may be null)
 * @param {Record<string,string>} routing — { [tagOrTopic]: team }
 * @returns {string} */
export function routeTo(entry, routing = {}) {
  if (!entry) return routing["default"] ?? "legal-intake";
  for (const tag of entry.tags ?? []) {
    if (routing[tag]) return routing[tag];
  }
  return routing["default"] ?? "legal-intake";
}

/**
 * Answer a question against the KB with confidence gating, escalation, and
 * an audit-log entry appended to `auditLog`.
 *
 * Rules: only "high" and "medium" confidence return guidance text;
 * "medium" is labeled as provisional; "low" escalates and returns no answer
 * (NEVER guesses).
 * @param {Array<any>} kb
 * @param {string} question
 * @param {{ thresholds?: object, asOf?: string, askedBy?: string, routing?: Record<string,string> }} [opts]
 * @param {Array<any>} [auditLog] — mutated in place; caller persists it
 * @returns {{ answered: boolean, answer: string|null, sourceId: string|null, confidence: { level: string, reasons: string[] }, escalate: boolean, route: string, auditId: string }}
 */
export function answerQuestion(kb, question, opts = {}, auditLog = []) {
  const { level, reasons, top, ranked } = gaugeConfidence(kb, question, opts.thresholds, opts.asOf);
  const escalate = level === "low";
  const route = escalate ? routeTo(top, opts.routing) : null;
  const auditId = `AUD-${String(auditLog.length + 1).padStart(5, "0")}`;
  const result = {
    answered: !escalate,
    answer: escalate ? null : top.answer,
    sourceId: escalate ? null : top.id,
    confidence: { level, reasons },
    escalate,
    route: escalate ? route : null,
    auditId,
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
