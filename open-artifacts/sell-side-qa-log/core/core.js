/**
 * sell-side-qa-log — deterministic core.
 *
 * M&A sell-side diligence Q&A log: question/buyer/answer/status workflow,
 * deterministic contradiction detection between answers (number conflicts by
 * canonical unit/magnitude + antonym-term conflicts, each with verbatim
 * evidence quotes), an approve→send release gate with an audit trail
 * (transition/releaseBlockers), per-buyer projections with cross-buyer
 * redaction (buyerView), SLA aging (receivedAt + asOf → daysOpen, no clock),
 * a disclosure-readiness score computed from the log (coverage, pipeline,
 * consistency, provenance), and CSV/JSON exports.
 *
 * Dependency-free plain-JavaScript ES module; browser + Node compatible.
 * No timestamps, no randomness, no network: same input → byte-identical
 * output. Antonym pairs, unit vocabulary, SLA bands, and score weights are
 * rules-as-data. Conflicts are heuristics for attorney review — never legal
 * conclusions.
 * @module core
 */

/* ---------- rules-as-data ---------- */

/** Opposing term pairs (either orientation). Word-boundary, case-insensitive.
 * @type {string[][]} */
export const DEFAULT_ANTONYM_PAIRS = [
  ["yes", "no"],
  ["permitted", "prohibited"],
  ["allowed", "prohibited"],
  ["exclusive", "non-exclusive"],
  ["material", "immaterial"],
  ["settled", "pending"],
  ["increase", "decrease"],
  ["binding", "non-binding"],
  ["current", "delinquent"],
  ["disclosed", "undisclosed"],
  ["minority", "majority"],
];

/** Units recognized next to numbers (normalized, lowercase). "" = bare count.
 * @type {string[]} */
export const DEFAULT_UNITS = ["%", "percent", "$", "usd", "million", "mm", "billion", "bn", "x", "days", "months", "years", "employees", "customers", "locations", "stores", "shares"];

/** Magnitude multipliers normalized to a canonical base (e.g. $3.5 million ≡
 * $3,500,000). Applied when a currency marker ($ / usd) is present.
 * @type {Object<string, number>} */
export const MULTIPLIERS = { million: 1e6, mm: 1e6, billion: 1e9, bn: 1e9 };

/** Readiness weights + bands (rules-as-data; override via input.settings).
 * Provenance = sent answers carrying at least one citation.
 * @type {{ weights: { coverage: number, pipeline: number, consistency: number, provenance: number }, bands: { ready: number, nearly: number } }} */
export const DEFAULT_READINESS = {
  weights: { coverage: 0.4, pipeline: 0.15, consistency: 0.25, provenance: 0.2 },
  bands: { nearly: 60, ready: 85 },
};

/** Default SLA bands (rules-as-data; override via input.settings.sla).
 * daysOpen ≥ breachDays → "overdue"; ≥ warnDays → "due-soon".
 * @type {{ warnDays: number, breachDays: number }} */
export const DEFAULT_SLA = { warnDays: 3, breachDays: 5 };

/** Stopwords stripped before keyword-anchor comparison.
 * @type {string[]} */
export const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "without", "at", "by",
  "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "does", "do", "did",
  "not", "no", "any", "all", "as", "it", "its", "this", "that", "these", "those", "there", "their",
  "we", "our", "company", "target", "will", "would", "can", "could", "may", "might", "shall", "should",
]);

/* ---------- workflow state ---------- */

/**
 * Canonical answer for an item: the latest `sent` answer (by `at`, ties by
 * array order). Null when nothing has been sent.
 *
 * @param {{ answers?: Array<{ text: string, status: string, at: string, citations?: any[], approvedBy?: string }> }} item
 * @returns {{ text: string, at: string, index: number, citations: any[] | null, approvedBy: string | null } | null}
 */
export function currentAnswer(item) {
  const answers = item.answers ?? [];
  let best = null;
  answers.forEach((a, index) => {
    if (a.status !== "sent") return;
    if (!best || String(a.at).localeCompare(String(best.at)) >= 0) best = { text: a.text, at: a.at, index, citations: a.citations ?? null, approvedBy: a.approvedBy ?? null };
  });
  return best;
}

/**
 * Pending draft: the latest `draft` answer dated on/after the canonical
 * answer (or any draft when nothing is sent yet). Null when none.
 *
 * @param {any} item
 * @returns {{ text: string, at: string, index: number, citations: any[] | null, approvedBy: string | null } | null}
 */
