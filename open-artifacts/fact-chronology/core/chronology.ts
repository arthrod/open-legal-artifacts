/**
 * fact-chronology core — deterministic timeline construction from dated fact
 * entries. NO LLM: every merge, verification badge, significance tag,
 * conflict flag and gap is reproducible from the input.
 *
 * Responsibilities:
 *   - normalize dates at three precisions (day / month / year) and sort
 *   - carry source anchors (document + quote + pinpoint) for every entry;
 *     when a document supplies its full text, each quote is machine-checked
 *     (verbatim substring -> best-window near match -> unfound)
 *   - de-duplicate: same topic + date-compatible + text similarity >=
 *     mergeThreshold (default 0.6) -> ONE entry citing all sources
 *     (`mergedFrom` preserves the absorbed ids; nothing is ever deleted).
 *     INVARIANT, enforced by a throw: mergeThreshold must be strictly above
 *     accountSimilarityThreshold so a merge can never hide a conflict
 *   - flag conflicts inside a topic: date_mismatch (two day-precision facts
 *     disagree on when) and divergent_accounts (texts about one topic are
 *     dissimilar below the account-similarity threshold — a POTENTIAL
 *     conflict for attorney review, not a legal conclusion)
 *   - detect gaps longer than maxGapDays between consecutive day-precision
 *     entries
 *   - tie facts to the case theory deterministically (key-term hits -> high /
 *     medium / low significance; fractional "borderline" scores get the lower
 *     tag plus [SME VERIFY])
 *   - carry provenance (document | user | unverified) — unverified facts are
 *     never silently presented as sourced; renderer emits [verify]
 *   - carry privilege posture per document (ok | flag | review); flagged
 *     entries stay visible in the working chronology but are excluded from
 *     the statement-of-facts variant
 *   - keep undated and unparseable-date entries visible instead of dropping
 *   - render three variants (working | sof | witness) and diff two versions
 *
 * The LLM's job (out of core) is extracting { date, topic, text, source quote }
 * tuples from documents; the core never guesses a date or a topic.
 */

import { similarity, tokens, rawContains, bestWindow } from './textutil';

export interface ChronDoc {
  id: string;
  name: string;
  /** optional full text; when present, every quote from this doc is machine-checked */
  text?: string;
  /** privilege posture recorded upstream (Step-0 gate); 'flag' excludes entries from the SoF variant */
  priv?: 'ok' | 'flag' | 'review';
}
export interface FactSource {
  docId: string;
  quote: string;
  pinpoint?: string;
  /** provenance: 'document' (default) | 'user' (client/attorney said so) | 'unverified' (model knowledge / web — renders [verify]) */
  kind?: 'document' | 'user' | 'unverified';
}
export interface FactEntry {
  id: string;
  /** "2024-03-05" | "2024-03" | "2024"; omit for undated */
  date?: string;
  /** how the date appeared in the document, e.g. "on or about March 5, 2024" */
  dateLabel?: string;
  /** conflict-grouping key; facts sharing a topic are compared and may be merged */
  topic?: string;
  text: string;
  source: FactSource;
  /** optional attorney-set significance; overrides the deterministic theory tie */
  significance?: 'high' | 'medium' | 'low';
}
export interface Theory {
  name: string;
  /** short keyword phrases; scoring: all tokens present = 1, exactly one missing = 0.5 */
  keyTerms: string[];
}
export interface ChronInput {
  caseName: string;
  documents: ChronDoc[];
  facts: FactEntry[];
  settings?: { maxGapDays?: number; accountSimilarityThreshold?: number; mergeThreshold?: number }; // mergeThreshold must be strictly > accountSimilarityThreshold (enforced)
  /** case theory for the deterministic significance tie */
  theory?: Theory;
  /** Step-0 posture gate (A/B/C), recorded in the header; semantics owned upstream */
  posture?: string;
  /** timeline version; diffChronology bumps it when anything changes */
  version?: number;
}

