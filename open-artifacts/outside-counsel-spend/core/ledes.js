/**
 * outside-counsel-spend — deterministic LEDES 1998B parser.
 *
 * Parses pipe-delimited LEDES 1998B invoice text into the ledger-entry shape
 * consumed by core.js — no LLM, no guessing. The first non-empty line is the
 * header (verbatim LEDES field names, `[]` suffixes included); every
 * subsequent non-empty line is one line item. Any malformed line becomes a
 * structured error row and is skipped: numbers are never inferred.
 *
 * Supported dialect: LEDES 1998B line-item subset (documented). Line types:
 * F (fee, hourly — units × unit cost must equal the total), E (expense),
 * IF/IE (invoice adjustments → flat fee/disbursement entries carrying
 * LINE_ITEM_TOTAL[] verbatim, negative discounts included). Escaped LEDES
 * atoms (/PIPE/, /amp/) are NOT unescaped — a raw `|` in a field fails
 * loudly as `column_count`. Fields used:
 * LINE_ITEM_DATE[], EXP/FEE/INV_ADJ_TYPE[], LINE_ITEM_NUMBER_OF_UNITS[],
 * LINE_ITEM_UNIT_COST[], LINE_ITEM_TOTAL[], LINE_ITEM_DESCRIPTION[],
 * TIMEKEEPER_NAME[], TIMEKEEPER_LEVEL[], LAW_FIRM_MATTER_ID[] (→ matterId),
 * LAW_FIRM_ID[] (→ firmId when present in the header).
 *
 * @module core/ledes
 */

const LINE_TYPES = new Set(["F", "E", "IF", "IE"]); // 1998B fees, expenses, and invoice adjustments

const REQUIRED_COLUMNS = [
  "LAW_FIRM_MATTER_ID[]",
  "LINE_ITEM_DATE[]",
  "EXP/FEE/INV_ADJ_TYPE[]",
  "LINE_ITEM_NUMBER_OF_UNITS[]",
  "LINE_ITEM_UNIT_COST[]",
  "LINE_ITEM_TOTAL[]",
  "LINE_ITEM_DESCRIPTION[]",
];

/** Parse a YYYYMMDD LEDES date to "YYYY-MM-DD" (null when invalid — never guessed).
 * @param {string} raw @returns {string|null} */