export function pendingDraft(item) {
  const answers = item.answers ?? [];
  const cur = currentAnswer(item);
  let best = null;
  answers.forEach((a, index) => {
    if (a.status !== "draft") return;
    if (cur && String(a.at).localeCompare(String(cur.at)) < 0) return; // stale draft, already superseded
    if (!best || String(a.at).localeCompare(String(best.at)) >= 0) best = { text: a.text, at: a.at, index, citations: a.citations ?? null, approvedBy: a.approvedBy ?? null };
  });
  return best;
}

/**
 * Derived item status: open (no answers) → draft (no sent yet) → sent →
 * draft-pending (a draft newer than the sent answer awaits re-send).
 *
 * @param {any} item
 * @returns {"open"|"draft"|"sent"|"draft-pending"}
 */
export function itemStatus(item) {
  const answers = item.answers ?? [];
  if (answers.length === 0) return "open";
  const cur = currentAnswer(item);
  if (!cur) return "draft";
  return pendingDraft(item) ? "draft-pending" : "sent";
}

/* ---------- release gate (approve → send) ---------- */

/**
 * Release gate as code: apply one workflow event to an item and return the
 * NEW item (input never mutated). Events:
 *  - `{ type: "approve", approver, at }` — record approval (audit trail:
 *    `approvedBy`/`approvedAt`) on the pending draft.
 *  - `{ type: "send" }` — mark the pending draft `sent`. Requires a prior
 *    approve; sending without approval throws.
 *
 * @param {any} item
 * @param {{ type: "approve"|"send", approver?: string, at?: string }} event
 * @returns {any} new item with updated answers
 */
export function transition(item, event) {
  const type = event?.type;
  const answers = [...(item?.answers ?? [])];
  const dr = pendingDraft(item);
  if (type === "approve") {
    if (!dr) throw new Error(`transition(approve): no pending draft on ${item?.id ?? "(no id)"}`);
    answers[dr.index] = { ...answers[dr.index], approvedBy: event.approver ?? "unspecified approver", approvedAt: event.at ?? null };
    return { ...item, answers };
  }
  if (type === "send") {
    if (!dr) throw new Error(`transition(send): no pending draft on ${item?.id ?? "(no id)"}`);
    if (!answers[dr.index].approvedBy) throw new Error(`transition(send): pending draft on ${item.id} is not approved — approve first (approvedBy/approvedAt is the audit trail)`);
    answers[dr.index] = { ...answers[dr.index], status: "sent" };
    return { ...item, answers };
  }
  throw new Error(`transition: unknown event type ${JSON.stringify(type)}`);
}

/**
 * Blockers that prevent releasing (sending) an item's pending draft:
 * an unapproved draft, and every detected contradiction that involves this
 * item. Accepts full items (with `answers`) or buildQaLog projections.
 *
 * @param {any} item
 * @param {any[]} [contradictions] — output of detectContradictions
 * @returns {Array<{ code: string, detail: string }>}
 */
export function releaseBlockers(item, contradictions = []) {
  const blockers = [];
  const live = Array.isArray(item?.answers);
  const dr = live ? pendingDraft(item) : item?.pendingDraft != null ? { approvedBy: item.draftApproved ? "approved" : null } : null;
  if (!dr) return blockers;
  if (!dr.approvedBy) blockers.push({ code: "unapproved", detail: `pending draft on ${item.id} has no approval recorded — transition(item, { type: "approve", approver, at }) first` });
  for (const c of contradictions) {
    if (!Array.isArray(c.between) || !c.between.includes(item.id)) continue;
    const other = c.between.find((x) => x !== item.id) ?? "?";
    blockers.push({ code: c.kind, detail: `${c.kind} (${c.category}) between ${item.id} and ${other} — ${c.detail}` });
  }
  return blockers;
}

/* ---------- text utilities ---------- */

/** Split text into sentences (deterministic: on . ! ? followed by space/end).
 * @param {string} text @returns {string[]} */
