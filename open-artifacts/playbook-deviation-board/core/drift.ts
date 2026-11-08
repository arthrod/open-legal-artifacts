/**
 * Playbook drift detector — their `playbook-monitor` agent's rule, as
 * auditable code. Consumes a deviation log (one entry per non-compliant row
 * that was accepted anyway) and proposes per rule:
 *
 *   Flag    — threshold reached and the window includes avoid-language
 *             (deal_breaker) hits: counterparties keep signing language the
 *             playbook says never to accept → enforcement review.
 *   Revise  — threshold reached and every counted entry deviates the same
 *             direction: the standard does not match market reality →
 *             revise the playbook.
 *   Clarify — threshold reached but directions split: guidance is being read
 *             both ways → clarify the rule.
 *   null    — below threshold (watch only).
 *
 * All decisions are deterministic: entries are filtered to a rolling
 * `lookbackMonths` window ending at the latest entry date (or `asOf`).
 */

export interface DriftEntry {
  /** ISO date, YYYY-MM-DD */
  date: string;
  ruleId: string;
  /** which way the clause deviated, e.g. "term:shorter" or "tier:2" */
  direction: string;
  kind?: 'deviation' | 'deal_breaker';
  clauseId?: string;
  contractName?: string;
}

export interface DriftOptions {
  threshold?: number;
  lookbackMonths?: number;
  /** ISO date; defaults to the latest entry date */
  asOf?: string;
}

export type DriftProposal = 'Revise' | 'Clarify' | 'Flag' | null;

export interface DriftRuleReport {
  ruleId: string;
  /** entries inside the lookback window */
  count: number;
  /** deal_breaker-kind entries inside the window */
  dealBreakers: number;
  /** direction counts, sorted by count desc then direction asc */
  directions: { direction: string; count: number }[];
  proposal: DriftProposal;
  note: string;
}

export interface DriftReport {
  asOf: string;
  lookbackMonths: number;
  threshold: number;
  rules: DriftRuleReport[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(s: string): { y: number; m: number; d: number } {
  if (!DATE_RE.test(s)) throw new Error(`detectDrift(): date must be YYYY-MM-DD, got "${s}"`);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  // round-trip through a real calendar — rejects 2026-99-99, 2026-02-30, …
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`detectDrift(): date is not a valid calendar date, got "${s}"`);
  }
  return { y, m, d };
}

/** whole months from entry to asOf (negative ⇒ entry after asOf ⇒ excluded). */
function monthsBack(entry: { y: number; m: number }, asOf: { y: number; m: number }): number {
  return (asOf.y - entry.y) * 12 + (asOf.m - entry.m);
}

export function detectDrift(entries: DriftEntry[], opts: DriftOptions = {}): DriftReport {
  const threshold = opts.threshold ?? 5;
  const lookbackMonths = opts.lookbackMonths ?? 12;
  if (entries.length === 0 && opts.asOf === undefined) {
    return { asOf: '', lookbackMonths, threshold, rules: [] };
  }
  const dated = entries.map((e) => ({ entry: e, parsed: parseDate(e.date) }));
  dated.sort((x, y) => (x.entry.date < y.entry.date ? -1 : x.entry.date > y.entry.date ? 1 : 0));
  const asOfStr = opts.asOf ?? dated[dated.length - 1].entry.date;
  const asOf = parseDate(asOfStr);

  // group by ruleId in first-appearance order over date-sorted entries
  const byRule = new Map<string, { entry: DriftEntry; parsed: { y: number; m: number; d: number } }[]>();
  for (const d of dated) {
    if (!byRule.has(d.entry.ruleId)) byRule.set(d.entry.ruleId, []);
    byRule.get(d.entry.ruleId)!.push(d);
  }

  const rules: DriftRuleReport[] = [];
  for (const [ruleId, ds] of byRule) {
    const window = ds.filter((d) => {
      const back = monthsBack(d.parsed, asOf);
      return back >= 0 && back < lookbackMonths;
    });
    const dirCounts = new Map<string, number>();
    let dealBreakers = 0;
    for (const { entry } of window) {
      dirCounts.set(entry.direction, (dirCounts.get(entry.direction) ?? 0) + 1);
      if (entry.kind === 'deal_breaker') dealBreakers++;
    }
    const directions = [...dirCounts.entries()]
      .map(([direction, count]) => ({ direction, count }))
      .sort((a, b) => b.count - a.count || (a.direction < b.direction ? -1 : 1));
    const count = window.length;

    let proposal: DriftProposal = null;
    let note = `${count} entr${count === 1 ? 'y' : 'ies'} in the last ${lookbackMonths} months — below threshold ${threshold}; watch only.`;
    if (count >= threshold && dealBreakers > 0) {
      proposal = 'Flag';
      note = `${count} entries incl. ${dealBreakers} avoid-language (deal_breaker) hit(s) in ${lookbackMonths} months — counterparties keep signing deal-breaker language; flag for enforcement review.`;
    } else if (count >= threshold && directions.length === 1) {
      proposal = 'Revise';
      note = `${count} same-direction deviations ("${directions[0].direction}") in ${lookbackMonths} months — the standard does not match practice; propose revising the rule.`;
    } else if (count >= threshold) {
      proposal = 'Clarify';
      note = `${count} deviations split across ${directions.length} directions (${directions.map((d) => `${d.direction}: ${d.count}`).join(', ')}) in ${lookbackMonths} months — guidance reads both ways; propose clarifying the rule.`;
    }
    rules.push({ ruleId, count, dealBreakers, directions, proposal, note });
  }
  return { asOf: asOfStr, lookbackMonths, threshold, rules };
}
