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
 * @type {{ maxAgeDays: number }} */
export const DEFAULT_POLICY = { maxAgeDays: 180 };

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
  const verified = parseDate(cell?.verifiedDate);

  if (!hasAnswer && !hasCitation) return { status: "unverified", reason: "no answer provided", ageDays: null, cell };
  if (!hasAnswer) return { status: "unverified", reason: "citation present but no answer", ageDays: null, cell };
  if (!hasCitation)
    return { status: "unverified", reason: "answer present but no source citation — unverifiable claims are never surfaced", ageDays: null, cell };
  if (!verified)
    return { status: "unverified", reason: "answer and citation present but verification date missing or malformed", ageDays: null, cell };

  const asOf = parseDate(asOfIso ?? null);
  if (asOf) {
    const ageDays = Math.round((asOf.getTime() - verified.getTime()) / 86400000);
    if (ageDays < 0)
      return { status: "unverified", reason: `verification date is in the future (${cell.verifiedDate})`, ageDays, cell };
    if (ageDays > p.maxAgeDays)
      return { status: "stale", reason: `verified ${ageDays}d ago (> ${p.maxAgeDays}d policy window) — re-verification required before relying`, ageDays, cell };
    return { status: "verified", reason: `verified ${ageDays}d ago by ${cell.verifiedBy ?? "unknown"}`, ageDays, cell };
  }
  return { status: "verified", reason: `verified ${cell.verifiedDate} (no asOf supplied; staleness not evaluated)`, ageDays: null, cell };
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
  const cellIndex = new Map((survey.cells ?? []).map((c) => [`${String(c.jurisdiction).toLowerCase()}|${String(c.question).toLowerCase()}`, c]));

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
        out.verifiedDate = raw.verifiedDate;
        out.verifiedBy = raw.verifiedBy ?? null;
      }
      return out;
    })
  );

  const flat = grid.flat();
  const verified = flat.filter((c) => c.status === "verified").length;
  const stale = flat.filter((c) => c.status === "stale").length;
  const unverified = flat.length - verified - stale;
  return {
    topic: survey.topic,
    asOf: asOfIso ?? null,
    policy,
    jurisdictions,
    questions,
    grid,
    coverage: { total: flat.length, verified, stale, unverified, pctVerified: flat.length ? Math.round((verified / flat.length) * 100) : 0 },
  };
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
  const header = ["jurisdiction", "questionId", "question", "status", "answer", "citation", "verifiedDate", "verifiedBy", "note"];
  const rows = [];
  matrix.jurisdictions.forEach((j, r) => {
    matrix.questions.forEach((q, c) => {
      const cell = matrix.grid[r][c];
      rows.push([
        j, q.id, q.text, cell.status,
        cell.status === "unverified" ? "UNVERIFIED — not researched / insufficient sourcing" : cell.answer,
        cell.citation ?? "", cell.verifiedDate ?? "", cell.verifiedBy ?? "", cell.reason,
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
      const cells = c.status === "unverified"
        ? ["**UNVERIFIED**", "—", "—", "⚠ " + c.reason]
        : [c.answer, c.citation, `${c.verifiedDate} (${c.verifiedBy ?? "?"})`, c.status === "stale" ? "⚠ STALE: " + c.reason : "✓"];
      lines.push(`| ${j} | ${cells.map((x) => String(x).replace(/\|/g, "\\|")).join(" | ")} |`);
    });
    lines.push("");
  }
  lines.push("_Survey data must be re-verified against current law before reliance. Not legal advice._", "");
  return lines.join("\n");
}
