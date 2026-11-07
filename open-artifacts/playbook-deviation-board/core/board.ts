/**
 * playbook-deviation-board core — deterministic clause classification against
 * a company playbook. NO LLM: same playbook + contract always yields the same
 * board.
 *
 * Classification (evaluated per clause, in order):
 *   deal_breaker — clause triggers an `avoid` rule (contains-match, or
 *                  similarity-match at the rule's threshold)
 *   compliant    — clause matches the preferred standard (best-window
 *                  similarity ≥ preferred threshold, and at least as strong as
 *                  the best fallback match)
 *   deviates     — clause matches a fallback tier (reported as that tier), or
 *                  matches nothing in the rule ("beyond playbook")
 *   unclassified — no playbook rule could be assigned (heading doesn't match
 *                  any rule topic and no explicit ruleId)
 *
 * Every classified row quotes the clause span that matched (or the avoid
 * trigger) and routes to an approver: fallback tiers ≥ escalation.
 * minFallbackTier go to the escalation approver; everything else that needs
 * review goes to the playbook's defaultApprover.
 */

import { bestWindow, similarity } from './textutil';

export interface AvoidRule {
  id?: string;
  mode: 'contains' | 'similarity';
  text: string;
  threshold?: number;
}
export interface Standard {
  label?: string;
  text: string;
}
export interface Fallback extends Standard {
  tier: number;
}
export interface PlaybookRule {
  id: string;
  topic: string;
  preferred: Standard;
  fallbacks: Fallback[];
  avoid: AvoidRule[];
  escalation?: { approver: string; minFallbackTier?: number };
}
export interface Playbook {
  playbookId: string;
  name?: string;
  defaultApprover: string;
  rules: PlaybookRule[];
}
export interface Clause {
  id: string;
  heading?: string;
  text: string;
  /** explicit rule assignment; otherwise matched by heading vs rule topic */
  ruleId?: string;
}
export interface BoardInput {
  playbook: Playbook;
  contract: { name: string; clauses: Clause[] };
  thresholds?: { preferred?: number; fallback?: number; topic?: number };
}

export type Classification = 'compliant' | 'deviates' | 'deal_breaker' | 'unclassified';

export interface BoardRow {
  clauseId: string;
  heading: string | null;
  ruleId: string | null;
  classification: Classification;
  /** 'preferred', fallback tier number, or null */
  matchedTier: 'preferred' | number | null;
  matchedLabel: string | null;
  similarity: number;
  /** the clause span that drove the decision */
  clauseQuote: { text: string; charStart: number; charEnd: number } | null;
  clauseText: string;
  reason: string;
  routedTo: string | null;
}
export interface BoardOutput {
  contractName: string;
  playbookId: string;
  summary: { compliant: number; deviates: number; dealBreaker: number; unclassified: number };
  rows: BoardRow[];
}

function normContains(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase().replace(/\s+/g, ' ');
  const n = needle.toLowerCase().replace(/\s+/g, ' ').trim();
  return n.length > 0 && h.includes(n);
}

interface StandardScore {
  tier: 'preferred' | number;
  label: string | null;
  text: string;
  score: number;
  /** numbers in the standard must appear verbatim in the matched span (multiset equality) */
  numericMatch: boolean;
  numericDetail: string | null;
  span: { text: string; charStart: number; charEnd: number } | null;
}

function numericTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => /^[0-9]+(\.[0-9]+)?$/.test(t))
    .sort();
}

function sameMultiset(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, idx) => x === b[idx]);
}

function scoreStandard(clauseText: string, std: Standard, tier: 'preferred' | number): StandardScore {
  const w = bestWindow(clauseText, std.text);
  const stdNums = numericTokens(std.text);
  const winNums = w ? numericTokens(w.verbatim) : [];
  const numericMatch = stdNums.length === 0 || sameMultiset(stdNums, winNums);
  const numericDetail =
    stdNums.length === 0 || numericMatch ? null : `standard requires [${stdNums.join(', ')}] but matched span has [${winNums.join(', ')}]`;
  return {
    tier,
    label: std.label ?? null,
    text: std.text,
    score: w?.score ?? 0,
    numericMatch,
    numericDetail,
    span: w ? { text: w.verbatim, charStart: w.start, charEnd: w.end } : null,
  };
}

