/**
 * fact-chronology core — deterministic timeline construction from dated fact
 * entries. NO LLM: every conflict flag and gap is reproducible from the input.
 *
 * Responsibilities:
 *   - normalize dates at three precisions (day / month / year) and sort
 *   - carry a source anchor (document + quote + pinpoint) for every entry
 *   - flag conflicts inside a topic: date_mismatch (two day-precision facts
 *     disagree on when) and divergent_accounts (texts about one topic are
 *     dissimilar below the account-similarity threshold — a POTENTIAL
 *     conflict for attorney review, not a legal conclusion)
 *   - detect gaps longer than maxGapDays between consecutive day-precision
 *     entries
 *   - keep undated and unparseable-date entries visible instead of dropping them
 *
 * The LLM's job (out of core) is extracting { date, topic, text, source quote }
 * tuples from documents; the core never guesses a date or a topic.
 */

import { similarity } from './textutil';

export interface ChronDoc {
  id: string;
  name: string;
}
export interface FactSource {
  docId: string;
  quote: string;
  pinpoint?: string;
}
export interface FactEntry {
  id: string;
  /** "2024-03-05" | "2024-03" | "2024"; omit for undated */
  date?: string;
  /** how the date appeared in the document, e.g. "on or about March 5, 2024" */
  dateLabel?: string;
  /** conflict-grouping key; facts sharing a topic are compared */
  topic?: string;
  text: string;
  source: FactSource;
}
export interface ChronInput {
  caseName: string;
  documents: ChronDoc[];
  facts: FactEntry[];
  settings?: { maxGapDays?: number; accountSimilarityThreshold?: number };
}

export type Precision = 'day' | 'month' | 'year';
export interface NormalDate {
  raw: string;
  iso: string; // missing parts defaulted to 01 for sorting
  precision: Precision;
}
export interface Anchor {
  docId: string;
  docName: string;
  quote: string;
  pinpoint: string | null;
}
export interface TimelineEntry {
  factId: string;
  date: NormalDate | null;
  dateLabel: string | null;
  topic: string | null;
  text: string;
  anchor: Anchor | null;
}
export interface Conflict {
  topic: string;
  kind: 'date_mismatch' | 'divergent_accounts';
  factIds: [string, string];
  detail: string;
}
export interface Gap {
  fromIso: string;
  toIso: string;
  days: number;
  afterFactId: string;
  beforeFactId: string;
}
export interface ChronOutput {
  caseName: string;
  timeline: TimelineEntry[]; // dated entries, sorted ascending
  undated: TimelineEntry[];
  unparseableDates: Array<{ factId: string; raw: string }>;
  conflicts: Conflict[];
  gaps: Gap[];
  summary: {
    facts: number;
    dated: number;
    undated: number;
    unparseableDates: number;
    conflicts: number;
    gaps: number;
  };
}

const DATE_RE = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;

