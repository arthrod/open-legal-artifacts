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
 * Every located quote carries a verbatim anchor: source id, segment (page /
 * section / paragraph when the source declares them), and char offsets.
 * Pinpoint citations are parsed and, when the source declares comparable
 * segments, validated against the anchor's actual segment.
 */

import { bestWindow, rawContains, tokens } from './textutil';
import { parsePinpoint, formatPinpoint } from './pinpoint';
import type { Pinpoint } from './pinpoint';

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
}
export interface QuoteEntry {
  id: string;
  text: string;
  sourceId: string;
  /** pinpoint as it appears in the reviewed document, e.g. "p. 12", "§ 5.2", "¶ 8" */
  pinpoint?: string;
  /** optional proposition the quote is offered to support (LLM judges this; core does not) */
  proposition?: string;
}
export interface CiteCheckInput {
  document: { name: string };
  sources: SourceDoc[];
  quotes: QuoteEntry[];
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
    pinpointIssues: number;
  };
  results: QuoteResult[];
}

interface BuiltDoc {
  doc: SourceDoc;
  fullText: string;
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
  return { doc, fullText: full, segments };
}

function segmentAt(built: BuiltDoc, char: number): BuiltDoc['segments'][number] | null {
  for (const seg of built.segments) {
    if (char >= seg.start && char < seg.end) return seg;
  }
  return null;
}

function checkPinpoint(quote: QuoteEntry, anchor: Anchor | null): PinpointCheck | null {
  if (quote.pinpoint === undefined) return null;
  const parsed = parsePinpoint(quote.pinpoint);
  if (parsed === null) {
    return { raw: quote.pinpoint, parsed: null, status: 'unparseable', detail: 'pinpoint syntax not recognized' };
  }
  if (parsed.kind !== anchor?.segmentKind || anchor?.segmentKind === null) {
    return {
      raw: quote.pinpoint,
      parsed,
      status: 'unverifiable',
      detail: `source does not declare ${parsed.kind} segments, so the pinpoint cannot be validated`,
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
    const ok = anchor.segmentLabel === parsed.label;
    return {
      raw: quote.pinpoint,
      parsed,
      status: ok ? 'ok' : 'mismatch',
      detail: ok
        ? `quote is located in § ${anchor.segmentLabel}`
        : `pinpoint says § ${parsed.label} but the quote is located in § ${anchor.segmentLabel}`,
    };
  }
  // paragraph
  const ok = Number(anchor.segmentLabel) === parsed.number;
  return {
    raw: quote.pinpoint,
    parsed,
    status: ok ? 'ok' : 'mismatch',
    detail: ok
      ? `quote is located in ¶ ${anchor.segmentLabel}`
      : `pinpoint says ¶ ${parsed.number} but the quote is located in ¶ ${anchor.segmentLabel}`,
  };
}

export function runCiteCheck(input: CiteCheckInput): CiteCheckReport {
  const fuzzyThreshold = input.fuzzyThreshold ?? 0.7;
  const byId = new Map<string, BuiltDoc>();
  for (const doc of input.sources) byId.set(doc.id, buildDoc(doc));

  const results: QuoteResult[] = input.quotes.map((quote) => {
    const notes: string[] = [];
    const built = byId.get(quote.sourceId);
    if (!built) {
      return {
        id: quote.id,
        classification: 'not_found',
        similarity: 0,
        coverage: 0,
        anchor: null,
        pinpoint: checkPinpoint(quote, null),
        bestCandidate: null,
        notes: [`source "${quote.sourceId}" not provided`],
      };
    }

    const win = bestWindow(built.fullText, quote.text);
    const similarity = win?.score ?? 0;
    const coverage = win?.coverage ?? 0;

    let classification: Classification;
    if (rawContains(built.fullText, quote.text)) {
      classification = 'exact';
    } else if (similarity >= 0.95 && coverage >= 0.95) {
      classification = 'normalized';
      notes.push('matches modulo case/punctuation/whitespace');
    } else if (similarity >= fuzzyThreshold && coverage >= 0.6) {
      classification = 'fuzzy';
      notes.push('substantial overlap but not verbatim — requires human review');
    } else {
      classification = 'not_found';
      if (win) notes.push(`best candidate similarity ${similarity.toFixed(2)} below threshold ${fuzzyThreshold}`);
    }

    // Anchor from the verbatim window (even for "exact", so offsets always resolve)
    const useWin = win ?? (rawContains(built.fullText, quote.text) ? locateRaw(built.fullText, quote.text) : null);
    let anchor: Anchor | null = null;
    if (useWin) {
      const seg = segmentAt(built, useWin.start);
      anchor = {
        sourceId: built.doc.id,
        sourceName: built.doc.name,
        segmentKind: seg?.kind ?? null,
        segmentLabel: seg?.label ?? null,
        charStart: useWin.start,
        charEnd: useWin.end,
        verbatim: useWin.verbatim,
      };
    }
    const bestCandidate = classification === 'not_found' ? anchor : null;
    if (classification === 'not_found') anchor = null;

    const pinpoint = checkPinpoint(quote, anchor);
    if (pinpoint?.status === 'mismatch') notes.push(`PINPOINT ISSUE: ${pinpoint.detail}`);
    if (quote.proposition !== undefined && classification !== 'not_found') {
      notes.push('proposition support is an LLM/human judgment — not evaluated by this core');
    }

    return { id: quote.id, classification, similarity, coverage, anchor, bestCandidate, pinpoint, notes };
  });

  const count = (c: Classification): number => results.filter((r) => r.classification === c).length;
  return {
    documentName: input.document.name,
    summary: {
      total: results.length,
      exact: count('exact'),
      normalized: count('normalized'),
      fuzzy: count('fuzzy'),
      not_found: count('not_found'),
      pinpointIssues: results.filter((r) => r.pinpoint?.status === 'mismatch').length,
    },
    results,
  };
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
    `**${s.total} quotes checked:** ${s.exact} exact · ${s.normalized} normalized · ${s.fuzzy} fuzzy · ${s.not_found} not found · ${s.pinpointIssues} pinpoint issue(s)`,
  );
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
    if (r.pinpoint) lines.push(`Pinpoint: ${r.pinpoint.raw} — ${r.pinpoint.status} (${r.pinpoint.detail}).`);
    for (const n of r.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  return lines.join('\n');
}
