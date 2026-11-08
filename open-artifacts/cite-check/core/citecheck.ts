/**
 * cite-check core — deterministic quote verification against source documents.
 * NO LLM: every classification is reproducible from the inputs alone.
 *
 * Classification ladder (first match wins):
 *   exact       — quote appears verbatim (whitespace-trimmed) in the source
 *   normalized  — near-verbatim: same tokens modulo case/punctuation (score ≥ 0.95)
 *   fuzzy       — best window similarity ≥ fuzzyThreshold (default 0.7) and coverage ≥ 0.6
 *   not_found   — everything below the fuzzy threshold
 *
 * Guards (deterministic, never silent):
 *   number guard   — an altered numeric token caps the class at fuzzy and is noted
 *   insert guard   — tokens present in the quote but absent from the located span
 *                    are noted and cap the class at fuzzy (a quote must not add words)
 *   negation guard — an inserted or dropped negator ("not", "never", …) flips
 *                    meaning: divergence is noted and caps the class at fuzzy
 *   omission check — tokens dropped from the located span are noted; an explicit
 *                    ellipsis in the quote marks the omission as accepted
 *
 * Every located quote carries a verbatim anchor (source id, segment, char
 * offsets — extended to the end of the quoted sentence for near-verbatim
 * quotes), a machine-checkable token diff (LCS ops), and pinpoint validation.
 */

import { bestWindow, rawContains, tokens, tokenizeWithSpans, numericMismatches, negationDivergence } from './textutil';
import type { Tok, WindowMatch } from './textutil';
import { parsePinpoint, formatPinpoint } from './pinpoint';
import type { Pinpoint } from './pinpoint';
import { alignTokens, diffTokens, formatDiffOps } from './diff';
import type { DiffOp } from './diff';
import { extractQuotes } from './extract';

export interface PageSeg {
  number: number;
  text: string;
}
export interface SectionSeg {
  label: string;
  text: string;
}
export interface ParagraphSeg {
  number: number;
  text: string;
}
export interface SourceDoc {
  id: string;
  name: string;
  /** free text body; use pages/sections/paragraphs instead when pinpoints must validate */
  text?: string;
  pages?: PageSeg[];
  sections?: SectionSeg[];
  paragraphs?: ParagraphSeg[];
  /** alternative names the reviewed document may cite this source by */
  aliases?: string[];
}
export interface QuoteEntry {
  id: string;
  text: string;
  sourceId: string;
  /** pinpoint as it appears in the reviewed document, e.g. "p. 12", "§ 5.2", "¶ 8", "Tr. 12:4" */
  pinpoint?: string;
  /** optional proposition the quote is offered to support (LLM judges this; core does not) */
  proposition?: string;
}
export interface CiteCheckInput {
  document: { name: string; text?: string };
  sources: SourceDoc[];
  /** omit when document.text is given: quotes are then extracted from it (see core/extract.ts) */
  quotes?: QuoteEntry[];
  /** minimum best-window Jaccard for "fuzzy"; default 0.7 */
  fuzzyThreshold?: number;
}

export type Classification = 'exact' | 'normalized' | 'fuzzy' | 'not_found';

export interface Anchor {
  sourceId: string;
  sourceName: string;
  segmentKind: 'page' | 'section' | 'paragraph' | null;
  segmentLabel: string | null;
  charStart: number;
  charEnd: number;
  verbatim: string;
}
export interface PinpointCheck {
  raw: string;
  parsed: Pinpoint | null;
  status: 'ok' | 'mismatch' | 'unverifiable' | 'unparseable';
  detail: string;
}
export interface QuoteResult {
  id: string;
  classification: Classification;
  similarity: number;
  coverage: number;
  anchor: Anchor | null;
  /** closest window for not_found quotes — evidence, not an endorsement */
  bestCandidate: Anchor | null;
  pinpoint: PinpointCheck | null;
  /** LCS token diff quote ↔ anchor span; null when no anchor */
  diff: DiffOp[] | null;
  /** echoed from the input quote, for the proposition harness */
  proposition?: string;
  notes: string[];
}
export interface CiteCheckReport {
  documentName: string;
  summary: {
    total: number;
    exact: number;
    normalized: number;
    fuzzy: number;
    not_found: number;
    /** located quotes: exact + normalized + fuzzy */
    checked: number;
    /** never reported as "confirmed" */
    couldNotCheck: number;
    unparseablePinpoints: number;
    pinpointIssues: number;
  };
  /** present only when quotes were extracted from document.text */
  extractionWarnings?: string[];
  results: QuoteResult[];
}

