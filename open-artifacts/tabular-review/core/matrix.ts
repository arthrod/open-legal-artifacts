/**
 * tabular-review core — deterministic documents × questions review matrix.
 * NO LLM: the core VERIFIES extraction, it never answers.
 *
 * Contract (catalog §2.1): one row per document, one column per question,
 * every answered cell source-anchored. A cell is `answered` ONLY when the
 * supplied answer carries a quote that locates in the document (exact or
 * normalized; fuzzy anchors the answer but is flagged for review) AND the
 * answer satisfies the question's typed schema, if any. Anything else is
 * `unverified` with a machine reason — never guessed:
 *   not_answered | missing_quote | quote_not_verified | no_such_document
 *   | constraint_violation | not_present | unclear | needs_review
 *
 * The core also runs a deterministic consistency pass (minority classify
 * values in a column are flagged `outlier_value`; the answer is kept) and
 * emits: RFC-4180 CSV (with an empty reviewer `Verified` column), Markdown,
 * a per-cell sources audit CSV, and a re-run diff (`diffMatrices`).
 */

import { bestWindowIn, makeLocator, rawContains, type Locator } from './textutil';

export interface ReviewDoc {
  id: string;
  name: string;
  text: string;
}
export type QuestionType = 'classify' | 'date' | 'duration' | 'currency' | 'number' | 'verbatim' | 'free';
export interface QuestionBounds {
  min?: number;
  max?: number;
  /** unit the bounds are expressed in (duration: days|weeks|months|years, default months) */
  unit?: string;
}
export interface Question {
  id: string;
  question: string;
  /** typed questions are machine-checked; untyped questions are free-text */
  type?: QuestionType;
  /** classify: allowed values (an answer must match one) */
  options?: string[];
  /** duration/currency/number: inclusive numeric bounds */
  bounds?: QuestionBounds;
}
export type NotFoundState = 'not_present' | 'unclear' | 'needs_review';
export interface CellInput {
  documentId: string;
  questionId: string;
  /** the extracted answer; null/omitted => unverified */
  answer?: string | null;
  /** verbatim supporting quote from the document */
  quote?: string;
  pinpoint?: string;
  /** extractor's explicit not-found state; takes precedence over `answer` */
  notFound?: NotFoundState;
}
export interface MatrixInput {
  documents: ReviewDoc[];
  questions: Question[];
  cells: CellInput[];
  fuzzyThreshold?: number;
}

export type UnverifiedReason =
  | 'not_answered'
  | 'missing_quote'
  | 'quote_not_verified'
  | 'no_such_document'
  | 'no_such_question'
  | 'constraint_violation'
  | NotFoundState;
export interface CellVerification {
  classification: 'exact' | 'normalized' | 'fuzzy';
  similarity: number;
  charStart: number;
  charEnd: number;
  verbatim: string;
  pinpoint: string | null;
}
/** what the core deterministically parsed from a typed answer */
export interface SchemaInfo {
  type: QuestionType;
  /** classify: the matched option */
  matched?: string;
  /** duration/currency/number: the parsed value in `unit` */
  value?: number;
  unit?: string;
}
export interface Cell {
  documentId: string;
  questionId: string;
  status: 'answered' | 'unverified';
  answer: string | null;
  unverifiedReason: UnverifiedReason | null;
  verification: CellVerification | null;
  /** consistency-pass flags, e.g. `outlier_value` (answer is kept) */
  flags: string[];
  schema: SchemaInfo | null;
}
export interface ColumnSummary {
  questionId: string;
  answered: number;
  unverified: number;
  outliers: number;
  reasons: Partial<Record<UnverifiedReason, number>>;
}
export interface MatrixOutput {
  summary: {
    cells: number;
    answered: number;
    unverified: number;
    flaggedForReview: number;
    outliers: number;
    columns: ColumnSummary[];
  };
  cells: Cell[];
}

const REASON_ORDER: UnverifiedReason[] = [
  'not_answered',
  'missing_quote',
  'quote_not_verified',
  'no_such_document',
  'no_such_question',
  'constraint_violation',
  'not_present',
  'unclear',
  'needs_review',
];

/* ---------- deterministic typed-answer parsers ---------- */

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_RE = MONTH_NAMES.join('|');

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** classify match: exact (case/whitespace-folded) equality or whole-phrase containment; longest option wins. */
export function classifyMatch(answer: string, options: string[]): string | null {
  const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const a = norm(answer);
  let best: string | null = null;
  for (const opt of options) {
    const o = opt.trim();
    if (!o) continue;
    const no = norm(o);
    if (no === a || new RegExp(`\\b${escapeRegExp(no)}\\b`).test(a)) {
      if (best === null || o.length > best.length) best = o;
    }
  }
  return best;
}

