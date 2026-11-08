/**
 * Deterministic redlines — token-diff of the matched clause span against the
 * rule's preferred standard. Not LLM-drafted: every −/+ line is traceable to
 * a verbatim character span of the clause (removals) or to the playbook's own
 * preferred text (additions).
 */
import { tokenizeWithSpans } from './textutil';
import type { BoardRow, PlaybookRule } from './board';

export interface Redline {
  /** label of the preferred standard the redline targets */
  label: string | null;
  /** verbatim clause spans to remove (character-anchored in clauseText) */
  removals: string[];
  /** verbatim preferred-standard spans to insert */
  additions: string[];
}

/** Longest-common-subsequence table over normalized token strings. */
function lcsMask(a: string[], b: string[]): boolean[] {
  // dp[i][j] = LCS length of a[i..], b[j..]
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const keep: boolean[] = new Array(a.length).fill(false);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      keep[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return keep;
}

/** Contiguous runs of removed/added tokens, rendered as verbatim source slices.
 *  A run's trailing edge is extended to the next kept token (then trimmed) so
 *  edge punctuation travels with the run: "two (2" -> "two (2)". */
function runs(source: string, keep: boolean[]): string[] {
  const toks = tokenizeWithSpans(source);
  const out: string[] = [];
  let i = 0;
  while (i < toks.length) {
    if (keep[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < toks.length && !keep[i]) i++;
    const end = i < toks.length ? toks[i].start : source.length;
    out.push(source.slice(toks[start].start, end).trim());
  }
  return out;
}

/**
 * Drop a leading "3.1 Term."-style heading prefix (section number + the
 * clause's own heading) so a whole-clause redline only touches body text.
 */
function stripHeadingPrefix(text: string, heading: string | null): string {
  if (!heading) return text;
  const toks = tokenizeWithSpans(text);
  if (toks.length < 3 || !/^\d+(\.\d+)*$/.test(toks[0].norm) || toks[1].norm !== heading.toLowerCase()) return text;
  return text.slice(toks[2].start);
}

/**
 * Redline a deviates row back to the preferred standard: LCS token diff of
 * the matched span (or the heading-stripped whole clause, when beyond
 * playbook) vs the preferred text, grouped into contiguous −/+ runs.
 * Returns null when there is nothing to change.
 */
export function redline(row: BoardRow, rule: PlaybookRule): Redline | null {
  const old = row.clauseQuote?.text ?? stripHeadingPrefix(row.clauseText, row.heading);
  const fresh = tokenizeWithSpans(old).map((t) => t.norm);
  const preferred = tokenizeWithSpans(rule.preferred.text).map((t) => t.norm);
  const keepOld = lcsMask(fresh, preferred);
  const keepNew = lcsMask(preferred, fresh);
  const removals = runs(old, keepOld);
  const additions = runs(rule.preferred.text, keepNew);
  if (removals.length === 0 && additions.length === 0) return null;
  return { label: rule.preferred.label ?? null, removals, additions };
}