function ledesDate(raw) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(raw ?? "").trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = +mo;
  const day = +d;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(+y, month - 1, day));
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${y}-${mo}-${d}`;
}

/** Parse a numeric field to a number (null when blank, NaN-free — never guessed).
 * @param {string} raw @returns {number|null} */
function ledesNumber(raw) {
  const s = String(raw ?? "").trim().replace(/[$,]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN; // caller distinguishes null (blank) from NaN (malformed)
}

/**
 * Parse LEDES 1998B text into ledger entries plus structured errors.
 *
 * @param {string} text — raw LEDES file contents
 * @param {{ firmId?: string }} [opts] — firmId fallback when the header has no
 *        LAW_FIRM_ID[] column (LEDES 1998B firm identity often lives in the
 *        filename/vendor envelope, not the line rows)
 * @returns {{ ledger: any[], errors: Array<{ line: number, error: string, detail: string }> }}
 */
export function parseLedes(text, opts = {}) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l, i) => ({ n: i + 1, l }))
    .filter((x) => x.l.trim() !== "");

  const ledger = [];
  const errors = [];
  if (lines.length === 0) return { ledger, errors };

  const header = lines[0].l.split("|").map((h) => h.trim());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    errors.push({
      line: lines[0].n,
      error: "missing_columns",
      detail: `header is missing required column(s): ${missing.join(", ")}`,
    });
    return { ledger, errors };
  }
  const col = (row, name) => row[header.indexOf(name)];

  for (const { n, l } of lines.slice(1)) {
    const row = l.split("|");
    if (row.length !== header.length) {
      errors.push({ line: n, error: "column_count", detail: `expected ${header.length} columns, got ${row.length}` });
      continue;
    }
    const date = ledesDate(col(row, "LINE_ITEM_DATE[]"));
    if (!date) {
      errors.push({ line: n, error: "bad_date", detail: `LINE_ITEM_DATE[] "${col(row, "LINE_ITEM_DATE[]")}" is not a valid YYYYMMDD date` });
      continue;
    }
    const typeRaw = String(col(row, "EXP/FEE/INV_ADJ_TYPE[]") ?? "").trim().toUpperCase();
    if (!LINE_TYPES.has(typeRaw)) {
      errors.push({ line: n, error: "bad_line_type", detail: `EXP/FEE/INV_ADJ_TYPE[] "${col(row, "EXP/FEE/INV_ADJ_TYPE[]")}" is not one of F (fee), E (expense), IF (fee adjustment), IE (expense adjustment)` });
      continue;
    }
    const units = ledesNumber(col(row, "LINE_ITEM_NUMBER_OF_UNITS[]"));
    const unitCost = ledesNumber(col(row, "LINE_ITEM_UNIT_COST[]"));
    const total = ledesNumber(col(row, "LINE_ITEM_TOTAL[]"));
    const fee = typeRaw === "F";
    // NaN = malformed number; fee lines additionally require units, unit cost,
    // and total present; expense and adjustment lines require only the total.
    const badFields = [];
    if (Number.isNaN(units)) badFields.push("LINE_ITEM_NUMBER_OF_UNITS[]");
    if (Number.isNaN(unitCost)) badFields.push("LINE_ITEM_UNIT_COST[]");
    if (Number.isNaN(total)) badFields.push("LINE_ITEM_TOTAL[]");
    if (fee && badFields.length === 0 && (units === null || unitCost === null || total === null)) {
      badFields.push("fee line is missing units, unit cost, or total");
    }
    if (!fee && badFields.length === 0 && total === null) {
      badFields.push(`${typeRaw} line is missing LINE_ITEM_TOTAL[]`);
    }
    if (badFields.length > 0) {
      errors.push({ line: n, error: "bad_number", detail: `${badFields.join("; ")} — on \"${l}\"` });
      continue;
    }
    // Fee lines must be internally consistent: units × unit cost = total
    // (integer-cent comparison; mismatch is a structured error, never averaged away).
    if (fee && Math.round(units * unitCost * 100) !== Math.round(total * 100)) {
      errors.push({ line: n, error: "total_mismatch", detail: `LINE_ITEM_NUMBER_OF_UNITS[] × LINE_ITEM_UNIT_COST[] = ${units} × ${unitCost} ≠ LINE_ITEM_TOTAL[] ${total}` });
      continue;
    }
    const matterRaw = String(col(row, "LAW_FIRM_MATTER_ID[]") ?? "").trim();
    const firmRaw = header.includes("LAW_FIRM_ID[]") ? String(col(row, "LAW_FIRM_ID[]") ?? "").trim() : "";
    ledger.push({
      id: `LIN-${ledger.length + 1}`,
      matterId: matterRaw || null,
      firmId: firmRaw || (opts.firmId ?? null),
      period: date.slice(0, 7),
      date,
      type: typeRaw === "F" || typeRaw === "IF" ? "fee" : "disbursement", // IE → expense adjustment
      billing: fee ? "hourly" : "flat", // adjustments carry only a total
      hours: fee && units !== null ? units : null,
      rate: fee && unitCost !== null ? unitCost : null,
      amount: total, // adjustment totals may be negative — preserved verbatim
      timekeeper: String(col(row, "TIMEKEEPER_NAME[]") ?? "").trim() || null,
      level: String(col(row, "TIMEKEEPER_LEVEL[]") ?? "").trim().toLowerCase() || null,
      narrative: String(col(row, "LINE_ITEM_DESCRIPTION[]") ?? "").trim(),
    });
  }
  return { ledger, errors };
}