interface BuiltDoc {
  doc: SourceDoc;
  fullText: string;
  /** tokens of fullText with char spans */
  toks: Tok[];
  /** char ranges per segment kind */
  segments: Array<{ kind: 'page' | 'section' | 'paragraph'; label: string; start: number; end: number }>;
}

function buildDoc(doc: SourceDoc): BuiltDoc {
  const segments: BuiltDoc['segments'] = [];
  let full = '';
  const append = (text: string): number => {
    if (full.length > 0) full += '\n';
    const start = full.length;
    full += text;
    return start;
  };
  if (doc.text !== undefined) append(doc.text);
  const pageList = (doc.pages ?? []).map((p) => ({ kind: 'page' as const, label: String(p.number), text: p.text }));
  const secList = (doc.sections ?? []).map((p) => ({ kind: 'section' as const, label: p.label, text: p.text }));
  const paraList = (doc.paragraphs ?? []).map((p) => ({ kind: 'paragraph' as const, label: String(p.number), text: p.text }));
  for (const seg of [...pageList, ...secList, ...paraList]) {
    const start = append(seg.text);
    segments.push({ kind: seg.kind, label: seg.label, start, end: full.length });
  }
  return { doc, fullText: full, toks: tokenizeWithSpans(full), segments };
}

function segmentAt(built: BuiltDoc, char: number): BuiltDoc['segments'][number] | null {
  for (const seg of built.segments) {
    if (char >= seg.start && char < seg.end) return seg;
  }
  return null;
}

function anchorFromWindow(built: BuiltDoc, useWin: WindowMatch | null): Anchor | null {
  if (!useWin) return null;
  const seg = segmentAt(built, useWin.start);
  return {
    sourceId: built.doc.id,
    sourceName: built.doc.name,
    segmentKind: seg?.kind ?? null,
    segmentLabel: seg?.label ?? null,
    charStart: useWin.start,
    charEnd: useWin.end,
    verbatim: useWin.verbatim,
  };
}

/**
 * Near-verbatim anchor: LCS-align the quote against the segment containing the
 * best window, then extend the span to the end of that sentence, so dropped
 * tail tokens ("... any exception" ⊂ "... any exception on the document.")
 * stay inside the anchor and surface in the diff instead of being trimmed away.
 */
function alignedAnchor(built: BuiltDoc, quoteToks: Tok[], win: WindowMatch | null): { anchor: Anchor | null; diff: DiffOp[] | null } {
  if (!win) return { anchor: null, diff: null };
  const seg = segmentAt(built, win.start);
  const regionEnd = seg ? seg.end : built.fullText.length;
  // region starts at the best window (never before it) so early duplicate
  // tokens from a preceding sentence cannot capture the alignment
  const wsIdx = built.toks.findIndex((t) => t.start >= win.start);
  const regionToks = wsIdx < 0 ? [] : built.toks.filter((t, idx) => idx >= wsIdx && t.end <= regionEnd);
  const pairs = alignTokens(quoteToks, regionToks);
  if (pairs.length === 0) {
    const fallback = anchorFromWindow(built, win);
    return { anchor: fallback, diff: fallback ? diffTokens(quoteToks, tokenizeWithSpans(fallback.verbatim)) : null };
  }
  const first = regionToks[pairs[0].s];
  const lastIdx = pairs[pairs.length - 1].s;
  let endIdx = lastIdx;
  for (let j = lastIdx + 1; j < regionToks.length && j <= lastIdx + 30; j++) {
    const gap = built.fullText.slice(regionToks[j - 1].end, regionToks[j].start);
    if (/[.!?\n]/.test(gap)) break; // sentence (or line) already ended
    endIdx = j;
  }
  const endTok = regionToks[endIdx];
  const anchorSeg = segmentAt(built, first.start);
  const anchor: Anchor = {
    sourceId: built.doc.id,
    sourceName: built.doc.name,
    segmentKind: anchorSeg?.kind ?? null,
    segmentLabel: anchorSeg?.label ?? null,
    charStart: first.start,
    charEnd: endTok.end,
    verbatim: built.fullText.slice(first.start, endTok.end),
  };
  return { anchor, diff: diffTokens(quoteToks, tokenizeWithSpans(anchor.verbatim)) };
}