export type Precision = 'day' | 'month' | 'year';
export interface NormalDate {
  raw: string;
  iso: string; // missing parts defaulted to 01 for sorting
  precision: Precision;
}
export type QuoteStatus = 'verified' | 'approximate' | 'unfound';
export type Provenance = 'document' | 'user' | 'unverified';
export type Significance = 'high' | 'medium' | 'low';
export interface Anchor {
  docId: string;
  docName: string;
  quote: string;
  pinpoint: string | null;
  priv: 'ok' | 'flag' | 'review' | null;
  /** verified: verbatim substring · approximate: best-window >= 0.7 · unfound: neither · null: no doc text to check */
  quoteStatus: QuoteStatus | null;
}
export interface TimelineEntry {
  factId: string;
  date: NormalDate | null;
  dateLabel: string | null;
  topic: string | null;
  text: string;
  /** primary anchor (first source); null when the source doc is unknown */
  anchor: Anchor | null;
  /** all anchors, in input order — more than one after a merge */
  anchors: Anchor[];
  /** ids of facts absorbed into this entry by de-dupe; nothing is deleted */
  mergedFrom: string[];
  /** deterministic theory tie: 🔴 >= 2 key-term points, 🟡 >= 1, ⚪ below; null when no theory given */
  significance: Significance | null;
  /** borderline (fractional) score -> lower tag + [SME VERIFY]; always false for explicit tags */
  smeVerify: boolean;
  provenance: Provenance;
  /** any source document carries priv 'flag' / 'review' */
  privFlagged: boolean;
  privReview: boolean;
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
  version: number;
  posture: string | null;
  theory: Theory | null;
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
    merged: number;
    unfoundQuotes: number;
  };
}
export interface ChronDiff {
  fromVersion: number;
  toVersion: number;
  added: string[];
  removed: string[];
  changed: Array<{ factId: string; fields: string[] }>;
  summary: string;
}
export interface RenderOptions {
  format?: 'working' | 'sof' | 'witness';
}

const DATE_RE = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;
/** best-window score/coverage at or above this counts as an approximate (near-match) quote */
const APPROX_THRESHOLD = 0.7;
const SIGN_EMOJI: Record<Significance, string> = { high: '🔴', medium: '🟡', low: '⚪' };
const PROV_RANK: Record<Provenance, number> = { document: 0, user: 1, unverified: 2 };

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

/** dates agree at the coarser of the two precisions (day vs month compares year-month) */
function datesCompatible(a: NormalDate, b: NormalDate): boolean {
  if (a.precision === 'year' || b.precision === 'year') return a.iso.slice(0, 4) === b.iso.slice(0, 4);
  if (a.precision === 'month' || b.precision === 'month') return a.iso.slice(0, 7) === b.iso.slice(0, 7);
  return a.iso === b.iso;
}

/** machine-check a quote against the document text: verbatim > near-match > unfound */
function checkQuote(docText: string, quote: string): QuoteStatus {
  if (rawContains(docText, quote)) return 'verified';
  const w = bestWindow(docText, quote);
  if (w && w.score >= APPROX_THRESHOLD && w.coverage >= APPROX_THRESHOLD) return 'approximate';
  return 'unfound';
}

/** deterministic key-term score: full hit = 1, one-token-missing hit = 0.5, else 0 */
function keyTermScore(f: FactEntry, keyTerms: string[]): number {
  const present = new Set(tokens(`${f.topic ?? ''} ${f.text}`));
  let score = 0;
  for (const term of keyTerms) {
    const toks = tokens(term);
    if (toks.length === 0) continue;
    const missing = toks.filter((t) => !present.has(t)).length;
    if (missing === 0) score += 1;
    else if (toks.length > 1 && missing === 1) score += 0.5; // partial only for multi-token terms
  }
  return score;
}

function significanceFor(f: FactEntry, theory: Theory | null): { significance: Significance | null; smeVerify: boolean } {
  if (f.significance) return { significance: f.significance, smeVerify: false };
  if (!theory || theory.keyTerms.length === 0) return { significance: null, smeVerify: false };
  const score = keyTermScore(f, theory.keyTerms);
  const significance: Significance = score >= 2 ? 'high' : score >= 1 ? 'medium' : 'low';
  return { significance, smeVerify: !Number.isInteger(score) };
}

