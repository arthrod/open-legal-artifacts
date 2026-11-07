/**
 * sell-side-qa-log — deterministic core.
 *
 * M&A sell-side diligence Q&A log: question/buyer/answer/status workflow,
 * deterministic contradiction detection between answers (number conflicts by
 * unit + antonym-term conflicts, each with verbatim evidence quotes), a
 * disclosure-readiness score computed from the log, and CSV/JSON exports.
 *
 * Dependency-free plain-JavaScript ES module; browser + Node compatible.
 * No timestamps, no randomness, no network: same input → byte-identical
 * output. Antonym pairs, unit vocabulary, and score weights are
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

/** Readiness weights + bands (rules-as-data; override via input.settings).
 * @type {{ weights: { coverage: number, pipeline: number, consistency: number }, bands: { ready: number, nearly: number } }} */
export const DEFAULT_READINESS = {
  weights: { coverage: 0.5, pipeline: 0.2, consistency: 0.3 },
  bands: { nearly: 60, ready: 85 },
};

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
 * @param {{ answers?: Array<{ text: string, status: string, at: string }> }} item
 * @returns {{ text: string, at: string, index: number } | null}
 */
export function currentAnswer(item) {
  const answers = item.answers ?? [];
  let best = null;
  answers.forEach((a, index) => {
    if (a.status !== "sent") return;
    if (!best || String(a.at).localeCompare(String(best.at)) >= 0) best = { text: a.text, at: a.at, index };
  });
  return best;
}

/**
 * Pending draft: the latest `draft` answer dated on/after the canonical
 * answer (or any draft when nothing is sent yet). Null when none.
 *
 * @param {any} item
 * @returns {{ text: string, at: string, index: number } | null}
 */
export function pendingDraft(item) {
  const answers = item.answers ?? [];
  const cur = currentAnswer(item);
  let best = null;
  answers.forEach((a, index) => {
    if (a.status !== "draft") return;
    if (cur && String(a.at).localeCompare(String(cur.at)) < 0) return; // stale draft, already superseded
    if (!best || String(a.at).localeCompare(String(best.at)) >= 0) best = { text: a.text, at: a.at, index };
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
 * only — never guessed from words).
 *
 * @param {string} text
 * @param {string[]} [units] — normalized unit vocabulary (default DEFAULT_UNITS)
 * @returns {Array<{ value: number, unit: string, raw: string, sentence: string }>}
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
    const raw = m[0].trim();
    const sentence = sents.find((s) => s.includes(raw)) ?? "";
    out.push({ value, unit, raw, sentence });
  }
  return out;
}

/* ---------- contradiction detection ---------- */

/**
 * Compare two answers for contradictions. Returns conflicts (possibly
 * multiple). Numbers: conflict when both answers state numbers in the same
 * unit and the value sets are disjoint; bare (unitless) numbers additionally
 * require a shared keyword in their evidence sentences. Antonyms: conflict
 * when one answer contains a term and the other its opposing pair member.
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

  // --- number conflicts ---
  const na = extractNumbers(aText, units);
  const nb = extractNumbers(bText, units);
  const unitsOf = (ns) => [...new Set(ns.map((n) => n.unit))];
  for (const unit of unitsOf(na)) {
    if (!nb.some((n) => n.unit === unit)) continue;
    const va = new Set(na.filter((n) => n.unit === unit).map((n) => n.value));
    const vb = new Set(nb.filter((n) => n.unit === unit).map((n) => n.value));
    const common = [...va].filter((v) => vb.has(v));
    if (common.length > 0) continue; // some agreed value in this unit
    const ea = na.find((n) => n.unit === unit);
    const eb = nb.find((n) => n.unit === unit);
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
    break; // one number conflict per answer pair (first conflicting unit)
  }

  // --- antonym conflicts ---
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
          { itemId: a.id, answerStatus: a.statusLabel ?? "answer", quote: sentences(aText).find((s) => s.toLowerCase().includes(wa)) ?? aText },
          { itemId: b.id, answerStatus: b.statusLabel ?? "answer", quote: sentences(bText).find((s) => s.toLowerCase().includes(wb)) ?? bText },
        ],
      });
      break; // one antonym conflict per answer pair (first matching pair)
    }
  }
  return conflicts;
}

/**
 * Detect contradictions across the log: within each category, compare the
 * canonical sent answer (and any pending draft) of each item against those of
 * every other item. Answers of the SAME item are never compared (revision is
 * workflow, not contradiction). Deterministic order: category, then input
 * order of items.
 *
 * @param {{ items?: any[], settings?: any }} input
 * @returns {Array<{ category: string, kind: string, between: [string, string], detail: string, evidence: Array<{ itemId: string, answerStatus: string, quote: string }> }>}
 */
