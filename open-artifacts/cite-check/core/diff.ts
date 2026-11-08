/**
 * Deterministic token diff — LCS alignment between quote and source tokens.
 * Produces machine-checkable evidence ops (equal / delete / insert / replace)
 * plus a compact inline mark format for reports. Dependency-free.
 */

import type { Tok } from './textutil';

export type DiffOp =
  | { op: 'equal'; source: string[] }
  | { op: 'delete'; source: string[]; sourceSpan: { start: number; end: number } }
  | { op: 'insert'; quote: string[] }
  | { op: 'replace'; quote: string[]; source: string[]; sourceSpan: { start: number; end: number } };

type Step =
  | { type: 'equal'; q: number; s: number }
  | { type: 'del'; s: number }
  | { type: 'ins'; q: number };

/** Token-level LCS walk (deterministic tie-break: consume source first). */
function lcsWalk(quote: Tok[], source: Tok[]): Step[] {
  const n = quote.length;
  const m = source.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = quote[i].norm === source[j].norm ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const steps: Step[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (quote[i].norm === source[j].norm) {
      steps.push({ type: 'equal', q: i, s: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // skipping quote[i] preserves the LCS (quote-only token → insert)
      steps.push({ type: 'ins', q: i });
      i++;
    } else {
      // skipping source[j] preserves the LCS (source-only token → delete)
      steps.push({ type: 'del', s: j });
      j++;
    }
  }
  while (j < m) steps.push({ type: 'del', s: j++ });
  while (i < n) steps.push({ type: 'ins', q: i++ });
  return steps;
}

/** LCS alignment pairs (quote index ↔ source index), in order. */
export function alignTokens(quote: Tok[], source: Tok[]): Array<{ q: number; s: number }> {
  return lcsWalk(quote, source)
    .filter((st): st is { type: 'equal'; q: number; s: number } => st.type === 'equal')
    .map((st) => ({ q: st.q, s: st.s }));
}

/** Grouped diff ops; consecutive del+ins runs merge into a single replace. */
export function diffTokens(quote: Tok[], source: Tok[]): DiffOp[] {
  const steps = lcsWalk(quote, source);
  const ops: DiffOp[] = [];
  let equalRun: string[] = [];
  let delRun: Tok[] = [];
  let insRun: Tok[] = [];

  const flushEqual = (): void => {
    if (equalRun.length > 0) {
      ops.push({ op: 'equal', source: equalRun });
      equalRun = [];
    }
  };
  const flushChange = (): void => {
    if (delRun.length === 0 && insRun.length === 0) return;
    flushEqual();
    if (delRun.length > 0 && insRun.length > 0) {
      ops.push({
        op: 'replace',
        quote: insRun.map((t) => t.norm),
        source: delRun.map((t) => t.norm),
        sourceSpan: { start: delRun[0].start, end: delRun[delRun.length - 1].end },
      });
    } else if (delRun.length > 0) {
      ops.push({
        op: 'delete',
        source: delRun.map((t) => t.norm),
        sourceSpan: { start: delRun[0].start, end: delRun[delRun.length - 1].end },
      });
    } else {
      ops.push({ op: 'insert', quote: insRun.map((t) => t.norm) });
    }
    delRun = [];
    insRun = [];
  };

  for (const st of steps) {
    if (st.type === 'equal') {
      flushChange();
      equalRun.push(source[st.s].norm);
    } else if (st.type === 'del') {
      delRun.push(source[st.s]);
    } else {
      insRun.push(quote[st.q]);
    }
  }
  flushChange();
  flushEqual();
  return ops;
}

/** Inline marks for non-equal ops, e.g. `del:"on the document" sub:"120"->"90"`. */
export function formatDiffOps(ops: DiffOp[]): string {
  return ops
    .filter((o) => o.op !== 'equal')
    .map((o) => {
      switch (o.op) {
        case 'delete':
          return `del:"${o.source.join(' ')}"`;
        case 'insert':
          return `ins:"${o.quote.join(' ')}"`;
        case 'replace':
          return `sub:"${o.quote.join(' ')}"->"${o.source.join(' ')}"`;
      }
    })
    .join(' ');
}