function parseDate(raw: string): NormalDate | null {
  const m = raw.trim().match(DATE_RE);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (mo !== undefined && (Number(mo) < 1 || Number(mo) > 12)) return null;
  if (d !== undefined && (Number(d) < 1 || Number(d) > 31)) return null;
  const precision: Precision = d !== undefined ? 'day' : mo !== undefined ? 'month' : 'year';
  const iso = `${y}-${mo ?? '01'}-${d ?? '01'}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return { raw: raw.trim(), iso, precision };
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function toEntry(f: FactEntry, docNames: Map<string, string>): TimelineEntry {
  const docName = docNames.get(f.source.docId);
  return {
    factId: f.id,
    date: undefined,
    dateLabel: f.dateLabel ?? null,
    topic: f.topic ?? null,
    text: f.text,
    anchor: docName
      ? { docId: f.source.docId, docName, quote: f.source.quote, pinpoint: f.source.pinpoint ?? null }
      : null,
  } as TimelineEntry;
}

export function buildChronology(input: ChronInput): ChronOutput {
  const maxGapDays = input.settings?.maxGapDays ?? 90;
  const accountTh = input.settings?.accountSimilarityThreshold ?? 0.35;
  const docNames = new Map(input.documents.map((d) => [d.id, d.name]));

  const dated: Array<{ entry: TimelineEntry; date: NormalDate }> = [];
  const undated: TimelineEntry[] = [];
  const unparseableDates: Array<{ factId: string; raw: string }> = [];

  for (const f of input.facts) {
    const entry = toEntry(f, docNames);
    if (f.date === undefined) {
      undated.push(entry);
      continue;
    }
    const parsed = parseDate(f.date);
    if (!parsed) {
      unparseableDates.push({ factId: f.id, raw: f.date });
      undated.push(entry);
      continue;
    }
    entry.date = parsed;
    dated.push({ entry, date: parsed });
  }

  dated.sort((a, b) => (a.date.iso < b.date.iso ? -1 : a.date.iso > b.date.iso ? 1 : a.entry.factId < b.entry.factId ? -1 : 1));
  const timeline = dated.map((d) => d.entry);

  // conflicts within topics
  const conflicts: Conflict[] = [];
  const byTopic = new Map<string, FactEntry[]>();
  for (const f of input.facts) {
    if (!f.topic) continue;
    const list = byTopic.get(f.topic) ?? [];
    list.push(f);
    byTopic.set(f.topic, list);
  }
  for (const [topic, facts] of byTopic) {
    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const a = facts[i];
        const b = facts[j];
        const da = a.date ? parseDate(a.date) : null;
        const db = b.date ? parseDate(b.date) : null;
        if (da && db && da.precision === 'day' && db.precision === 'day' && da.iso !== db.iso) {
          conflicts.push({
            topic,
            kind: 'date_mismatch',
            factIds: [a.id, b.id],
            detail: `sources disagree on the date of "${topic}": ${a.id} says ${da.raw}, ${b.id} says ${db.raw}`,
          });
          continue;
        }
        const sim = similarity(a.text, b.text);
        if (sim < accountTh) {
          conflicts.push({
            topic,
            kind: 'divergent_accounts',
            factIds: [a.id, b.id],
            detail: `accounts of "${topic}" diverge (similarity ${sim.toFixed(2)} < ${accountTh}): "${a.text}" vs "${b.text}"`,
          });
        }
      }
    }
  }

  // gaps between consecutive day-precision entries
  const gaps: Gap[] = [];
  const dayPrec = dated.filter((d) => d.date.precision === 'day');
  for (let i = 1; i < dayPrec.length; i++) {
    const prev = dayPrec[i - 1];
    const cur = dayPrec[i];
    const days = daysBetween(prev.date.iso, cur.date.iso);
    if (days > maxGapDays) {
      gaps.push({ fromIso: prev.date.iso, toIso: cur.date.iso, days, afterFactId: prev.entry.factId, beforeFactId: cur.entry.factId });
    }
  }

  return {
    caseName: input.caseName,
    timeline,
    undated,
    unparseableDates,
    conflicts,
    gaps,
    summary: {
      facts: input.facts.length,
      dated: timeline.length,
      undated: undated.length,
      unparseableDates: unparseableDates.length,
      conflicts: conflicts.length,
      gaps: gaps.length,
    },
  };
}

/** Markdown chronology — deterministic rendering. */
export function renderChronology(out: ChronOutput): string {
  const lines: string[] = [];
  lines.push(`# Fact chronology — ${out.caseName}`);
  lines.push('');
  const s = out.summary;
  lines.push(
    `**${s.facts} facts:** ${s.dated} dated · ${s.undated} undated/unparseable · ${s.conflicts} conflict(s) · ${s.gaps} gap(s)`,
  );
  lines.push('');
  lines.push('## Timeline');
  lines.push('');
  for (const e of out.timeline) {
    const d = e.date!;
    lines.push(`### ${d.raw} (${d.precision})${e.topic ? ` — ${e.topic}` : ''}`);
    lines.push('');
    lines.push(e.text);
    if (e.anchor) {
      lines.push('');
      lines.push(`Source: ${e.anchor.docName}${e.anchor.pinpoint ? `, ${e.anchor.pinpoint}` : ''} — "${e.anchor.quote}"`);
    }
    lines.push('');
  }
  if (out.undated.length > 0) {
    lines.push('## Undated / unparseable entries');
    lines.push('');
    for (const e of out.undated) {
      lines.push(`- **${e.factId}**${e.dateLabel ? ` (${e.dateLabel})` : ''}: ${e.text}${e.anchor ? ` — ${e.anchor.docName}: "${e.anchor.quote}"` : ''}`);
    }
    lines.push('');
  }
  if (out.conflicts.length > 0) {
    lines.push('## Conflicts');
    lines.push('');
    for (const c of out.conflicts) {
      lines.push(`- **${c.kind}** (${c.topic}): ${c.detail}. Facts: ${c.factIds.join(' vs ')}.`);
    }
    lines.push('');
  }
  if (out.gaps.length > 0) {
    lines.push('## Gaps');
    lines.push('');
    for (const g of out.gaps) {
      lines.push(`- ${g.days} days between ${g.fromIso} (after ${g.afterFactId}) and ${g.toIso} (before ${g.beforeFactId}).`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