/** Parse a calendar date from free text; null when no full date locates. */
export function parseDate(s: string): { year: number; month: number; day: number } | null {
  const iso = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const mdy = s.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i'));
  if (mdy) return validDate(Number(mdy[3]), MONTH_NAMES.indexOf(mdy[1].toLowerCase()) + 1, Number(mdy[2]));
  const dmy = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?,?\\s+(\\d{4})\\b`, 'i'));
  if (dmy) return validDate(Number(dmy[3]), MONTH_NAMES.indexOf(dmy[2].toLowerCase()) + 1, Number(dmy[1]));
  const my = s.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{4})\\b`, 'i'));
  if (my) return validDate(Number(my[2]), MONTH_NAMES.indexOf(my[1].toLowerCase()) + 1, 1);
  return null;
}
function validDate(year: number, month: number, day: number): { year: number; month: number; day: number } | null {
  if (month < 1 || month > 12 || year < 1) return null;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lens = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > lens[month - 1]) return null;
  return { year, month, day };
}

/** Parse a duration to canonical months (day=1/30, week=7/30, month=1, year=12); null when none locates. */
export function durationMonths(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:calendar\s+)?(day|week|month|year)s?\b/i);
  if (!m) return null;
  const factors: Record<string, number> = { day: 1 / 30, week: 7 / 30, month: 1, year: 12 };
  return Number(m[1]) * factors[m[2].toLowerCase()];
}
function convertMonths(v: number, unit: string | undefined): { value: number; unit: string } {
  const u = (unit ?? 'months').toLowerCase();
  const per: Record<string, number> = { days: 30, weeks: 30 / 7, months: 1, years: 1 / 12 };
  return { value: v * (per[u] ?? 1), unit: u };
}

/** scale-word suffixes folded into the parsed amount, as 10^zeros */
const SCALE_WORDS: Record<string, number> = {
  thousand: 3, k: 3,
  million: 6, mm: 6, mn: 6, m: 6,
  billion: 9, bn: 9, b: 9,
};
const SCALE_RE = 'thousand|million|billion|mm|mn|bn|k|m|b';
const CURRENCY_CODE = 'USD|GBP|EUR|dollars|pounds|euros';

/**
 * Multiply a digit string by 10^zeros by shifting the decimal point in the
 * DIGIT STRING — exact, no float multiplication drift ("1.1" ×10^6 is
 * "1100000", not 1.1*1e6).
 */
function shiftDecimal(digits: string, zeros: number): number {
  const [int, frac = ''] = digits.replace(/,/g, '').split('.');
  const shift = zeros - frac.length;
  if (shift >= 0) return Number(int + frac + '0'.repeat(shift));
  const s = int + frac;
  const cut = s.length + shift;
  return Number(`${s.slice(0, cut)}.${s.slice(cut)}`);
}