function segmentKindOf(p: Pinpoint): 'page' | 'section' | 'paragraph' | null {
  if (p.kind === 'page' || p.kind === 'page-line') return 'page';
  if (p.kind === 'section') return 'section';
  if (p.kind === 'paragraph') return 'paragraph';
  return null; // footnote / article / clause — not modeled
}

function checkPinpoint(quote: QuoteEntry, anchor: Anchor | null, built: BuiltDoc | null): PinpointCheck | null {
  if (quote.pinpoint === undefined) return null;
  const parsed = parsePinpoint(quote.pinpoint);
  if (parsed === null) {
    return { raw: quote.pinpoint, parsed: null, status: 'unparseable', detail: 'pinpoint syntax not recognized' };
  }
  const kindWord = segmentKindOf(parsed);
  if (kindWord === null) {
    return {
      raw: quote.pinpoint,
      parsed,
      status: 'unverifiable',
      detail: `core does not model ${parsed.kind} segments, so the pinpoint cannot be validated`,
    };
  }
  if (anchor === null || anchor.segmentKind === null) {
    if (built === null) {
      return { raw: quote.pinpoint, parsed, status: 'unverifiable', detail: 'source not provided, so the pinpoint cannot be validated' };
    }
    if (!built.segments.some((s) => s.kind === kindWord)) {
      return {
        raw: quote.pinpoint,
        parsed,
        status: 'unverifiable',
        detail: `source does not declare ${kindWord} segments, so the pinpoint cannot be validated`,
      };
    }
    if (anchor === null) {
      return { raw: quote.pinpoint, parsed, status: 'unverifiable', detail: 'quote not located in the source, so the pinpoint cannot be validated' };
    }
    return {
      raw: quote.pinpoint,
      parsed,
      status: 'unverifiable',
      detail: `the quote is not located in a segmented part of the source, so the ${kindWord} pinpoint cannot be validated`,
    };
  }
  if (parsed.kind !== anchor.segmentKind && parsed.kind !== 'page-line') {
    return {
      raw: quote.pinpoint,
      parsed,
      status: 'unverifiable',
      detail: `the quote is located in a ${anchor.segmentKind} segment, so the ${kindWord} pinpoint cannot be validated`,
    };
  }
  if (parsed.kind === 'page-line') {
    if (anchor.segmentKind !== 'page' || built === null) {
      return {
        raw: quote.pinpoint,
        parsed,
        status: 'unverifiable',
        detail: 'the quote is not located in a page segment, so the page:line pinpoint cannot be validated',
      };
    }
    const anchorPage = Number(anchor.segmentLabel);
    const pageFrom = parsed.page;
    const pageTo = parsed.pageTo ?? parsed.page;
    if (anchorPage < pageFrom || anchorPage > pageTo) {
      return {
        raw: quote.pinpoint,
        parsed,
        status: 'mismatch',
        detail: `pinpoint says ${formatPinpoint(parsed)} but the quote is located on page ${anchorPage}`,
      };
    }
    const seg = segmentAt(built, anchor.charStart);
    if (!seg) {
      return { raw: quote.pinpoint, parsed, status: 'unverifiable', detail: 'quote not located in the source, so the pinpoint cannot be validated' };
    }
    const pageText = built.fullText.slice(seg.start, seg.end);
    const lineTo = parsed.lineTo ?? parsed.lineFrom;
    if (!pageText.includes('\n')) {
      return {
        raw: quote.pinpoint,
        parsed,
        status: 'unverifiable',
        detail: `page ${anchorPage} is not line-segmented, so line ${parsed.lineFrom} cannot be validated`,
      };
    }
    const line = pageText.slice(0, anchor.charStart - seg.start).split('\n').length;
    const ok = line >= parsed.lineFrom && line <= lineTo;
    return {
      raw: quote.pinpoint,
      parsed,
      status: ok ? 'ok' : 'mismatch',
      detail: ok
        ? `quote is located on page ${anchorPage} line ${line}`
        : `pinpoint says ${formatPinpoint(parsed)} but the quote is located on page ${anchorPage} line ${line}`,
    };
  }
  if (parsed.kind === 'page' && anchor.segmentKind === 'page') {
    const citedFrom = parsed.from;
    const citedTo = parsed.to ?? parsed.from;
    const anchorPage = Number(anchor.segmentLabel);
    const ok = anchorPage >= citedFrom && anchorPage <= citedTo;
    return {
      raw: quote.pinpoint,
      parsed,
      status: ok ? 'ok' : 'mismatch',
      detail: ok
        ? `quote is located on ${anchor.segmentLabel}`
        : `pinpoint says ${formatPinpoint(parsed)} but the quote is located on ${anchor.segmentLabel}`,
    };
  }
  if (parsed.kind === 'section' && anchor.segmentKind === 'section') {
    let ok: boolean;
    if (parsed.to === undefined) {
      ok = anchor.segmentLabel === parsed.label;
    } else {
      const fromNum = Number(parsed.label);
      const toNum = Number(parsed.to);
      const aNum = Number(anchor.segmentLabel);
      ok = !Number.isNaN(fromNum) && !Number.isNaN(toNum) && !Number.isNaN(aNum) && aNum >= fromNum && aNum <= toNum;
    }
    return {
      raw: quote.pinpoint,
      parsed,
      status: ok ? 'ok' : 'mismatch',
      detail: ok
        ? `quote is located in § ${anchor.segmentLabel}`
        : `pinpoint says ${formatPinpoint(parsed)} but the quote is located in § ${anchor.segmentLabel}`,
    };
  }
  // paragraph
  const anchorNum = Number(anchor.segmentLabel);
  const ok = parsed.to !== undefined ? anchorNum >= parsed.number && anchorNum <= parsed.to : anchorNum === parsed.number;
  return {
    raw: quote.pinpoint,
    parsed,
    status: ok ? 'ok' : 'mismatch',
    detail: ok
      ? `quote is located in ¶ ${anchor.segmentLabel}`
      : `pinpoint says ${formatPinpoint(parsed)} but the quote is located in ¶ ${anchor.segmentLabel}`,
  };
}