export function buildChronology(input: ChronInput): ChronOutput {
  const maxGapDays = input.settings?.maxGapDays ?? 90;
  const accountTh = input.settings?.accountSimilarityThreshold ?? 0.35;
  const mergeTh = input.settings?.mergeThreshold ?? 0.6;
  // spec invariant: a merge must never be able to hide a divergent-accounts
  // conflict (conflicts are computed on representatives only), so refuse
  // settings where the merge threshold does not sit strictly above it
  if (mergeTh <= accountTh) {
    throw new Error(
      `invalid settings: mergeThreshold (${mergeTh}) must be strictly above accountSimilarityThreshold (${accountTh}) — otherwise a merge could hide a divergent-accounts conflict`,
    );
  }
  const docMap = new Map(input.documents.map((d) => [d.id, d]));

  // ---- de-dupe: group near-duplicate facts (same topic + compatible dates + similarity) ----
  interface Rep {
    primary: FactEntry;
    members: FactEntry[]; // primary first, then absorbed facts in input order
    date: NormalDate | null; // primary's parsed date
  }
  const reps: Rep[] = [];
  for (const f of input.facts) {
    const d = f.date !== undefined ? parseDate(f.date) : null;
    let target: Rep | null = null;
    if (f.topic && d) {
      target =
        reps.find(
          (r) =>
            r.primary.topic === f.topic &&
            r.date !== null &&
            datesCompatible(r.date, d) &&
            similarity(r.primary.text, f.text) >= mergeTh,
        ) ?? null;
    }
    if (target) target.members.push(f);
    else reps.push({ primary: f, members: [f], date: d });
  }

  const unparseableDates: Array<{ factId: string; raw: string }> = [];
  for (const f of input.facts) {
    if (f.date !== undefined && !parseDate(f.date)) unparseableDates.push({ factId: f.id, raw: f.date });
  }

  const toEntry = (r: Rep): TimelineEntry => {
    const anchors: Anchor[] = [];
    let provRank = -1;
    for (const m of r.members) {
      const doc = docMap.get(m.source.docId);
      const p: Provenance = m.source.kind ?? 'document';
      provRank = Math.max(provRank, PROV_RANK[p]);
      if (!doc) continue;
      anchors.push({
        docId: doc.id,
        docName: doc.name,
        quote: m.source.quote,
        pinpoint: m.source.pinpoint ?? null,
        priv: doc.priv ?? null,
        quoteStatus: doc.text !== undefined ? checkQuote(doc.text, m.source.quote) : null,
      });
    }
    const sig = significanceFor(r.primary, input.theory ?? null);
    return {
      factId: r.primary.id,
      date: r.date,
      dateLabel: r.primary.dateLabel ?? null,
      topic: r.primary.topic ?? null,
      text: r.primary.text,
      anchor: anchors[0] ?? null,
      anchors,
      mergedFrom: r.members.slice(1).map((m) => m.id),
      significance: sig.significance,
      smeVerify: sig.smeVerify,
      provenance: (Object.keys(PROV_RANK) as Provenance[]).find((k) => PROV_RANK[k] === provRank) ?? 'document',
      privFlagged: anchors.some((a) => a.priv === 'flag'),
      privReview: anchors.some((a) => a.priv === 'review'),
    };
  };

  const dated: Array<{ entry: TimelineEntry; date: NormalDate }> = [];
  const undated: TimelineEntry[] = [];
  for (const r of reps) {
    const entry = toEntry(r);
    if (r.date) dated.push({ entry, date: r.date });
    else undated.push(entry);
  }
  dated.sort((a, b) => (a.date.iso < b.date.iso ? -1 : a.date.iso > b.date.iso ? 1 : a.entry.factId < b.entry.factId ? -1 : 1));
  const timeline = dated.map((d) => d.entry);

  // ---- conflicts between representatives sharing a topic ----
  const conflicts: Conflict[] = [];
  const byTopic = new Map<string, FactEntry[]>();
  for (const r of reps) {
    if (!r.primary.topic) continue;
    const list = byTopic.get(r.primary.topic) ?? [];
    list.push(r.primary);
    byTopic.set(r.primary.topic, list);
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

  // ---- gaps between consecutive day-precision entries ----
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

  const unfoundQuotes = [...timeline, ...undated].reduce(
    (n, e) => n + e.anchors.filter((a) => a.quoteStatus === 'unfound').length,
    0,
  );

  return {
    caseName: input.caseName,
    version: input.version ?? 1,
    posture: input.posture ?? null,
    theory: input.theory ?? null,
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
      merged: input.facts.length - reps.length,
      unfoundQuotes,
    },
  };
}

