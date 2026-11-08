/**
 * Decision log + board diff — deterministic amendment tracing.
 *
 * `decide()` freezes human decisions against a byte-stable hash of the board,
 * so a decision log entry can always be checked against the exact board it
 * was made on. `diffBoards()` compares two runs (e.g. draft v1 vs draft v2)
 * into new / resolved / changed rows — no LLM prose, plain row identity.
 */
import type { BoardOutput, BoardRow } from './board';

export type DecisionType = 'approve' | 'reject' | 'revise' | 'escalate';

export interface Decision {
  clauseId: string;
  decision: DecisionType;
  by: string;
  note?: string;
  /** ISO date (YYYY-MM-DD); optional — log stays deterministic without it */
  date?: string;
}

export interface DecisionLog {
  contractName: string;
  playbookId: string;
  /** hash of the exact BoardOutput the decisions were made against */
  boardHash: string;
  decisions: Decision[];
}

/**
 * FNV-1a 32-bit hash of the canonical board JSON — stable within a version.
 * Audit caveat: 32 bits is collision-prone by cryptographic standards; use
 * the hash for quick change detection and keep the frozen `BoardOutput`
 * alongside the decision log as the actual evidence.
 */
export function boardHash(board: BoardOutput): string {
  const s = JSON.stringify(board);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Record decisions against a board. Throws on unknown clauseIds and on
 * duplicate clauseIds (one decision per clause per log).
 */
export function decide(board: BoardOutput, decisions: Decision[]): DecisionLog {
  const known = new Set(board.rows.map((r) => r.clauseId));
  const seen = new Set<string>();
  for (const d of decisions) {
    if (!known.has(d.clauseId)) throw new Error(`decide(): clauseId "${d.clauseId}" is not on the board`);
    if (seen.has(d.clauseId)) throw new Error(`decide(): duplicate decision for clauseId "${d.clauseId}"`);
    seen.add(d.clauseId);
  }
  return {
    contractName: board.contractName,
    playbookId: board.playbookId,
    boardHash: boardHash(board),
    decisions: decisions.map((d) => ({ ...d })),
  };
}

export interface RowChange {
  clauseId: string;
  before: BoardRow;
  after: BoardRow;
  /** field names that differ */
  changes: string[];
}

export interface BoardDiff {
  contractName: string;
  summary: { new: number; resolved: number; changed: number; unchanged: number; dropped: number };
  /** rows present only in `b` (e.g. clauses added in draft v2) */
  newRows: BoardRow[];
  /** rows present only in `a` (e.g. a deal-breaker clause deleted in draft v2) */
  droppedRows: BoardRow[];
  /** rows that were non-compliant in `a` and compliant in `b` */
  resolvedRows: { clauseId: string; before: BoardRow; after: BoardRow }[];
  /** same clause, same run, materially different outcome */
  changedRows: RowChange[];
}

const COMPARED_FIELDS = ['classification', 'matchedTier', 'matchedLabel', 'ruleId', 'routedTo'] as const;

/** Diff two boards of the same contract (row identity = clauseId). */
export function diffBoards(a: BoardOutput, b: BoardOutput): BoardDiff {
  const aById = new Map(a.rows.map((r) => [r.clauseId, r]));
  const bIds = new Set(b.rows.map((r) => r.clauseId));
  const newRows: BoardRow[] = [];
  const droppedRows: BoardRow[] = [];
  const resolvedRows: { clauseId: string; before: BoardRow; after: BoardRow }[] = [];
  const changedRows: RowChange[] = [];
  let unchanged = 0;
  for (const after of b.rows) {
    const before = aById.get(after.clauseId);
    if (!before) {
      newRows.push(after);
      continue;
    }
    if (before.classification !== 'compliant' && after.classification === 'compliant') {
      resolvedRows.push({ clauseId: after.clauseId, before, after });
      continue;
    }
    const changes = COMPARED_FIELDS.filter((f) => before[f] !== after[f]);
    if (changes.length > 0) changedRows.push({ clauseId: after.clauseId, before, after, changes: [...changes] });
    else unchanged++;
  }
  for (const before of a.rows) {
    if (!bIds.has(before.clauseId)) droppedRows.push(before);
  }
  return {
    contractName: b.contractName,
    summary: { new: newRows.length, resolved: resolvedRows.length, changed: changedRows.length, unchanged, dropped: droppedRows.length },
    newRows,
    droppedRows,
    resolvedRows,
    changedRows,
  };
}