export function runCiteCheck(input: CiteCheckInput): CiteCheckReport {
  const fuzzyThreshold = input.fuzzyThreshold ?? 0.7;
  const byId = new Map<string, BuiltDoc>();
  for (const doc of input.sources) byId.set(doc.id, buildDoc(doc));

  let quoteList: QuoteEntry[];
  let extractionWarnings: string[] | undefined;
  if (input.quotes !== undefined) {
    quoteList = input.quotes;
  } else if (input.document.text !== undefined) {
    const extracted = extractQuotes(input.document.text, input.sources);
    quoteList = extracted.quotes;
    extractionWarnings = extracted.warnings;
  } else {
    quoteList = [];
  }

  const results: QuoteResult[] = quoteList.map((quote) => {
    const notes: string[] = [];
    const built = byId.get(quote.sourceId);
    const base = {
      id: quote.id,
      ...(quote.proposition !== undefined ? { proposition: quote.proposition } : {}),
    };
    if (!built) {
      return {
        ...base,
        classification: 'not_found' as Classification,
        similarity: 0,
        coverage: 0,
        anchor: null,
        pinpoint: checkPinpoint(quote, null, null),
        bestCandidate: null,
        diff: null,
        notes: [`source "${quote.sourceId}" not provided`],
      };
    }

    const quoteToks = tokenizeWithSpans(quote.text);
    const win = bestWindow(built.fullText, quote.text);
    const similarity = win?.score ?? 0;
    const coverage = win?.coverage ?? 0;

    let classification: Classification;
    let anchor: Anchor | null = null;
    let diff: DiffOp[] | null = null;

    if (rawContains(built.fullText, quote.text)) {
      classification = 'exact';
      // the window search can tie on a case/punctuation-drifted look-alike;
      // re-verify byte equality and fall back to the literal indexOf position
      const exactWin = win !== null && win.verbatim === quote.text.trim() ? win : locateRaw(built.fullText, quote.text);
      anchor = anchorFromWindow(built, exactWin);
      if (anchor) diff = diffTokens(quoteToks, tokenizeWithSpans(anchor.verbatim));
    } else if (similarity >= 0.95 && coverage >= 0.95) {
      classification = 'normalized';
      notes.push('matches modulo case/punctuation/whitespace');
      const aligned = alignedAnchor(built, quoteToks, win);
      anchor = aligned.anchor;
      diff = aligned.diff;
      // omission detection: pure deletions from the located span
      const hasEllipsis = /\.\.\.|…/.test(quote.text);
      if (anchor && diff) {
        for (const op of diff) {
          if (op.op !== 'delete') continue;
          // diff spans are relative to anchor.verbatim (the diffed string)
          const omitted = anchor.verbatim.slice(op.sourceSpan.start, op.sourceSpan.end);
          notes.push(hasEllipsis ? `omits "${omitted}" — explicit ellipsis, accepted` : `omits "${omitted}" without an ellipsis`);
        }
        // number guard: altered digits never pass as near-verbatim
        const mism = numericMismatches(
          quoteToks.map((t) => t.norm),
          tokenizeWithSpans(anchor.verbatim).map((t) => t.norm),
        );
        for (const p of mism.paired) notes.push(`quote "${p.quote}" vs source "${p.source}"`);
        for (const q of mism.quoteOnly) notes.push(`quote "${q}" not found in the located source text`);
        for (const s of mism.sourceOnly) notes.push(`source "${s}" appears in the located text but not in the quote`);
        if (mism.paired.length + mism.quoteOnly.length > 0) {
          classification = 'fuzzy';
          notes.push('number alteration caps the classification at fuzzy — requires human review');
        }
        // insert guard: tokens present in the quote but absent from the located span
        let insertCapped = false;
        for (const op of diff) {
          if (op.op !== 'insert') continue;
          notes.push(`inserts "${op.quote.join(' ')}" — absent from the located source text`);
          insertCapped = true;
        }
        if (insertCapped) {
          classification = 'fuzzy';
          notes.push('inserted tokens cap the classification at fuzzy — requires human review');
        }
        // negation guard: an inserted or dropped negator flips meaning
        const neg = negationDivergence(
          quoteToks.map((t) => t.norm),
          tokenizeWithSpans(anchor.verbatim).map((t) => t.norm),
        );
        for (const q of neg.quoteOnly) notes.push(`negation "${q}" in the quote has no counterpart in the located source text — meaning may be flipped`);
        for (const s of neg.sourceOnly) notes.push(`negation "${s}" in the located source text has no counterpart in the quote — meaning may be flipped`);
        if (neg.quoteOnly.length + neg.sourceOnly.length > 0) {
          classification = 'fuzzy';
          notes.push('negation divergence caps the classification at fuzzy — requires human review');
        }
      }
    } else if (similarity >= fuzzyThreshold && coverage >= 0.6) {
      classification = 'fuzzy';
      notes.push('substantial overlap but not verbatim — requires human review');
      anchor = anchorFromWindow(built, win);
      if (anchor) diff = diffTokens(quoteToks, tokenizeWithSpans(anchor.verbatim));
    } else {
      classification = 'not_found';
      anchor = anchorFromWindow(built, win); // kept as bestCandidate evidence below
      if (win) notes.push(`best candidate similarity ${similarity.toFixed(2)} below threshold ${fuzzyThreshold}`);
    }

    const bestCandidate = classification === 'not_found' ? anchor : null;
    if (classification === 'not_found') anchor = null;

    const pinpoint = checkPinpoint(quote, anchor, built);
    if (pinpoint?.status === 'mismatch') notes.push(`PINPOINT ISSUE: ${pinpoint.detail}`);
    if (quote.proposition !== undefined && classification !== 'not_found') {
      notes.push('proposition support is an LLM/human judgment — not evaluated by this core');
    }

    return { ...base, classification, similarity, coverage, anchor, bestCandidate, pinpoint, diff, notes };
  });

  const count = (c: Classification): number => results.filter((r) => r.classification === c).length;
  const summary: CiteCheckReport['summary'] = {
    total: results.length,
    exact: count('exact'),
    normalized: count('normalized'),
    fuzzy: count('fuzzy'),
    not_found: count('not_found'),
    checked: results.length - count('not_found'),
    couldNotCheck: count('not_found'),
    unparseablePinpoints: results.filter((r) => r.pinpoint?.status === 'unparseable').length,
    pinpointIssues: results.filter((r) => r.pinpoint?.status === 'mismatch').length,
  };
  const report: CiteCheckReport = { documentName: input.document.name, summary, results };
  if (extractionWarnings !== undefined) report.extractionWarnings = extractionWarnings;
  return report;
}