/** Deterministic diff between two chronology versions (compare by fact id). */
export function diffChronology(prev: ChronOutput, next: ChronOutput): ChronDiff {
  const entriesOf = (o: ChronOutput) => new Map([...o.timeline, ...o.undated].map((e) => [e.factId, e] as const));
  const pm = entriesOf(prev);
  const nm = entriesOf(next);
  // ids absorbed by a merge in `next` are not gone — they live on in mergedFrom
  const absorbedInto = new Map<string, string>();
  for (const e of nm.values()) for (const id of e.mergedFrom) absorbedInto.set(id, e.factId);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ factId: string; fields: string[] }> = [];
  for (const id of [...nm.keys()].sort()) if (!pm.has(id)) added.push(id);
  for (const id of [...pm.keys()].sort()) if (!nm.has(id)) removed.push(id);
  for (const id of [...pm.keys()].sort()) {
    if (!nm.has(id)) continue;
    const a = pm.get(id)!;
    const b = nm.get(id)!;
    const fields: string[] = [];
    if ((a.date?.iso ?? null) !== (b.date?.iso ?? null)) fields.push('date');
    if (a.text !== b.text) fields.push('text');
    if ((a.topic ?? null) !== (b.topic ?? null)) fields.push('topic');
    if (fields.length > 0) changed.push({ factId: id, fields });
  }
  const hasChanges = added.length + removed.length + changed.length > 0;
  const detail = changed.map((c) => `${c.factId}: ${c.fields.join('+')}`).join('; ');
  const label = (id: string) => (absorbedInto.has(id) ? `${id} (absorbed into ${absorbedInto.get(id)})` : id);
  return {
    fromVersion: prev.version,
    toVersion: hasChanges ? prev.version + 1 : prev.version,
    added,
    removed,
    changed,
    summary: `+${added.length} added (${added.join(', ') || 'none'}), -${removed.length} removed (${removed.map(label).join(', ') || 'none'}), ~${changed.length} changed${detail ? ` (${detail})` : ''}`,
  };
}

/* ---------- rendering ---------- */

function entryTags(e: TimelineEntry): string {
  const tags: string[] = [];
  if (e.smeVerify) tags.push('[SME VERIFY]');
  if (e.provenance === 'unverified') tags.push('[verify]');
  return tags.length > 0 ? ` ${tags.join(' ')}` : '';
}

function anchorBadges(a: Anchor): string {
  const parts: string[] = [];
  if (a.priv === 'flag') parts.push('PRIVILEGE FLAG — review before external use');
  else if (a.priv === 'review') parts.push('[priv: review]');
  if (a.quoteStatus === 'unfound') parts.push('⚠ quote not found in source text [verify]');
  else if (a.quoteStatus === 'approximate') parts.push('quote approximate — near-match only');
  return parts.length > 0 ? ` — ${parts.join(' · ')}` : '';
}

function sourceLine(e: TimelineEntry, a: Anchor): string {
  return `Source: ${a.docName}${a.pinpoint ? `, ${a.pinpoint}` : ''} — "${a.quote}"${anchorBadges(a)}`;
}

function sourceBlock(e: TimelineEntry): string[] {
  if (e.anchors.length === 0) return [];
  const lines: string[] = [];
  if (e.anchors.length > 1) {
    lines.push(`Sources (merged from ${e.mergedFrom.join(', ')}):`);
    e.anchors.forEach((a, i) => lines.push(`${i + 1}. ${a.docName}${a.pinpoint ? `, ${a.pinpoint}` : ''} — "${a.quote}"${anchorBadges(a)}`));
  } else {
    lines.push(sourceLine(e, e.anchors[0]));
  }
  return lines;
}

function heading(e: TimelineEntry): string {
  const d = e.date!;
  const sig = e.significance ? ` ${SIGN_EMOJI[e.significance]}` : '';
  return `### ${d.raw} (${d.precision})${e.topic ? ` — ${e.topic}` : ''}${sig}`;
}