export function sentences(text) {
  return String(text ?? "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Distinctive keywords: lowercase words (≥3 chars) minus stopwords.
 * @param {string} text @returns {Set<string>} */
export function keywords(text) {
  const out = new Set();
  for (const w of String(text ?? "").toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
    if (!STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

/**
 * Extract numbers with their unit from a text. `$3.5 million` → {value:3.5,
 * unit:"million"} (currency + multiplier merge to the multiplier unit);
 * `12%` → {value:12, unit:"%"}; `five employees` is NOT matched (digits
 * only — never guessed from words). Every number also carries a canonical
 * base for magnitude normalization: `$3.5 million` and `$3,500,000` both →
 * { baseValue: 3500000, baseUnit: "usd" }.
 *
 * @param {string} text
 * @param {string[]} [units] — normalized unit vocabulary (default DEFAULT_UNITS)
 * @returns {Array<{ value: number, unit: string, baseValue: number, baseUnit: string, raw: string, sentence: string }>}
 */
export function extractNumbers(text, units = DEFAULT_UNITS) {
  const unitAlt = units.filter((u) => u !== "").map((u) => u.replace(/[$%]/g, (c) => `\\${c}`)).join("|");
  const re = new RegExp(String.raw`(?:(\$|usd)\s*)?(\d[\d,]*(?:\.\d+)?)\s*(%|percent|${unitAlt})?(?!\w)`, "gi");
  const sents = sentences(text);
  const out = [];
  for (const m of text.matchAll(re)) {
    const value = Number(m[2].replace(/,/g, ""));
    if (Number.isNaN(value)) continue;
    let unit = (m[3] ?? "").toLowerCase();
    if (unit === "percent") unit = "%";
    if (!unit && (m[1] ?? "") !== "") unit = "$"; // "$3.5" with no multiplier → currency unit
    // canonical base: currency amounts (with or without a magnitude word) → usd
    let baseValue = value;
    let baseUnit = unit;
    if (unit !== "%" && (m[1] ?? "") !== "") {
      if (MULTIPLIERS[unit]) baseValue = value * MULTIPLIERS[unit];
      baseUnit = "usd";
    }
    const raw = m[0].trim();
    const sentence = sents.find((s) => s.includes(raw)) ?? "";
    out.push({ value, unit, baseValue, baseUnit, raw, sentence });
  }
  return out;
}

/**
 * Evidence quote containing `term`: the matched sentence, extended to the
 * next sentence (or the full text) when the match is under 3 words — so
 * "Yes." never ships as standalone evidence.
 * @param {string} text @param {string} term @returns {string} */
function quoteFor(text, term) {
  const sents = sentences(text);
  // token-based anchor (same tokenization as detection): "no" must not match
  // the substring inside "not"/"nothing" — the quote must contain the term
  const hasTerm = (s) => (String(s).toLowerCase().match(/[a-z-]+/g) ?? []).includes(term);
  const i = sents.findIndex(hasTerm);
  if (i === -1) return text;
  if (sents[i].split(/\s+/).filter(Boolean).length >= 3) return sents[i];
  return i + 1 < sents.length ? `${sents[i]} ${sents[i + 1]}` : text;
}

/* ---------- contradiction detection ---------- */

/**
 * Compare two answers for contradictions. Returns conflicts (possibly
 * multiple — every conflicting unit and every matching antonym pair fires).
 * Numbers: conflict when both answers state numbers in the same canonical
 * base unit and the value sets are disjoint; bare (unitless) numbers
 * additionally require a shared keyword in their evidence sentences.
 * Antonyms: conflict when one answer contains a term and the other its
 * opposing pair member; quotes are ≥3 words.
 *
 * @param {{ id: string, statusLabel?: string }} a — {text, ...}
 * @param {{ id: string, statusLabel?: string }} b
 * @param {string} aText @param {string} bText
 * @param {{ antonymPairs?: string[][], units?: string[] }} [settings]
 * @returns {Array<{ kind: "number_conflict"|"antonym_conflict", detail: string, evidence: Array<{ itemId: string, answerStatus: string, quote: string }> }>}
 */
export function compareAnswers(a, b, aText, bText, settings = {}) {
  const pairs = settings.antonymPairs ?? DEFAULT_ANTONYM_PAIRS;
  const units = settings.units ?? DEFAULT_UNITS;
  const conflicts = [];

  // --- number conflicts (canonical base unit/magnitude) ---
  const na = extractNumbers(aText, units);
  const nb = extractNumbers(bText, units);
  const unitsOf = (ns) => [...new Set(ns.map((n) => n.baseUnit))];
  for (const unit of unitsOf(na)) {
    if (!nb.some((n) => n.baseUnit === unit)) continue;
    const la = na.filter((n) => n.baseUnit === unit);
    const lb = nb.filter((n) => n.baseUnit === unit);
    const va = new Set(la.map((n) => n.baseValue));
    const vb = new Set(lb.map((n) => n.baseValue));
    const common = [...va].filter((v) => vb.has(v));
    if (common.length > 0) continue; // some agreed value in this unit
    const ea = la[0];
    const eb = lb[0];
    if (unit === "") {
      // bare counts: require a shared keyword anchor between evidence sentences
      const shared = [...keywords(ea.sentence)].filter((k) => keywords(eb.sentence).has(k));
      if (shared.length === 0) continue;
    }
    const fmt = [...va].sort((x, y) => x - y).join("/") + " vs " + [...vb].sort((x, y) => x - y).join("/");
    conflicts.push({
      kind: "number_conflict",
      detail: `disjoint ${unit === "" ? "bare-count" : `"${unit}"`} values: ${a.id} (${a.statusLabel ?? "answer"}) says ${[...va].sort((x, y) => x - y).join("/")}, ${b.id} (${b.statusLabel ?? "answer"}) says ${[...vb].sort((x, y) => x - y).join("/")} — ${fmt}`,
      evidence: [
        { itemId: a.id, answerStatus: a.statusLabel ?? "answer", quote: ea.sentence || aText },
        { itemId: b.id, answerStatus: b.statusLabel ?? "answer", quote: eb.sentence || bText },
      ],
    });
  }

  // --- antonym conflicts (all matching pairs, quotes ≥3 words) ---
  const wordsA = new Set((aText.toLowerCase().match(/[a-z-]+/g)) ?? []);
  const wordsB = new Set((bText.toLowerCase().match(/[a-z-]+/g)) ?? []);
  for (const [x, y] of pairs) {
    const aHasX = wordsA.has(x), aHasY = wordsA.has(y);
    const bHasX = wordsB.has(x), bHasY = wordsB.has(y);
    if ((aHasX && bHasY) || (aHasY && bHasX)) {
      const wa = aHasX ? x : y;
      const wb = bHasX ? x : y;
      conflicts.push({
        kind: "antonym_conflict",
        detail: `${a.id} says "${wa}" where ${b.id} says "${wb}"`,
        evidence: [
          { itemId: a.id, answerStatus: a.statusLabel ?? "answer", quote: quoteFor(aText, wa) },
          { itemId: b.id, answerStatus: b.statusLabel ?? "answer", quote: quoteFor(bText, wb) },
        ],
      });
    }
  }
  return conflicts;
}

/**
 * Detect contradictions across the log. Within each category (and, when
 * `settings.crossCategory` is on, across categories anchored on a shared
 * answer keyword), compare the canonical sent answer (and any pending draft)
 * of each item against those of every other item. Answers of the SAME item
 * are never compared (revision is workflow, not contradiction). Deterministic
 * order: category, then input order of items; cross-category conflicts come
 * last and carry `crossCategory: true`.
 *
 * @param {{ items?: any[], settings?: any }} input
 * @returns {Array<{ category: string, kind: string, between: [string, string], detail: string, evidence: Array<{ itemId: string, answerStatus: string, quote: string }>, crossCategory?: boolean }>}
 */
export function detectContradictions(input) {
  const items = input.items ?? [];
  const settings = input.settings ?? {};
  const out = [];

  // candidate answers: canonical sent + pending draft per item (input order, sent before draft)
  const candidates = [];
  items.forEach((it, itemIndex) => {
    const category = it.category ?? "uncategorized";
    const cur = currentAnswer(it);
    if (cur) candidates.push({ itemId: it.id, category, statusLabel: "sent", text: cur.text, itemIndex, slot: 0 });
    const dr = pendingDraft(it);
    if (dr) candidates.push({ itemId: it.id, category, statusLabel: "draft", text: dr.text, itemIndex, slot: 1 });
  });
  const byOrder = (a, b) => a.category.localeCompare(b.category) || a.itemIndex - b.itemIndex || a.slot - b.slot;
  const sorted = [...candidates].sort(byOrder);

  const compare = (A, B, extra) => {
    for (const c of compareAnswers({ id: A.itemId, statusLabel: A.statusLabel }, { id: B.itemId, statusLabel: B.statusLabel }, A.text, B.text, settings)) {
      out.push({ category: extra?.category ?? A.category, kind: c.kind, between: [A.itemId, B.itemId], detail: c.detail, evidence: c.evidence, ...(extra?.crossCategory ? { crossCategory: true } : {}) });
    }
  };

  // pass 1: within-category pairs (category-sorted, input order)
  const categories = [...new Set(sorted.map((c) => c.category))];
  for (const category of categories) {
    const inCat = sorted.filter((c) => c.category === category);
    for (let i = 0; i < inCat.length; i++) {
      for (let j = i + 1; j < inCat.length; j++) {
        if (inCat[i].itemId === inCat[j].itemId) continue; // same item = revision, not contradiction
        compare(inCat[i], inCat[j]);
      }
    }
  }

  // pass 2: cross-category pairs (opt-in, keyword-anchored on the two answers)
  if (settings.crossCategory) {
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const A = sorted[i], B = sorted[j];
        if (A.category === B.category || A.itemId === B.itemId) continue;
        const anchored = [...keywords(A.text)].some((k) => keywords(B.text).has(k));
        if (!anchored) continue;
        compare(A, B, { category: [A.category, B.category].sort().join(" × "), crossCategory: true });
      }
    }
  }
  return out;
}

/* ---------- SLA aging ---------- */

/**
 * Aging for one item: `daysOpen` = days from `receivedAt` to
 * `settings.asOf` (dates only — no wall clock), SLA band per
 * warn/breach days. Null when either date is missing or unparseable.
 *
 * @param {{ receivedAt?: string }} item
 * @param {{ asOf?: string, sla?: { warnDays?: number, breachDays?: number } }} [settings]
 * @returns {{ daysOpen: number | null, sla: "on-track"|"due-soon"|"overdue"|null }}
 */
export function itemAging(item, settings = {}) {
  const sla = { ...DEFAULT_SLA, ...(settings.sla ?? {}) };
  const asOf = settings.asOf ?? null;
  if (!item?.receivedAt || !asOf) return { daysOpen: null, sla: null };
  const ms = Date.parse(asOf) - Date.parse(item.receivedAt);
  if (Number.isNaN(ms)) return { daysOpen: null, sla: null };
  const daysOpen = Math.round(ms / 86400000);
  const band = daysOpen >= sla.breachDays ? "overdue" : daysOpen >= sla.warnDays ? "due-soon" : "on-track";
  return { daysOpen, sla: band };
}

/* ---------- readiness score ---------- */

/** Canonical sent answer from a live item (answers[]) or a log projection. */
function canonicalSent(item) {
  if (Array.isArray(item?.answers)) return currentAnswer(item);
  return item?.currentAnswer != null ? { citations: item.citations ?? null } : null;
}

/** Open-item test from a live item (answers[]) or a log projection. */
function isOpen(item) {
  return Array.isArray(item?.answers) ? itemStatus(item) === "open" : item?.status === "open";
}

/**
 * Disclosure-readiness score from the log itself. Components (weights are
 * rules-as-data): coverage = items with a canonical sent answer / total;
 * pipeline = 1 − open items / total; consistency = 1 − items appearing in
 * contradictions / total; provenance = sent answers carrying ≥1 citation /
 * total. Score = round(100 × Σ weight × component).
 *
 * @param {{ items?: any[] }} input @param {any[]} contradictions
 * @param {{ weights?: { coverage: number, pipeline: number, consistency: number, provenance: number }, bands?: { nearly: number, ready: number } }} [settings]
 * @returns {{ score: number, band: string, components: { coverage: number, pipeline: number, consistency: number, provenance: number }, weights: any, bands: any, contradictedItems: string[] }}
 */
export function readinessScore(input, contradictions, settings = {}) {
  const items = input.items ?? [];
  const weights = { ...DEFAULT_READINESS.weights, ...settings.weights };
  const bands = { ...DEFAULT_READINESS.bands, ...settings.bands };
  const total = items.length || 1;
  const sent = items.filter((it) => canonicalSent(it)).length;
  const open = items.filter((it) => isOpen(it)).length;
  const cited = items.filter((it) => (canonicalSent(it)?.citations?.length ?? 0) > 0).length;
  const contradicted = [...new Set(contradictions.flatMap((c) => c.between))].sort();
  const components = {
    coverage: sent / total,
    pipeline: 1 - open / total,
    consistency: 1 - contradicted.length / total,
    provenance: cited / total,
  };
  const score = Math.round(100 * (weights.coverage * components.coverage + weights.pipeline * components.pipeline + weights.consistency * components.consistency + weights.provenance * components.provenance));
  const band = score >= bands.ready ? "ready" : score >= bands.nearly ? "nearly ready" : "not ready";
  return { score, band, components, weights, bands, contradictedItems: contradicted };
}

/* ---------- log assembly + exports ---------- */

/**
 * Build the full Q&A log: derived workflow state, citations, aging, release
 * blockers, contradictions, readiness score, summary.
 *
 * @param {{ deal?: { name?: string }, buyers?: any[], items?: any[], settings?: any }} input
 * @returns {any}
 */
export function buildQaLog(input) {
  const settings = input.settings ?? {};
  const buyers = new Map((input.buyers ?? []).map((b) => [b.id, b.name]));
  const contradictions = detectContradictions(input);
  const readiness = readinessScore(input, contradictions, settings);
  const contradicted = new Set(readiness.contradictedItems);
  const items = (input.items ?? []).map((it) => {
    const cur = currentAnswer(it);
    const dr = pendingDraft(it);
    const age = itemAging(it, settings);
    return {
      id: it.id,
      buyerId: it.buyerId,
      buyer: buyers.get(it.buyerId) ?? it.buyerId,
      category: it.category ?? "uncategorized",
      question: it.question,
      status: itemStatus(it),
      currentAnswer: cur ? cur.text : null,
      currentAnswerAt: cur ? cur.at : null,
      citations: cur?.citations ?? null,
      pendingDraft: dr ? dr.text : null,
      draftApproved: dr ? Boolean(dr.approvedBy) : false,
      answersCount: (it.answers ?? []).length,
      daysOpen: age.daysOpen,
      sla: age.sla,
      contradicted: contradicted.has(it.id),
      blockers: releaseBlockers(it, contradictions),
    };
  });
  const sla = { ...DEFAULT_SLA, ...(settings.sla ?? {}) };
  return {
    deal: input.deal ?? { name: "Unnamed deal" },
    summary: {
      items: items.length,
      sent: items.filter((i) => i.status === "sent" || i.status === "draft-pending").length,
      draftOnly: items.filter((i) => i.status === "draft").length,
      open: items.filter((i) => i.status === "open").length,
      pendingDrafts: items.filter((i) => i.status === "draft-pending").length,
      contradictions: contradictions.length,
      overdue: items.filter((i) => i.sla === "overdue").length,
    },
    aging: settings.asOf ? { asOf: settings.asOf, sla } : null,
    items,
    contradictions,
    readiness,
  };
}

/**
 * Buyer-safe projection of a built log: only `buyerId`'s items appear, and
 * contradictions involving any other buyer's items are dropped entirely
 * (cross-buyer evidence never leaves the wall). Summary and readiness are
 * recomputed from the projected view; works with qaLogToCsv/qaLogToJson.
 *
 * @param {any} log — output of buildQaLog
 * @param {string} buyerId
 * @returns {any}
 */
export function buyerView(log, buyerId) {
  const items = log.items.filter((i) => i.buyerId === buyerId);
  const ids = new Set(items.map((i) => i.id));
  const contradictions = log.contradictions.filter((c) => c.between.every((id) => ids.has(id)));
  const scoped = items.map((i) => ({
    ...i,
    // recomputed from the scoped set: a full-log flag whose only evidence is a
    // cross-buyer conflict must not leak the conflict's existence past the wall
    contradicted: contradictions.some((c) => c.between.includes(i.id)),
    blockers: releaseBlockers(i, contradictions),
  }));
  const readiness = readinessScore({ items: scoped }, contradictions, { weights: log.readiness?.weights, bands: log.readiness?.bands });
  return {
    deal: log.deal,
    buyerId,
    summary: {
      items: scoped.length,
      sent: scoped.filter((i) => i.status === "sent" || i.status === "draft-pending").length,
      draftOnly: scoped.filter((i) => i.status === "draft").length,
      open: scoped.filter((i) => i.status === "open").length,
      pendingDrafts: scoped.filter((i) => i.status === "draft-pending").length,
      contradictions: contradictions.length,
      overdue: scoped.filter((i) => i.sla === "overdue").length,
    },
    aging: log.aging ?? null,
    items: scoped,
    contradictions,
    readiness,
  };
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV export of the log — one row per item with workflow state, aging,
 * citations, and contradiction flags.
 * @param {any} log — output of buildQaLog (or buyerView)
 * @returns {string}
 */
export function qaLogToCsv(log) {
  const header = ["id", "buyer", "category", "status", "question", "currentAnswer", "pendingDraft", "contradiction", "daysOpen", "sla", "citations", "answers"];
  const contraOf = new Map();
  for (const c of log.contradictions) {
    for (const id of c.between) {
      const list = contraOf.get(id) ?? [];
      list.push(c.kind);
      contraOf.set(id, list);
    }
  }
  const rows = log.items.map((it) => [
    it.id,
    it.buyer,
    it.category,
    it.status,
    it.question,
    it.currentAnswer ?? "",
    it.pendingDraft ?? "",
    it.contradicted ? [...new Set(contraOf.get(it.id) ?? [])].join("; ") : "",
    it.daysOpen ?? "",
    it.sla ?? "",
    it.citations?.length ?? 0,
    it.answersCount,
  ]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

/**
 * JSON export of the log (stable key order; safe to commit to version control).
 * @param {any} log @returns {string} */
export function qaLogToJson(log) {
  return JSON.stringify(log, null, 2) + "\n";
}

/** Markdown report — deterministic rendering of a log.
 * @param {any} log @returns {string} */
export function renderReport(log) {
  const s = log.summary;
  const lines = [];
  lines.push(`# Sell-side Q&A log — ${log.deal.name ?? "unnamed deal"}`);
  lines.push("");
  lines.push(`**${s.items} questions:** ${s.sent} sent · ${s.draftOnly} draft-only · ${s.open} open · ${s.pendingDrafts} draft-pending · **${s.contradictions} contradiction(s)**`);
  lines.push("");
  const r = log.readiness;
  lines.push(`Disclosure readiness: **${r.score}/100 (${r.band})** — coverage ${Math.round(r.components.coverage * 100)}% × ${r.weights.coverage}, pipeline ${Math.round(r.components.pipeline * 100)}% × ${r.weights.pipeline}, consistency ${Math.round(r.components.consistency * 100)}% × ${r.weights.consistency}, provenance ${Math.round(r.components.provenance * 100)}% × ${r.weights.provenance}.`);
  if (log.aging) {
    lines.push("");
    lines.push(`Aging as of ${log.aging.asOf} (SLA: warn ${log.aging.sla.warnDays}d, breach ${log.aging.sla.breachDays}d): **${s.overdue} of ${s.items} overdue**.`);
  }
  lines.push("");
  lines.push("| Id | Buyer | Category | Status | Aging | Contradicted |");
  lines.push("|---|---|---|---|---|---|");
  for (const it of log.items) {
    const aging = it.daysOpen == null ? "—" : `${it.daysOpen}d${it.sla === "overdue" ? " (overdue)" : it.sla === "due-soon" ? " (due soon)" : ""}`;
    lines.push(`| ${it.id} | ${it.buyer} | ${it.category} | ${it.status} | ${aging} | ${it.contradicted ? "**yes**" : "—"} |`);
  }
  lines.push("");
  if (log.contradictions.length) {
    lines.push("## Contradictions (deterministic heuristics — attorney review required)");
    lines.push("");
    for (const c of log.contradictions) {
      lines.push(`- **${c.kind}** (${c.category}) · ${c.between.join(" vs ")} — ${c.detail}.`);
      for (const e of c.evidence) lines.push(`  - \`${e.itemId}\` (${e.answerStatus}): "${e.quote}"`);
    }
    lines.push("");
  }
  lines.push("## Current answers");
  lines.push("");
  for (const it of log.items) {
    lines.push(`### ${it.id} — ${it.buyer} · ${it.category} · ${it.status}`);
    lines.push("");
    lines.push(`> ${it.question}`);
    lines.push("");
    lines.push(it.currentAnswer ? it.currentAnswer : "_no sent answer yet_");
    if (it.citations?.length) {
      for (const c of it.citations) lines.push(`\n- source: \`${c.docId}\` ${c.locator} — "${c.quote}"`);
    }
    if (it.pendingDraft) lines.push(`\n_Pending draft (not sent):_ "${it.pendingDraft}"`);
    if (it.blockers?.length) lines.push(`\n_Release blockers:_ ${it.blockers.map((b) => `\`${b.code}\``).join(", ")}`);
    lines.push("");
  }
  lines.push("_All data fictional. Contradiction flags are keyword/number heuristics for human review, not legal conclusions. Not legal advice._");
  lines.push("");
  return lines.join("\n");
}