/** Anchor for an exactly-contained quote (window search also finds these; kept precise). */
function locateRaw(source: string, quote: string): { score: number; coverage: number; start: number; end: number; verbatim: string } | null {
  const idx = source.indexOf(quote.trim());
  if (idx < 0) return null;
  return { score: 1, coverage: 1, start: idx, end: idx + quote.trim().length, verbatim: source.slice(idx, idx + quote.trim().length) };
}

/** Markdown report — deterministic rendering of a CiteCheckReport. */
export function renderReport(report: CiteCheckReport): string {
  const s = report.summary;
  const lines: string[] = [];
  lines.push(`# Cite check — ${report.documentName}`);
  lines.push('');
  lines.push(
    `**Checked ${s.checked} of ${s.total} quotes:** ${s.exact} exact · ${s.normalized} normalized · ${s.fuzzy} fuzzy · ` +
      `${s.couldNotCheck} not checked (never reported as "confirmed") · ${s.unparseablePinpoints} unparseable pinpoint(s) · ` +
      `${s.pinpointIssues} pinpoint issue(s)`,
  );
  if (report.extractionWarnings !== undefined && report.extractionWarnings.length > 0) {
    lines.push('');
    for (const w of report.extractionWarnings) lines.push(`- extraction: ${w}`);
  }
  lines.push('');
  lines.push('| Quote | Verdict | Similarity | Anchor | Pinpoint |');
  lines.push('|---|---|---|---|---|');
  for (const r of report.results) {
    const anchor = r.anchor
      ? `${r.anchor.sourceName}${r.anchor.segmentLabel !== null ? `, ${r.anchor.segmentKind} ${r.anchor.segmentLabel}` : ''} (chars ${r.anchor.charStart}–${r.anchor.charEnd})`
      : '—';
    const pin = r.pinpoint ? `${r.pinpoint.raw}: ${r.pinpoint.status}` : '—';
    lines.push(`| ${r.id} | ${r.classification} | ${r.similarity.toFixed(2)} | ${anchor} | ${pin} |`);
  }
  lines.push('');
  for (const r of report.results) {
    lines.push(`## ${r.id} — ${r.classification}`);
    lines.push('');
    if (r.anchor) {
      lines.push(`> ${r.anchor.verbatim.replace(/\n/g, ' ')}`);
      lines.push('');
      lines.push(`Anchored at ${r.anchor.sourceName} chars ${r.anchor.charStart}–${r.anchor.charEnd}.`);
    } else {
      lines.push('No locating anchor in the provided sources.');
    }
    const marks = r.diff ? formatDiffOps(r.diff) : '';
    if (marks) lines.push(`Token diff: ${marks}`);
    if (r.pinpoint) lines.push(`Pinpoint: ${r.pinpoint.raw} — ${r.pinpoint.status} (${r.pinpoint.detail}).`);
    for (const n of r.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  return lines.join('\n');
}

// re-export for convenience of downstream tooling
export { tokens };