/** Markdown chronology — deterministic rendering in three variants. */
export function renderChronology(out: ChronOutput, opts: RenderOptions = {}): string {
  const format = opts.format ?? 'working';
  const lines: string[] = [];
  const s = out.summary;
  const meta: string[] = [`v${out.version}`];
  if (out.posture) meta.push(`Posture ${out.posture}`);

  if (format === 'sof') {
    const visible = out.timeline.filter((e) => !e.privFlagged);
    const flagged = out.timeline.length - visible.length;
    lines.push(`# Statement of facts — ${out.caseName}`);
    lines.push('');
    const excluded: string[] = [];
    if (flagged > 0) excluded.push(`${flagged} privileged-flagged`);
    if (out.undated.length > 0) excluded.push(`${out.undated.length} undated/unparseable`);
    lines.push(`_From working chronology ${meta.join(' · ')}${excluded.length > 0 ? `; excluded ${excluded.join(', ')} entries` : ''}._`);
    lines.push('');
    for (const e of visible) {
      lines.push(heading(e));
      lines.push('');
      lines.push(`${e.text}${entryTags(e)}`);
      lines.push(...(sourceBlock(e).length > 0 ? ['', ...sourceBlock(e)] : []));
      lines.push('');
    }
    return lines.join('\n');
  }

  if (format === 'witness') {
    const visible = [...out.timeline, ...out.undated].filter((e) => !e.privFlagged);
    const flagged = out.timeline.length + out.undated.length - visible.length;
    lines.push(`# Witness preparation timeline — ${out.caseName}`);
    lines.push('');
    lines.push(`_From working chronology ${meta.join(' · ')}${flagged > 0 ? `; excluded ${flagged} privileged-flagged entries` : ''}. Quotes shown verbatim for refresh._`);
    lines.push('');
    for (const e of visible) {
      const when = e.date ? `${e.date.raw} (${e.date.precision})` : e.dateLabel ?? 'undated';
      const sig = e.significance ? ` ${SIGN_EMOJI[e.significance]}` : '';
      lines.push(`### ${when}${e.topic ? ` — ${e.topic}` : ''}${sig}`);
      lines.push('');
      lines.push(`${e.text}${entryTags(e)}`);
      for (const a of e.anchors) {
        lines.push('');
        lines.push(`> "${a.quote}" — ${a.docName}${a.pinpoint ? `, ${a.pinpoint}` : ''}${anchorBadges(a)}`);
      }
      lines.push('');
    }
    if (out.conflicts.length > 0) {
      lines.push('## Impeachment flags (potential conflicts — attorney review)');
      lines.push('');
      for (const c of out.conflicts) {
        lines.push(`- **${c.kind}** (${c.topic}): ${c.detail}. Facts: ${c.factIds.join(' vs ')}. [computed from: ${c.factIds.join(', ')}]`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  // working variant — the full record
  lines.push(`# Fact chronology — ${out.caseName}`);
  lines.push('');
  if (out.theory) {
    lines.push(`Case theory: ${out.theory.name} · significance 🔴 key / 🟡 supporting / ⚪ background`);
  }
  const summaryBits = [
    `**${s.facts} facts:** ${s.dated} dated`,
    s.merged > 0 ? `${s.merged} merged` : '',
    `${s.undated} undated/unparseable`,
    `${s.conflicts} conflict(s)`,
    `${s.gaps} gap(s)`,
    s.unfoundQuotes > 0 ? `${s.unfoundQuotes} unfound quote(s)` : '',
  ].filter(Boolean);
  lines.push(summaryBits.join(' · '));
  lines.push(`Version ${meta.join(' · ')}`);
  lines.push('');
  lines.push('## Timeline');
  lines.push('');
  for (const e of out.timeline) {
    lines.push(heading(e));
    lines.push('');
    lines.push(`${e.text}${entryTags(e)}`);
    const sb = sourceBlock(e);
    if (sb.length > 0) {
      lines.push('');
      lines.push(...sb);
    }
    lines.push('');
  }
  if (out.undated.length > 0) {
    lines.push('## Undated / unparseable entries');
    lines.push('');
    for (const e of out.undated) {
      const src = e.anchors.length > 0 ? ` — ${sourceLine(e, e.anchors[0])}` : '';
      lines.push(`- **${e.factId}**${e.dateLabel ? ` (${e.dateLabel})` : ''}: ${e.text}${entryTags(e)}${src}`);
    }
    lines.push('');
  }
  if (out.conflicts.length > 0) {
    lines.push('## Conflicts');
    lines.push('');
    for (const c of out.conflicts) {
      lines.push(`- **${c.kind}** (${c.topic}): ${c.detail}. Facts: ${c.factIds.join(' vs ')}. [computed from: ${c.factIds.join(', ')}]`);
    }
    lines.push('');
  }
  if (out.gaps.length > 0) {
    lines.push('## Gaps');
    lines.push('');
    for (const g of out.gaps) {
      lines.push(`- ${g.days} days between ${g.fromIso} (after ${g.afterFactId}) and ${g.toIso} (before ${g.beforeFactId}). [computed from: ${g.afterFactId}, ${g.beforeFactId}]`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
