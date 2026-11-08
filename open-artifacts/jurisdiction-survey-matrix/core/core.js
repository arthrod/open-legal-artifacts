/**
 * jurisdiction-survey-matrix — deterministic core.
 *
 * Jurisdictions × legal-questions survey matrix. Every populated cell must
 * carry an answer, a source citation, and a verification date. Cells that
 * are missing, incomplete, or stale render as flagged — NEVER guessed.
 * Exports CSV and Markdown.
 *
 * Dependency-free plain-JavaScript ES module; browser + Node compatible.
 * No hidden clocks: staleness anchors to caller-supplied `asOf`.
 * @module core
 */

/* ---------- helpers ---------- */

/** Parse "YYYY-MM-DD" to UTC Date; null when unparseable.
 * @param {string|null|undefined} d
 * @returns {Date|null} */
export function parseDate(d) {
  if (!d || typeof d !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null; // reject rollover (e.g. 2026-13-01)
  return dt;
}

/** Default verification policy (rules-as-data; override per survey).
 * @type {{ maxAgeDays: number, requireSourceUrl: boolean }} */
export const DEFAULT_POLICY = { maxAgeDays: 180, requireSourceUrl: true };

/** All distinct digit runs in a string ("30 days, $200" → ["30","200"]).
 * @param {string|null|undefined} s
 * @returns {string[]} */
function digitTokens(s) {
  return [...new Set(String(s ?? "").match(/\d+/g) ?? [])];
}

/** Figure-consistency check (warning-only): digits asserted in the answer
 * must appear verbatim in the quoted source text, else the cell is flagged.
 * Over-flagging is tolerated by design — the flag prompts re-checking, it
 * never hides the answer.
 * @param {string} answer
 * @param {string|null|undefined} quotedText
 * @returns {string[]} warnings */
function figureWarnings(answer, quotedText) {
  if (typeof quotedText !== "string" || !quotedText.trim()) return [];
  const quoteSet = new Set(digitTokens(quotedText));
  const missing = digitTokens(answer).filter((t) => !quoteSet.has(t));
  return missing.length ? [`figures not in quoted source: ${missing.join(", ")}`] : [];
}

/* ---------- cell validation ---------- */

/**
 * Classify one input cell. A cell is usable only when it has a non-empty
 * answer AND citation AND a parseable verifiedDate; anything less is
 * "unverified" — the matrix never invents content for it.
 * @param {any} cell — { jurisdiction, question, answer?, citation?, verifiedDate?, verifiedBy? }
 * @param {{ maxAgeDays?: number }} [policy]
 * @param {string} [asOfIso]
 * @returns {{ status: "verified"|"stale"|"unverified", reason: string, ageDays: number|null, cell: any }}
 */
export function classifyCell(cell, policy = {}, asOfIso) {
  const p = { ...DEFAULT_POLICY, ...policy };
  const hasAnswer = typeof cell?.answer === "string" && cell.answer.trim().length > 0;
  const hasCitation = typeof cell?.citation === "string" && cell.citation.trim().length > 0;
  const hasSourceUrl = typeof cell?.sourceUrl === "string" && cell.sourceUrl.trim().length > 0;
  const verified = parseDate(cell?.verifiedDate);

  if (!hasAnswer && !hasCitation) return { status: "unverified", reason: "no answer provided", ageDays: null, warnings: [], cell };
  if (!hasAnswer) return { status: "unverified", reason: "citation present but no answer", ageDays: null, warnings: [], cell };
  if (!hasCitation)
    return { status: "unverified", reason: "answer present but no source citation — unverifiable claims are never surfaced", ageDays: null, warnings: [], cell };
  if (!hasSourceUrl && p.requireSourceUrl !== false)
    return { status: "unverified", reason: "citation present but no sourceUrl — a link to the underlying law is required before the cell renders (policy.requireSourceUrl)", ageDays: null, warnings: [], cell };
  if (!verified)
    return { status: "unverified", reason: "answer and citation present but verification date missing or malformed", ageDays: null, warnings: [], cell };

  const warnings = figureWarnings(cell.answer, cell.quotedText);

  const asOf = parseDate(asOfIso ?? null);
  if (asOf) {
    const ageDays = Math.round((asOf.getTime() - verified.getTime()) / 86400000);
    if (ageDays < 0)
      return { status: "unverified", reason: `verification date is in the future (${cell.verifiedDate})`, ageDays, warnings: [], cell };
    if (ageDays > p.maxAgeDays)
      return { status: "stale", reason: `verified ${ageDays}d ago (> ${p.maxAgeDays}d policy window) — re-verification required before relying`, ageDays, warnings, cell };
    return { status: "verified", reason: `verified ${ageDays}d ago by ${cell.verifiedBy ?? "unknown"}`, ageDays, warnings, cell };
  }
  return { status: "verified", reason: `verified ${cell.verifiedDate} (no asOf supplied; staleness not evaluated)`, ageDays: null, warnings, cell };
}

/* ---------- matrix ---------- */

/**
 * Build the full jurisdictions × questions matrix.
 *
 * @param {{ topic: string, jurisdictions: string[], questions: Array<string|{id: string, text: string}>, cells: any[], policy?: object }} survey
 * @param {string} [asOfIso]
 * @returns {{
 *   topic: string, asOf: string|null, policy: object,
 *   jurisdictions: string[], questions: Array<{id: string, text: string}>,
 *   grid: Array<Array<{ status: string, reason: string, ageDays: number|null, answer?: string, citation?: string, verifiedDate?: string, verifiedBy?: string }>>,
 *   coverage: { total: number, verified: number, stale: number, unverified: number, pctVerified: number }
 * }}
 */
export function buildMatrix(survey, asOfIso) {
  const policy = { ...DEFAULT_POLICY, ...(survey.policy ?? {}) };
  const jurisdictions = survey.jurisdictions ?? [];
  const questions = (survey.questions ?? []).map((q, i) =>
    typeof q === "string" ? { id: `q${i + 1}`, text: q } : { id: q.id ?? `q${i + 1}`, text: q.text ?? "" }
  );

  // Input integrity: duplicates and orphans are kept visible instead of
  // being dropped silently. Duplicate keys stay last-wins; orphans are
  // excluded from the grid but reported.
  const warnings = [];
  if (!jurisdictions.length) warnings.push("input warning: jurisdictions list is empty — the matrix will be empty");
  if (!questions.length) warnings.push("input warning: questions list is empty — the matrix will be empty");
  const knownJurisdictions = new Set(jurisdictions.map((j) => String(j).toLowerCase()));
  const knownQuestions = new Set(questions.map((q) => String(q.id).toLowerCase()));
  const cellIndex = new Map();
  for (const c of survey.cells ?? []) {
    const jKey = String(c.jurisdiction ?? "").toLowerCase();
    const qKey = String(c.question ?? "").toLowerCase();
    const key = `${jKey}|${qKey}`;
    if (!knownJurisdictions.has(jKey))
      warnings.push(`orphan cell ignored: jurisdiction "${c.jurisdiction ?? ""}" is not in the jurisdictions list`);
    else if (!knownQuestions.has(qKey))
      warnings.push(`orphan cell ignored: question id "${c.question ?? ""}" is not in the questions list (${key})`);
    if (cellIndex.has(key))
      warnings.push(`duplicate cell for ${key} — the later entry wins; an earlier entry was dropped`);
    cellIndex.set(key, c);
  }

  const grid = jurisdictions.map((j) =>
    questions.map((q) => {
      const raw = cellIndex.get(`${String(j).toLowerCase()}|${String(q.id).toLowerCase()}`);
      if (!raw) {
        return { status: "unverified", reason: "no research recorded for this jurisdiction × question", ageDays: null };
      }
      const cls = classifyCell(raw, policy, asOfIso);
      const out = { status: cls.status, reason: cls.reason, ageDays: cls.ageDays };
      if (cls.status !== "unverified") {
        out.answer = raw.answer;
        out.citation = raw.citation;
        out.sourceUrl = typeof raw.sourceUrl === "string" && raw.sourceUrl.trim() ? raw.sourceUrl : null;
        out.quotedText = typeof raw.quotedText === "string" && raw.quotedText.trim() ? raw.quotedText : null;
        out.verifiedDate = raw.verifiedDate;
        out.verifiedBy = raw.verifiedBy ?? null;
        if (cls.warnings.length) out.warnings = cls.warnings;
      }
      return out;
    })
  );

  const flat = grid.flat();
  const verified = flat.filter((c) => c.status === "verified").length;
  const stale = flat.filter((c) => c.status === "stale").length;
  const unverified = flat.length - verified - stale;
  const byJurisdiction = {};
  jurisdictions.forEach((j, r) => {
    const row = grid[r];
    byJurisdiction[j] = {
      total: row.length,
      verified: row.filter((c) => c.status === "verified").length,
      stale: row.filter((c) => c.status === "stale").length,
      unverified: row.filter((c) => c.status === "unverified").length,
    };
  });
  const byQuestion = {};
  questions.forEach((q, c) => {
    const col = grid.map((row) => row[c]);
    byQuestion[q.id] = {
      total: col.length,
      verified: col.filter((x) => x.status === "verified").length,
      stale: col.filter((x) => x.status === "stale").length,
      unverified: col.filter((x) => x.status === "unverified").length,
    };
  });
  return {
    topic: survey.topic,
    asOf: asOfIso ?? null,
    policy,
    jurisdictions,
    questions,
    grid,
    warnings,
    coverage: {
      total: flat.length, verified, stale, unverified,
      pctVerified: flat.length ? Math.round((verified / flat.length) * 100) : 0,
      byJurisdiction, byQuestion,
    },
  };
}

/* ---------- re-verification worklist ---------- */

/**
 * Prioritized re-verification queue: every stale cell (has content that has
 * aged past policy — highest priority) and every unverified cell (gap).
 * Verified cells never appear. Order: stale first, then unverified.
 * @param {any} matrix — output of buildMatrix
 * @returns {Array<{ priority: number, jurisdiction: string, questionId: string, question: string, status: string, reason: string, lastVerifiedDate: string|null, lastCitation: string|null, lastAnswer: string|null }>}
 */
export function toWorklist(matrix) {
  const rows = [];
  matrix.jurisdictions.forEach((j, r) => {
    matrix.questions.forEach((q, c) => {
      const cell = matrix.grid[r][c];
      if (cell.status === "verified") return;
      rows.push({
        priority: cell.status === "stale" ? 1 : 2,
        jurisdiction: j,
        questionId: q.id,
        question: q.text,
        status: cell.status,
        reason: cell.reason,
        lastVerifiedDate: cell.verifiedDate ?? null,
        lastCitation: cell.citation ?? null,
        lastAnswer: cell.answer ?? null,
      });
    });
  });
  rows.sort((a, b) => a.priority - b.priority);
  return rows;
}

/** Markdown export of the re-verification worklist (stale first).
 * @param {any} matrix
 * @returns {string} */
export function worklistToMarkdown(matrix) {
  const rows = toWorklist(matrix);
  const stale = rows.filter((r) => r.status === "stale").length;
  const lines = [
    `# Re-verification worklist: ${matrix.topic}`,
    "",
    matrix.asOf ? `_As of ${matrix.asOf} · ${rows.length} items: ${stale} stale, ${rows.length - stale} unverified · stale first_` : `_No asOf supplied · ${rows.length} items_`,
    "",
    "| # | Priority | Jurisdiction | Question | Last verified | Why it needs work |",
    "|---|---|---|---|---|---|",
  ];
  rows.forEach((r, i) => {
    const md = (s) => String(s ?? "—").replace(/\|/g, "\\|");
    lines.push(`| ${i + 1} | ${r.status.toUpperCase()} | ${r.jurisdiction} | ${md(`${r.questionId} — ${r.question}`)} | ${md(r.lastVerifiedDate)} | ${md(r.reason)} |`);
  });
  lines.push("", "_Stale cells keep their last answer but must be re-verified before reliance; unverified cells were never guessed. Not legal advice._", "");
  return lines.join("\n");
}

/* ---------- exports ---------- */

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV export: one row per jurisdiction × question, status explicit.
 * @param {any} matrix — output of buildMatrix
 * @returns {string}
 */
export function toCsv(matrix) {
  const header = ["jurisdiction", "questionId", "question", "status", "answer", "citation", "sourceUrl", "quotedText", "verifiedDate", "verifiedBy", "note"];
  const rows = [];
  matrix.jurisdictions.forEach((j, r) => {
    matrix.questions.forEach((q, c) => {
      const cell = matrix.grid[r][c];
      rows.push([
        j, q.id, q.text, cell.status,
        cell.status === "unverified" ? "UNVERIFIED — not researched / insufficient sourcing" : cell.answer,
        cell.citation ?? "", cell.sourceUrl ?? "", cell.quotedText ?? "", cell.verifiedDate ?? "", cell.verifiedBy ?? "",
        [cell.reason, ...(cell.warnings ?? [])].join("; "),
      ]);
    });
  });
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

/**
 * Markdown export: header with coverage stats, then a table per question
 * (or one wide table when preferred). Unverified cells render explicitly.
 * @param {any} matrix
 * @returns {string}
 */
export function toMarkdown(matrix) {
  const lines = [
    `# Jurisdiction survey: ${matrix.topic}`,
    "",
    matrix.asOf ? `_As of ${matrix.asOf} · policy: re-verify within ${matrix.policy.maxAgeDays}d_` : `_No asOf supplied — staleness not evaluated · policy: re-verify within ${matrix.policy.maxAgeDays}d_`,
    "",
    `Coverage: **${matrix.coverage.verified}/${matrix.coverage.total} verified** (${matrix.coverage.pctVerified}%) · ${matrix.coverage.stale} stale · ${matrix.coverage.unverified} unverified`,
    "",
    "> Cells marked UNVERIFIED were never guessed — they await sourced research.",
    "",
  ];
  for (const q of matrix.questions) {
    lines.push(`## ${q.id}. ${q.text}`, "", "| Jurisdiction | Answer | Source | Verified | Status |", "|---|---|---|---|---|");
    matrix.jurisdictions.forEach((j, r) => {
      const c = matrix.grid[r][matrix.questions.indexOf(q)];
      const source = c.sourceUrl ? `[${c.citation}](${c.sourceUrl})` : c.citation;
      const cells = c.status === "unverified"
        ? ["**UNVERIFIED**", "—", "—", "⚠ " + c.reason]
        : [c.answer, source, `${c.verifiedDate} (${c.verifiedBy ?? "?"})`,
            c.status === "stale" ? `⚠ STALE: ${[c.reason, ...(c.warnings ?? [])].join("; ")}` : c.warnings?.length ? `⚠ ${c.warnings.join("; ")}` : "✓"];
      lines.push(`| ${j} | ${cells.map((x) => String(x).replace(/\|/g, "\\|")).join(" | ")} |`);
    });
    lines.push("");
  }
  lines.push("_Survey data must be re-verified against current law before reliance. Not legal advice._", "");
  return lines.join("\n");
}
