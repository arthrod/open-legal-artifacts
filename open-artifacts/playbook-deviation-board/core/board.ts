/**
 * playbook-deviation-board core — deterministic clause classification against
 * a company playbook. NO LLM: same playbook + contract always yields the same
 * board.
 *
 * Classification (evaluated per clause, in order):
 *   deal_breaker — clause triggers an `avoid` rule (verbatim containment of
 *                  the avoid text in any mode, or similarity-match at the
 *                  rule's threshold)
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

import { bestWindow, similarity, numericTokens } from './textutil';
import { redline as makeRedline } from './redline';
import type { Redline } from './redline';

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
  /** which paper this playbook is written from; contract.side must agree */
  side?: 'sales' | 'purchasing';
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
  contract: { name: string; side?: 'sales' | 'purchasing'; clauses: Clause[] };
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
  /** deterministic redline back to the preferred standard (deviates rows) */
  redline?: Redline | null;
}
export interface BoardOutput {
  contractName: string;
  playbookId: string;
  /** non-null when playbook.side and contract.side disagree */
  sideMismatch: string | null;
  /** thresholds actually applied (resolved, as data) */
  thresholds: { preferred: number; fallback: number; topic: number };
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

  // 1. avoid rules first — a deal-breaker is a deal-breaker regardless of other matches.
  // Verbatim fast path: avoid text buried VERBATIM inside a much longer clause
  // dilutes whole-clause similarity below any threshold, so containment is
  // checked first for every mode — a verbatim hit is always a deal-breaker.
  // Near-verbatim (non-exact) triggers buried in a long clause escape whole-text
  // similarity the same way, so similarity mode also scores the best window of
  // the clause against the avoid text and takes the max.
  for (const av of rule.avoid) {
    const verbatimHit = normContains(clause.text, av.text);
    let hit: boolean;
    if (av.mode === 'contains') {
      hit = verbatimHit;
    } else {
      const whole = similarity(clause.text, av.text);
      const win = bestWindow(clause.text, av.text)?.score ?? 0;
      hit = verbatimHit || Math.max(whole, win) >= (av.threshold ?? 0.8);
    }
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
          reason:
            `matches avoid rule${av.id ? ` "${av.id}"` : ''}: ${verbatimHit ? 'contains' : 'similar to'} "${av.text}"` +
            (rule.escalation === undefined
              ? '; no escalation approver set on this rule — routed to the playbook default approver'
              : ''),
          routedTo: approverFor(),
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

/** Per-rule tally over board rows, in ruleId first-appearance order; null ruleId (unclassified) buckets last. */
function rollupRows(rows: BoardRow[]): RuleRollup[] {
  const order: string[] = [];
  const byRule = new Map<string, BoardRow[]>();
  for (const r of rows) {
    const key = r.ruleId ?? '—';
    if (!byRule.has(key)) {
      byRule.set(key, []);
      order.push(key);
    }
    byRule.get(key)!.push(r);
  }
  const grouped = order.filter((k) => k !== '—').map((k) => tally(k, byRule.get(k)!));
  if (byRule.has('—')) grouped.push(tally('—', byRule.get('—')!));
  return grouped;
}

function tally(ruleId: string, rs: BoardRow[]): RuleRollup {
  const compliant = rs.filter((r) => r.classification === 'compliant').length;
  const deviates = rs.filter((r) => r.classification === 'deviates').length;
  const dealBreakers = rs.filter((r) => r.classification === 'deal_breaker').length;
  const unclassified = rs.filter((r) => r.classification === 'unclassified').length;
  return {
    ruleId,
    clauses: rs.length,
    compliant,
    deviates,
    dealBreakers,
    unclassified,
    deviationRate: (deviates + dealBreakers) / rs.length,
  };
}

export function buildBoard(input: BoardInput): BoardOutput {
  const th = {
    preferred: input.thresholds?.preferred ?? 0.7,
    fallback: input.thresholds?.fallback ?? 0.7,
    topic: input.thresholds?.topic ?? 0.3,
  };
  const sideMismatch =
    input.playbook.side !== undefined && input.contract.side !== undefined && input.playbook.side !== input.contract.side
      ? `side mismatch: playbook is written from the ${input.playbook.side} side but the contract is ${input.contract.side}-side paper — classifications may read in the wrong direction`
      : null;
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
        redline: null,
      };
    }
    const { row } = classifyClause(clause, rule, th);
    const full: BoardRow = {
      ...row,
      heading: clause.heading ?? null,
      routedTo: row.routedTo === '__DEFAULT__' ? input.playbook.defaultApprover : row.routedTo,
      redline: row.classification === 'deviates' ? makeRedline({ ...row, heading: clause.heading ?? null }, rule) : null,
    };
    return full;
  });
  const annotated = sideMismatch ? rows.map((r) => ({ ...r, reason: `${r.reason}; ${sideMismatch}` })) : rows;

  const count = (c: Classification) => annotated.filter((r) => r.classification === c).length;
  return {
    contractName: input.contract.name,
    playbookId: input.playbook.playbookId,
    sideMismatch,
    thresholds: th,
    summary: { compliant: count('compliant'), deviates: count('deviates'), dealBreaker: count('deal_breaker'), unclassified: count('unclassified') },
    rows: annotated,
  };
}

