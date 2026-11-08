/**
 * Deterministic extractor — pulls quoted passages + footnote pinpoints from
 * the reviewed document's own text and resolves each footnote to a source by
 * name or alias. Reproducible replacement for LLM extraction (the LLM part of
 * the artifact may still be preferred for messy documents; this never guesses).
 *
 * Recognized grammar (documented in spec.md):
 *   body:    “quoted passage”[1]   or   "quoted passage"[1]
 *   footnote: [1] <source name or alias>[, <pinpoint>][.]
 *
 * Unresolvable footnotes and unmarked quotations become warnings, never
 * fabricated entries.
 */

import type { QuoteEntry, SourceDoc } from './citecheck';

export interface ExtractionResult {
  quotes: QuoteEntry[];
  warnings: string[];
}

const FOOTNOTE_RE = /^\[(\d+)\]\s+(.+)$/;

export function extractQuotes(documentText: string, sources: SourceDoc[]): ExtractionResult {
  const warnings: string[] = [];
  const footnotes = new Map<number, string>();
  const bodyLines: string[] = [];
  for (const line of documentText.split('\n')) {
    const m = line.match(FOOTNOTE_RE);
    if (m) footnotes.set(Number(m[1]), m[2].trim());
    else bodyLines.push(line);
  }
  const bodyText = bodyLines.join('\n');

  // Resolve each footnote to {sourceId, pinpoint?} by longest name/alias match.
  const resolved = new Map<number, { sourceId: string; pinpoint?: string }>();
  for (const [n, noteText] of footnotes) {
    const lower = noteText.toLowerCase();
    let best: { id: string; len: number; end: number } | null = null;
    for (const src of sources) {
      for (const name of [src.name, ...(src.aliases ?? [])]) {
        const idx = lower.indexOf(name.toLowerCase());
        if (idx >= 0 && (best === null || name.length > best.len)) {
          best = { id: src.id, len: name.length, end: idx + name.length };
        }
      }
    }
    if (!best) {
      warnings.push(`footnote ${n}: no matching source for "${noteText}"`);
      continue;
    }
    let rest = noteText.slice(best.end).trim();
    if (rest.startsWith(',')) rest = rest.slice(1).trim();
    if (rest.endsWith('.')) rest = rest.slice(0, -1);
    if (rest.length > 0) resolved.set(n, { sourceId: best.id, pinpoint: rest });
    else resolved.set(n, { sourceId: best.id });
  }

  const quotes: QuoteEntry[] = [];
  const QUOTE_RE = /["“]([^"”“\n]+)["”]\s*\[(\d+)\]/g;
  let qm: RegExpExecArray | null;
  while ((qm = QUOTE_RE.exec(bodyText)) !== null) {
    const text = qm[1].trim();
    const n = Number(qm[2]);
    const r = resolved.get(n);
    if (!r) {
      warnings.push(`footnote ${n}: quoted passage has no resolvable footnote`);
      continue;
    }
    const entry: QuoteEntry = { id: `Q${n}`, text, sourceId: r.sourceId };
    if (r.pinpoint !== undefined) entry.pinpoint = r.pinpoint;
    quotes.push(entry);
  }

  const UNMARKED_RE = /["“]([^"”“\n]{15,})["”](?!\s*\[\d+\])/g;
  let um: RegExpExecArray | null;
  while ((um = UNMARKED_RE.exec(bodyText)) !== null) {
    const t = um[1].trim();
    warnings.push(`unmarked quotation: "${t.length > 40 ? t.slice(0, 40) + '…' : t}"`);
  }

  return { quotes, warnings };
}