export function classifyClause(clause: Clause, rule: PlaybookRule, th: { preferred: number; fallback: number }): { row: Omit<BoardRow, 'heading'> } {
  const approverFor = (): string => rule.escalation?.approver ?? '__DEFAULT__';

  // 1. avoid rules first — a deal-breaker is a deal-breaker regardless of other matches
  for (const av of rule.avoid) {
    const hit =
      av.mode === 'contains'
        ? normContains(clause.text, av.text)
        : similarity(clause.text, av.text) >= (av.threshold ?? 0.8);
    if (hit) {
      return {
        row: {
          clauseId: clause.id,
          ruleId: rule.id,
          classification: 'deal_breaker',
          matchedTier: null,
          matchedLabel: null,
          similarity: 1,
          clauseQuote: { text: clause.text, charStart: 0, charEnd: clause.text.length },
          clauseText: clause.text,
          reason: `matches avoid rule${av.id ? ` "${av.id}"` : ''}: ${av.mode === 'contains' ? 'contains' : 'similar to'} "${av.text}"`,
          routedTo: approverFor() === '__DEFAULT__' ? null : approverFor(),
        },
      };
    }
  }

  // 2. score preferred and all fallbacks
  const preferred = scoreStandard(clause.text, rule.preferred, 'preferred');
  const fallbacks = rule.fallbacks
    .map((f) => scoreStandard(clause.text, f, f.tier))
    .sort((a, b) => b.score - a.score || Number(a.tier) - Number(b.tier)); // best score, then lowest tier
  const bestFb = fallbacks[0] ?? null;

  if (preferred.score >= th.preferred && preferred.numericMatch && (!bestFb || preferred.score >= bestFb.score)) {
    return {
      row: {
        clauseId: clause.id,
        ruleId: rule.id,
        classification: 'compliant',
        matchedTier: 'preferred',
        matchedLabel: preferred.label,
        similarity: preferred.score,
        clauseQuote: preferred.span,
        clauseText: clause.text,
        reason: `matches preferred standard${preferred.label ? ` (${preferred.label})` : ''}`,
        routedTo: null,
      },
    };
  }

  const matchedFb = fallbacks.find((f) => f.score >= th.fallback && f.numericMatch) ?? null;
  if (matchedFb) {
    const minTier = rule.escalation?.minFallbackTier ?? Infinity;
    const needsEscalation = rule.escalation !== undefined && Number(matchedFb.tier) >= minTier;
    return {
      row: {
        clauseId: clause.id,
        ruleId: rule.id,
        classification: 'deviates',
        matchedTier: matchedFb.tier as number,
        matchedLabel: matchedFb.label,
        similarity: matchedFb.score,
        clauseQuote: matchedFb.span,
        clauseText: clause.text,
        reason: `matches fallback tier ${matchedFb.tier}${matchedFb.label ? ` (${matchedFb.label})` : ''}, not the preferred standard`,
        routedTo: needsEscalation ? rule.escalation!.approver : '__DEFAULT__',
      },
    };
  }

  // 3. beyond playbook — includes skeleton matches whose numbers differ
  const numericNote =
    preferred.score >= th.preferred && !preferred.numericMatch
      ? ` ${preferred.numericDetail}`
      : fallbacks.some((f) => f.score >= th.fallback && !f.numericMatch)
        ? ` ${fallbacks.find((f) => f.score >= th.fallback && !f.numericMatch)!.numericDetail}`
        : '';
  return {
    row: {
      clauseId: clause.id,
      ruleId: rule.id,
      classification: 'deviates',
      matchedTier: null,
      matchedLabel: null,
      similarity: Math.max(preferred.score, bestFb?.score ?? 0),
      clauseQuote: null,
      clauseText: clause.text,
      reason: `no playbook tier matched: clause is beyond the playbook (neither preferred nor any fallback).${numericNote}`,
      routedTo: rule.escalation?.approver ?? '__DEFAULT__',
    },
  };
}