export function detectContradictions(input) {
  const items = input.items ?? [];
  const settings = input.settings ?? {};
  const out = [];
  const categories = [...new Set(items.map((it) => it.category ?? "uncategorized"))];
  for (const category of categories.sort((a, b) => a.localeCompare(b))) {
    const inCat = items.filter((it) => (it.category ?? "uncategorized") === category);
    // candidate answers: canonical sent + pending draft per item
    const candidates = [];
    for (const it of inCat) {
      const cur = currentAnswer(it);
      if (cur) candidates.push({ itemId: it.id, statusLabel: "sent", text: cur.text, order: cur.index });
      const dr = pendingDraft(it);
      if (dr) candidates.push({ itemId: it.id, statusLabel: "draft", text: dr.text, order: 1000 + dr.index });
    }
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const A = candidates[i];
        const B = candidates[j];
        if (A.itemId === B.itemId) continue; // same item = revision, not contradiction
        for (const c of compareAnswers({ id: A.itemId, statusLabel: A.statusLabel }, { id: B.itemId, statusLabel: B.statusLabel }, A.text, B.text, settings)) {
          out.push({ category, kind: c.kind, between: [A.itemId, B.itemId], detail: c.detail, evidence: c.evidence });
        }
      }
    }
  }
  return out;
}

/* ---------- readiness score ---------- */

/**
 * Disclosure-readiness score from the log itself. Components (weights are
 * rules-as-data): coverage = items with a canonical sent answer / total;
 * pipeline = 1 − open items / total; consistency = 1 − items appearing in
 * contradictions / total. Score = round(100 × Σ weight × component).
 *
 * @param {{ items?: any[] }} input @param {any[]} contradictions
 * @param {{ weights?: { coverage: number, pipeline: number, consistency: number }, bands?: { nearly: number, ready: number } }} [settings]
 * @returns {{ score: number, band: string, components: { coverage: number, pipeline: number, consistency: number }, weights: any, bands: any, contradictedItems: string[] }}
 */
export function readinessScore(input, contradictions, settings = {}) {
  const items = input.items ?? [];
  const weights = { ...DEFAULT_READINESS.weights, ...settings.weights };
  const bands = { ...DEFAULT_READINESS.bands, ...settings.bands };
  const total = items.length || 1;
  const sent = items.filter((it) => currentAnswer(it)).length;
  const open = items.filter((it) => itemStatus(it) === "open").length;
  const contradicted = [...new Set(contradictions.flatMap((c) => c.between))].sort();
  const components = {
    coverage: sent / total,
    pipeline: 1 - open / total,
    consistency: 1 - contradicted.length / total,
  };
  const score = Math.round(100 * (weights.coverage * components.coverage + weights.pipeline * components.pipeline + weights.consistency * components.consistency));
  const band = score >= bands.ready ? "ready" : score >= bands.nearly ? "nearly ready" : "not ready";
  return { score, band, components, weights, bands, contradictedItems: contradicted };
}

/* ---------- log assembly + exports ---------- */

/**
 * Build the full Q&A log: derived workflow state per item, contradictions,
 * readiness score, summary.
 *
 * @param {{ deal?: { name?: string }, buyers?: any[], items?: any[], settings?: any }} input
 * @returns {any}
 */
export function buildQaLog(input) {
  const buyers = new Map((input.buyers ?? []).map((b) => [b.id, b.name]));
  const contradictions = detectContradictions(input);
  const readiness = readinessScore(input, contradictions, input.settings ?? {});
  const contradicted = new Set(readiness.contradictedItems);
  const items = (input.items ?? []).map((it) => {
    const cur = currentAnswer(it);
    const dr = pendingDraft(it);
    return {
      id: it.id,
      buyerId: it.buyerId,
      buyer: buyers.get(it.buyerId) ?? it.buyerId,
      category: it.category ?? "uncategorized",
      question: it.question,
      status: itemStatus(it),
      currentAnswer: cur ? cur.text : null,
      currentAnswerAt: cur ? cur.at : null,
      pendingDraft: dr ? dr.text : null,
      answersCount: (it.answers ?? []).length,
      contradicted: contradicted.has(it.id),
    };
  });
  return {
    deal: input.deal ?? { name: "Unnamed deal" },
    summary: {
      items: items.length,
      sent: items.filter((i) => i.status === "sent" || i.status === "draft-pending").length,
      draftOnly: items.filter((i) => i.status === "draft").length,
      open: items.filter((i) => i.status === "open").length,
      pendingDrafts: items.filter((i) => i.status === "draft-pending").length,
      contradictions: contradictions.length,
    },
    items,
    contradictions,
    readiness,
  };
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV export of the log — one row per item with workflow state and
 * contradiction flags.
 * @param {any} log — output of buildQaLog
 * @returns {string}
 */
export function qaLogToCsv(log) {
  const header = ["id", "buyer", "category", "status", "question", "currentAnswer", "pendingDraft", "contradiction", "answers"];
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
  lines.push(`Disclosure readiness: **${log.readiness.score}/100 (${log.readiness.band})** — coverage ${Math.round(log.readiness.components.coverage * 100)}%, pipeline ${Math.round(log.readiness.components.pipeline * 100)}%, consistency ${Math.round(log.readiness.components.consistency * 100)}%.`);
  lines.push("");
  lines.push("| Id | Buyer | Category | Status | Contradicted |");
  lines.push("|---|---|---|---|---|");
  for (const it of log.items) {
    lines.push(`| ${it.id} | ${it.buyer} | ${it.category} | ${it.status} | ${it.contradicted ? "**yes**" : "—"} |`);
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
    if (it.pendingDraft) lines.push(`\n_Pending draft (not sent):_ "${it.pendingDraft}"`);
    lines.push("");
  }
  lines.push("_All data fictional. Contradiction flags are keyword/number heuristics for human review, not legal conclusions. Not legal advice._");
  lines.push("");
  return lines.join("\n");
}