/* ---------- portfolio: batch of contracts, one playbook ---------- */

export interface PortfolioInput {
  playbook: Playbook;
  contracts: BoardInput['contract'][];
  thresholds?: BoardInput['thresholds'];
}

export interface RuleRollup {
  ruleId: string;
  clauses: number;
  compliant: number;
  deviates: number;
  dealBreakers: number;
  unclassified: number;
  /** (deviates + dealBreakers) / clauses */
  deviationRate: number;
}

export interface PortfolioOutput {
  playbookId: string;
  contractNames: string[];
  boards: BoardOutput[];
  /** per-rule deviation-frequency rollup across all contracts, ruleId first-appearance order */
  rollup: RuleRollup[];
}

export function buildPortfolio(input: PortfolioInput): PortfolioOutput {
  const boards = input.contracts.map((contract) => buildBoard({ playbook: input.playbook, contract, thresholds: input.thresholds }));
  const rollup = rollupRows(boards.flatMap((b) => b.rows));
  return { playbookId: input.playbook.playbookId, contractNames: boards.map((b) => b.contractName), boards, rollup };
}

export function renderPortfolio(p: PortfolioOutput): string {
  const lines: string[] = [];
  lines.push(`# Playbook portfolio — ${p.playbookId}`);
  lines.push('');
  lines.push(`${p.boards.length} contracts: ${p.contractNames.join(' · ')}`);
  lines.push('');
  lines.push('| Rule | Clauses | Compliant | Deviates | Deal-breakers | Unclassified | Deviation rate |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of p.rollup) {
    lines.push(
      `| ${r.ruleId} | ${r.clauses} | ${r.compliant} | ${r.deviates} | ${r.dealBreakers} | ${r.unclassified} | ${r.deviationRate.toFixed(2)} |`,
    );
  }
  lines.push('');
  for (const b of p.boards) {
    const s = b.summary;
    lines.push(
      `- **${b.contractName}** — ${b.rows.length} clauses: ${s.compliant} compliant · ${s.deviates} deviate · ${s.dealBreaker} deal-breaker · ${s.unclassified} unclassified`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/** Markdown board — deterministic rendering. */
export function renderBoard(board: BoardOutput): string {
  const lines: string[] = [];
  lines.push(`# Playbook deviation board — ${board.contractName}`);
  lines.push('');
  lines.push(`Playbook: ${board.playbookId}`);
  lines.push('');
  if (board.sideMismatch) {
    lines.push(`> ⚠ ${board.sideMismatch}`);
    lines.push('');
  }
  lines.push(
    `Thresholds: preferred ≥ ${board.thresholds.preferred.toFixed(2)} · fallback ≥ ${board.thresholds.fallback.toFixed(2)} · topic ≥ ${board.thresholds.topic.toFixed(2)}`,
  );
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
  lines.push('### Per-rule deviation frequency');
  lines.push('');
  lines.push('| Rule | Clauses | Compliant | Deviates | Deal-breakers | Unclassified | Deviation rate |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of rollupRows(board.rows)) {
    lines.push(
      `| ${r.ruleId} | ${r.clauses} | ${r.compliant} | ${r.deviates} | ${r.dealBreakers} | ${r.unclassified} | ${r.deviationRate.toFixed(2)} |`,
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
    if (r.redline && (r.redline.removals.length > 0 || r.redline.additions.length > 0)) {
      lines.push('');
      lines.push(`Suggested redline to the preferred standard${r.redline.label ? ` (${r.redline.label})` : ''}:`);
      lines.push('');
      lines.push('```diff');
      for (const x of r.redline.removals) lines.push(`- ${x.replace(/\n/g, ' ')}`);
      for (const x of r.redline.additions) lines.push(`+ ${x.replace(/\n/g, ' ')}`);
      lines.push('```');
    }
    if (r.routedTo) lines.push(`Routed to: **${r.routedTo}**.`);
    lines.push('');
  }
  return lines.join('\n');
}