function assignRule(clause: Clause, rules: PlaybookRule[], topicTh: number): { rule: PlaybookRule | null; how: string } {
  if (clause.ruleId !== undefined) {
    const r = rules.find((x) => x.id === clause.ruleId) ?? null;
    return r ? { rule: r, how: 'explicit ruleId' } : { rule: null, how: `ruleId "${clause.ruleId}" not found in playbook` };
  }
  if (!clause.heading) return { rule: null, how: 'no heading and no ruleId — cannot assign a playbook rule deterministically' };
  let best: { rule: PlaybookRule; score: number } | null = null;
  for (const r of rules) {
    const s = similarity(clause.heading, r.topic);
    if (!best || s > best.score) best = { rule: r, score: s };
  }
  if (best && best.score >= topicTh) return { rule: best.rule, how: `heading "${clause.heading}" matched topic "${best.rule.topic}" (similarity ${best.score.toFixed(2)})` };
  return { rule: null, how: `no rule topic matches heading "${clause.heading}" (best similarity ${best ? best.score.toFixed(2) : 'n/a'} < ${topicTh})` };
}

export function buildBoard(input: BoardInput): BoardOutput {
  const th = {
    preferred: input.thresholds?.preferred ?? 0.7,
    fallback: input.thresholds?.fallback ?? 0.7,
    topic: input.thresholds?.topic ?? 0.3,
  };
  const rows: BoardRow[] = input.contract.clauses.map((clause) => {
    const { rule, how } = assignRule(clause, input.playbook.rules, th.topic);
    if (!rule) {
      return {
        clauseId: clause.id,
        heading: clause.heading ?? null,
        ruleId: null,
        classification: 'unclassified',
        matchedTier: null,
        matchedLabel: null,
        similarity: 0,
        clauseQuote: null,
        clauseText: clause.text,
        reason: how,
        routedTo: input.playbook.defaultApprover,
      };
    }
    const { row } = classifyClause(clause, rule, th);
    return {
      ...row,
      heading: clause.heading ?? null,
      routedTo: row.routedTo === '__DEFAULT__' ? input.playbook.defaultApprover : row.routedTo,
    };
  });

  const count = (c: Classification) => rows.filter((r) => r.classification === c).length;
  return {
    contractName: input.contract.name,
    playbookId: input.playbook.playbookId,
    summary: { compliant: count('compliant'), deviates: count('deviates'), dealBreaker: count('deal_breaker'), unclassified: count('unclassified') },
    rows,
  };
}

/** Markdown board — deterministic rendering. */
export function renderBoard(board: BoardOutput): string {
  const lines: string[] = [];
  lines.push(`# Playbook deviation board — ${board.contractName}`);
  lines.push('');
  lines.push(`Playbook: ${board.playbookId}`);
  lines.push('');
  const s = board.summary;
  lines.push(`**${board.rows.length} clauses:** ${s.compliant} compliant · ${s.deviates} deviate · ${s.dealBreaker} deal-breaker · ${s.unclassified} unclassified`);
  lines.push('');
  lines.push('| Clause | Rule | Classification | Matched tier | Similarity | Routed to |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of board.rows) {
    lines.push(
      `| ${r.clauseId}${r.heading ? ` (${r.heading})` : ''} | ${r.ruleId ?? '—'} | ${r.classification} | ${r.matchedTier ?? '—'} | ${r.similarity.toFixed(2)} | ${r.routedTo ?? '—'} |`,
    );
  }
  lines.push('');
  for (const r of board.rows) {
    if (r.classification === 'compliant') continue;
    lines.push(`## ${r.clauseId} — ${r.classification}${r.matchedTier !== null ? ` (tier ${r.matchedTier})` : ''}`);
    lines.push('');
    lines.push(`> ${r.clauseQuote ? r.clauseQuote.text.replace(/\n/g, ' ') : r.clauseText.replace(/\n/g, ' ')}`);
    lines.push('');
    lines.push(r.reason + '.');
    if (r.routedTo) lines.push(`Routed to: **${r.routedTo}**.`);
    lines.push('');
  }
  return lines.join('\n');
}