function matchCurrencyAmount(s: string): { digits: string; scale: string | null } | null {
  // "$1.5 million", "£2m", "$50,000"
  let m = s.match(new RegExp(`[$£€]\\s*([\\d,]+(?:\\.\\d+)?)\\s*(?:(${SCALE_RE})\\b)?`, 'i'));
  if (m) return { digits: m[1], scale: m[2] ?? null };
  // "50,000 USD", "1.5 million USD"
  m = s.match(new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s*(?:(${SCALE_RE})\\s+)?(?:${CURRENCY_CODE})\\b`, 'i'));
  if (m) return { digits: m[1], scale: m[2] ?? null };
  // "USD 1.5 million"
  m = s.match(new RegExp(`(?:${CURRENCY_CODE})\\s+([\\d,]+(?:\\.\\d+)?)\\s*(?:(${SCALE_RE})\\b)?`, 'i'));
  if (m) return { digits: m[1], scale: m[2] ?? null };
  return null;
}

/**
 * Parse a currency amount ("$50,000", "50,000 USD", "$1.5 million", "£2m").
 * Scale words (k/thousand, m/mm/mn/million, b/bn/billion) are folded into
 * the amount exactly via decimal shift. Ambiguous or unparseable forms
 * return null (→ constraint_violation) — never a silently wrong number.
 */
export function currencyAmount(s: string): number | null {
  const m = matchCurrencyAmount(s);
  if (!m) return null;
  if (m.scale === null) return Number(m.digits.replace(/,/g, ''));
  const zeros = SCALE_WORDS[m.scale.toLowerCase()];
  if (zeros === undefined) return null; // unrecognized suffix — refuse, never guess
  return shiftDecimal(m.digits, zeros);
}

function firstNumber(s: string): number | null {
  const m = s.match(/\d[\d,]*(?:\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, '')) : null;
}

function withinBounds(v: number, b: QuestionBounds): boolean {
  const eps = 1e-9;
  return (b.min === undefined || v >= b.min - eps) && (b.max === undefined || v <= b.max + eps);
}

/**
 * Enforce a question's typed schema on a quote-verified answer.
 * Returns null when there is nothing to check (untyped/free),
 * false on violation, or the parsed SchemaInfo on success.
 */
function checkSchema(q: Question, answer: string, loc: Locator): SchemaInfo | false | null {
  switch (q.type) {
    case undefined:
    case 'free':
      return null;
    case 'classify': {
      if (!q.options?.length) return null;
      const matched = classifyMatch(answer, q.options);
      return matched === null ? false : { type: 'classify', matched };
    }
    case 'date':
      return parseDate(answer) === null ? false : { type: 'date' };
    case 'duration': {
      const months = durationMonths(answer);
      if (months === null) return false;
      const { value, unit } = convertMonths(months, q.bounds?.unit);
      if (q.bounds && !withinBounds(value, q.bounds)) return false;
      return { type: 'duration', value, unit };
    }
    case 'currency': {
      const amount = currencyAmount(answer);
      if (amount === null) return false;
      if (q.bounds && !withinBounds(amount, q.bounds)) return false;
      return { type: 'currency', value: amount };
    }
    case 'number': {
      const n = firstNumber(answer);
      if (n === null) return false;
      if (q.bounds && !withinBounds(n, q.bounds)) return false;
      return { type: 'number', value: n };
    }
    case 'verbatim':
      return rawContains(loc.source, answer) ? { type: 'verbatim' } : false;
  }
}

function verifyQuote(loc: Locator, cell: CellInput, fuzzyThreshold: number): CellVerification | null {
  if (!cell.quote) return null;
  const q = cell.quote.trim();
  // exact pass first — a verbatim quote needs no window scan at all
  if (q.length > 0 && loc.source.includes(q)) {
    const start = loc.source.indexOf(q);
    return {
      classification: 'exact',
      similarity: 1,
      charStart: start,
      charEnd: start + q.length,
      verbatim: loc.source.slice(start, start + q.length),
      pinpoint: cell.pinpoint ?? null,
    };
  }
  const win = bestWindowIn(loc, cell.quote);
  if (win && win.score >= 0.95 && win.coverage >= 0.95) {
    return { classification: 'normalized', similarity: win.score, charStart: win.start, charEnd: win.end, verbatim: win.verbatim, pinpoint: cell.pinpoint ?? null };
  }
  if (win && win.score >= fuzzyThreshold && win.coverage >= 0.6) {
    return { classification: 'fuzzy', similarity: win.score, charStart: win.start, charEnd: win.end, verbatim: win.verbatim, pinpoint: cell.pinpoint ?? null };
  }
  return null; // quote does not locate in the document
}

export function buildMatrix(input: MatrixInput): MatrixOutput {
  const fuzzyThreshold = input.fuzzyThreshold ?? 0.7;
  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const questions = new Map(input.questions.map((q) => [q.id, q]));
  const supplied = new Map(input.cells.map((c) => [`${c.documentId}::${c.questionId}`, c]));
  // one locator per document, built lazily and reused across every quote
  // verification (tokenize once, not once per cell)
  const locCache = new Map<string, Locator>();
  const locatorOf = (doc: ReviewDoc): Locator => {
    let loc = locCache.get(doc.id);
    if (!loc) {
      loc = makeLocator(doc.text);
      locCache.set(doc.id, loc);
    }
    return loc;
  };

  const cells: Cell[] = [];
  for (const doc of input.documents) {
    for (const q of input.questions) {
      const c = supplied.get(`${doc.id}::${q.id}`);
      if (c?.notFound) {
        // explicit extractor assertion: the document does not answer (distinct states)
        cells.push({ documentId: doc.id, questionId: q.id, status: 'unverified', answer: null, unverifiedReason: c.notFound, verification: null, flags: [], schema: null });
        continue;
      }
      if (!c || c.answer === undefined || c.answer === null || c.answer.trim() === '') {
        cells.push({ documentId: doc.id, questionId: q.id, status: 'unverified', answer: null, unverifiedReason: 'not_answered', verification: null, flags: [], schema: null });
        continue;
      }
      if (!c.quote || c.quote.trim() === '') {
        cells.push({ documentId: doc.id, questionId: q.id, status: 'unverified', answer: null, unverifiedReason: 'missing_quote', verification: null, flags: [], schema: null });
        continue;
      }
      const loc = locatorOf(doc);
      const verification = verifyQuote(loc, c, fuzzyThreshold);
      if (!verification) {
        cells.push({ documentId: doc.id, questionId: q.id, status: 'unverified', answer: null, unverifiedReason: 'quote_not_verified', verification: null, flags: [], schema: null });
        continue;
      }
      const schema = checkSchema(q, c.answer, loc);
      if (schema === false) {
        // typed question: the answer violates the schema (option set / parse / bounds)
        cells.push({ documentId: doc.id, questionId: q.id, status: 'unverified', answer: null, unverifiedReason: 'constraint_violation', verification: null, flags: [], schema: null });
        continue;
      }
      cells.push({ documentId: doc.id, questionId: q.id, status: 'answered', answer: c.answer, unverifiedReason: null, verification, flags: [], schema });
    }
  }

  // join-key validation: a supplied cell whose documentId/questionId is not
  // in the input sets was never reached by the grid loop — surface it as an
  // unverified cell so a typo'd key is visible, never silently dropped
  const orphanSeen = new Set<string>();
  for (const c of input.cells) {
    if (docs.has(c.documentId) && questions.has(c.questionId)) continue; // covered by the grid
    const key = `${c.documentId}::${c.questionId}`;
    if (orphanSeen.has(key)) continue;
    orphanSeen.add(key);
    cells.push({
      documentId: c.documentId,
      questionId: c.questionId,
      status: 'unverified',
      answer: null,
      unverifiedReason: docs.has(c.documentId) ? 'no_such_question' : 'no_such_document',
      verification: null,
      flags: [],
      schema: null,
    });
  }

  // consistency pass — minority classify values in a column are flagged (answer kept)
  let outliers = 0;
  for (const q of input.questions) {
    if (q.type !== 'classify' || !q.options?.length) continue;
    const col = cells.filter((c) => c.questionId === q.id && c.status === 'answered');
    if (col.length < 2) continue;
    const counts = new Map<string, number>();
    for (const c of col) {
      const k = c.schema?.matched ?? c.answer!;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const threshold = Math.max(1, 0.1 * col.length); // count ≤ max(1, 10% of column)
    if (![...counts.values()].some((n) => n > threshold)) continue; // no majority to diverge from
    for (const c of col) {
      const k = c.schema?.matched ?? c.answer!;
      if ((counts.get(k) ?? 0) <= threshold) {
        c.flags.push('outlier_value');
        outliers++;
      }
    }
  }

  const columns: ColumnSummary[] = input.questions.map((q) => {
    const col = cells.filter((c) => c.questionId === q.id);
    const reasons: Partial<Record<UnverifiedReason, number>> = {};
    for (const r of REASON_ORDER) {
      const n = col.filter((c) => c.unverifiedReason === r).length;
      if (n > 0) reasons[r] = n;
    }
    return {
      questionId: q.id,
      answered: col.filter((c) => c.status === 'answered').length,
      unverified: col.filter((c) => c.status === 'unverified').length,
      outliers: col.filter((c) => c.flags.includes('outlier_value')).length,
      reasons,
    };
  });

  return {
    summary: {
      cells: cells.length,
      answered: cells.filter((c) => c.status === 'answered').length,
      unverified: cells.filter((c) => c.status === 'unverified').length,
      flaggedForReview: cells.filter((c) => c.verification?.classification === 'fuzzy').length,
      outliers,
      columns,
    },
    cells,
  };
}

/* ---------- exports ---------- */

/** RFC-4180: quote fields containing commas, quotes, or newlines. */
export function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCSV(input: MatrixInput, out: MatrixOutput): string {
  const lines: string[] = [];
  lines.push(csvEscape('Document') + ',' + input.questions.map((q) => csvEscape(q.question)).join(',') + ',Verified');
  for (const doc of input.documents) {
    const row = [csvEscape(doc.name)];
    for (const q of input.questions) {
      const cell = out.cells.find((c) => c.documentId === doc.id && c.questionId === q.id);
      if (!cell || cell.status === 'unverified') {
        row.push(csvEscape(`UNVERIFIED (${cell?.unverifiedReason ?? 'not_answered'})`));
      } else {
        const pin = cell.verification?.pinpoint ? ` [${cell.verification.pinpoint}]` : '';
        const flag = cell.verification?.classification === 'fuzzy' ? ' [quote fuzzy — review]' : '';
        const outlier = cell.flags.includes('outlier_value') ? ' [outlier_value]' : '';
        row.push(csvEscape(`${cell.answer}${pin}${flag}${outlier}`));
      }
    }
    row.push(''); // empty reviewer sign-off column
    lines.push(row.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Per-cell audit companion: every cell's verbatim anchor, char span, pinpoint. */
export function toSourcesCSV(input: MatrixInput, out: MatrixOutput): string {
  const docName = new Map(input.documents.map((d) => [d.id, d.name]));
  const qText = new Map(input.questions.map((q) => [q.id, q.question]));
  const lines: string[] = [];
  lines.push('Document,Question,Verbatim,Span,Pinpoint,Classification');
  for (const c of out.cells) {
    const v = c.verification;
    lines.push(
      [
        csvEscape(docName.get(c.documentId) ?? c.documentId),
        csvEscape(qText.get(c.questionId) ?? c.questionId),
        v ? csvEscape(v.verbatim) : '',
        v ? `${v.charStart}-${v.charEnd}` : '',
        v?.pinpoint ? csvEscape(v.pinpoint) : '',
        v ? v.classification : c.unverifiedReason ?? '',
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

export function toMarkdown(input: MatrixInput, out: MatrixOutput): string {
  const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  const lines: string[] = [];
  lines.push(`| Document | ${input.questions.map((q) => esc(q.question)).join(' | ')} |`);
  lines.push(`|---|${input.questions.map(() => '---').join('|')}|`);
  for (const doc of input.documents) {
    const row = [esc(doc.name)];
    for (const q of input.questions) {
      const cell = out.cells.find((c) => c.documentId === doc.id && c.questionId === q.id);
      if (!cell || cell.status === 'unverified') {
        row.push(`**UNVERIFIED** (${cell?.unverifiedReason ?? 'not_answered'})`);
      } else {
        const pin = cell.verification?.pinpoint ? ` [${cell.verification.pinpoint}]` : '';
        const flag = cell.verification?.classification === 'fuzzy' ? ' ⚠ quote fuzzy — review' : '';
        const outlier = cell.flags.includes('outlier_value') ? ' ⚠ outlier_value' : '';
        row.push(esc(cell.answer!) + esc(pin) + flag + outlier);
      }
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines.join('\n') + '\n';
}

/* ---------- re-run diff ---------- */

export interface CellDiffSide {
  status: 'answered' | 'unverified';
  answer: string | null;
  classification: string | null;
  unverifiedReason: UnverifiedReason | null;
}
export interface CellDiff {
  documentId: string;
  questionId: string;
  added: boolean;
  removed: boolean;
  changed: boolean;
  prev: CellDiffSide | null;
  next: CellDiffSide | null;
}
export interface MatrixDiff {
  cells: CellDiff[];
  summary: { added: number; removed: number; changed: number; unchanged: number };
}

function sideOf(c: Cell): CellDiffSide {
  return {
    status: c.status,
    answer: c.answer,
    classification: c.verification?.classification ?? null,
    unverifiedReason: c.unverifiedReason ?? null,
  };
}

/** Deterministic diff between two runs: added/removed cells and status/answer/classification/reason changes. */
export function diffMatrices(prev: MatrixOutput, next: MatrixOutput): MatrixDiff {
  const key = (c: Cell): string => `${c.documentId}::${c.questionId}`;
  const prevMap = new Map(prev.cells.map((c) => [key(c), c]));
  const nextMap = new Map(next.cells.map((c) => [key(c), c]));
  const diffs: CellDiff[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;
  const emit = (k: string, p: Cell | undefined, n: Cell | undefined): void => {
    const [documentId, questionId] = k.split('::');
    if (p && !n) {
      removed++;
      diffs.push({ documentId, questionId, added: false, removed: true, changed: false, prev: sideOf(p), next: null });
    } else if (!p && n) {
      added++;
      diffs.push({ documentId, questionId, added: true, removed: false, changed: false, prev: null, next: sideOf(n) });
    } else if (p && n) {
      const same = JSON.stringify(sideOf(p)) === JSON.stringify(sideOf(n));
      if (same) unchanged++;
      else changed++;
      diffs.push({ documentId, questionId, added: false, removed: false, changed: !same, prev: sideOf(p), next: sideOf(n) });
    }
  };
  for (const c of prev.cells) emit(key(c), c, nextMap.get(key(c)));
  for (const c of next.cells) if (!prevMap.has(key(c))) emit(key(c), undefined, c);
  return { cells: diffs, summary: { added, removed, changed, unchanged } };
}
