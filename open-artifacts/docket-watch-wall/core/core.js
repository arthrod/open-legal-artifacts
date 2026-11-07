/**
 * docket-watch-wall — deterministic core.
 *
 * Filters a JSON feed of docket entries through judge / party / practice-area
 * watchers, diffs new entries against a seen-store, and applies escalation
 * rules — all offline. NO live API: the CourtListener RECAP integration is a
 * spec'd future hook (see spec.md + fromRecapPayload normalizer below).
 *
 * Plain-JavaScript ES module, zero dependencies, browser + Node compatible.
 * ALL DATA IS FICTIONAL. Not legal advice.
 */

// ---------------------------------------------------------------------------
// Escalation rules (rules-as-data)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} EscalationRule
 * @property {string} id
 * @property {string} label
 * @property {string} pattern    case-insensitive regex source
 * @property {'urgent'|'important'} level
 */

/** @type {EscalationRule[]} */
export const DEFAULT_ESCALATION_RULES = [
  { id: 'sanctions', label: 'Sanctions motion/order', pattern: 'sanction', level: 'urgent' },
  { id: 'default', label: 'Default / entry of default', pattern: '\\bdefault (judgment|entered|requested)', level: 'urgent' },
  { id: 'show-cause', label: 'Order to show cause', pattern: 'show cause', level: 'urgent' },
  { id: 'dismissal', label: 'Dismissal motion', pattern: 'motion to dismiss', level: 'important' },
  { id: 'injunction', label: 'Injunction motion', pattern: 'injunction', level: 'important' },
  { id: 'contempt', label: 'Contempt', pattern: 'contempt', level: 'urgent' },
  { id: 'hearing-set', label: 'Hearing scheduled', pattern: 'hearing', level: 'important' },
  { id: 'trial-date', label: 'Trial date set', pattern: '\\btrial\\b', level: 'important' },
];

// ---------------------------------------------------------------------------
// Feed normalization (future CourtListener RECAP hook — pure, no network)
// ---------------------------------------------------------------------------

/**
 * Normalize a CourtListener RECAP docket-entry payload (as documented at
 * https://www.courtlistener.com/api/rest/v3/) into the internal entry shape.
 * Pure mapping only — fetching from the API is intentionally NOT implemented
 * here; this is the seam where a scheduled fetcher would plug in.
 *
 * @param {Object} recap  RECAP docket entry payload (see spec.md for fields)
 * @returns {{ id: string, date: string, description: string,
 *             case: { name: string, judge: string|null, parties: string[],
 *                     practiceArea: string|null, court: string } }}
 */
export function fromRecapPayload(recap) {
  const d = recap.docket || {};
  return {
    id: String(recap.id ?? recap.entry_number ?? `${d.case_name}-${recap.entry_number}`),
    date: (recap.date_filed || d.date_filed || '').slice(0, 10),
    description: recap.description || recap.short_description || '',
    case: {
      name: d.case_name || '',
      judge: (d.assigned_to && (d.assigned_to.name_override || d.assigned_to.name)) || null,
      parties: (recap.parties || d.parties || []).map((p) => (typeof p === 'string' ? p : p.name)),
      practiceArea: null, // RECAP has no practice-area field; watchers supply their own taxonomy
      court: d.court && (d.court.short_name || d.court.name) || recap.court || '',
    },
  };
}

// ---------------------------------------------------------------------------
// Matching + diffing + escalation
// ---------------------------------------------------------------------------

const norm = (s) => (s || '').toString().toLowerCase();

function entryMatchesWatcher(entry, watcher) {
  if (watcher.judge && !norm(entry.case.judge).includes(norm(watcher.judge))) return false;
  if (watcher.practiceArea && norm(entry.case.practiceArea) !== norm(watcher.practiceArea)) return false;
  if (watcher.party) {
    const parties = (entry.case.parties || []).map(norm);
    const hit = parties.some((p) => p.includes(norm(watcher.party))) ||
                norm(entry.case.name).includes(norm(watcher.party));
    if (!hit) return false;
  }
  return true;
}

/**
 * Apply escalation rules to one entry. Deterministic: first matching rule
 * per rule id, ordered by rule order given.
 * @param {Object} entry
 * @param {EscalationRule[]} [rules]
 * @returns {Array<{ruleId: string, label: string, level: string, match: string}>}
 */
export function escalate(entry, rules = DEFAULT_ESCALATION_RULES) {
  const out = [];
  const text = norm(entry.description);
  for (const rule of rules) {
    const re = new RegExp(rule.pattern, 'i');
    const m = re.exec(entry.description || '');
    if (m) out.push({ ruleId: rule.id, label: rule.label, level: rule.level, match: m[0] });
  }
  return out;
}

/**
 * Process a feed: for every watcher, return the entries that (a) match its
 * filters and (b) are NOT in the seen-store yet, plus escalation flags and
 * urgent-date warnings. The seen-store is a plain JSON snapshot object —
 * persist it anywhere (file, localStorage, KV).
 *
 * @param {Object[]} entries   feed entries (shape as fromRecapPayload)
 * @param {Object[]} watchers  [{id, name, judge?, party?, practiceArea?, deadlineHorizonDays?}]
 * @param {{ ids?: string[]|Set<string> }} [seenStore]  previously seen entry ids
 * @returns {{ wall: Array<{ watcher: Object, newEntries: Array<Object> }>,
 *             escalatedNew: Array<{ watcherId: string, entry: Object, escalations: Object[] }>,
 *             nextSeenStore: { ids: string[], updatedAt: string|null, count: number },
 *             stats: Object }}
 */
export function processFeed(entries, watchers, seenStore = {}) {
  const seen = new Set(Array.isArray(seenStore.ids) ? seenStore.ids : []);
  const wall = [];
  const escalatedNew = [];
  let totalNew = 0;

  for (const watcher of watchers) {
    const matching = entries.filter((e) => entryMatchesWatcher(e, watcher));
    const fresh = matching.filter((e) => !seen.has(String(e.id)));
    totalNew += fresh.length;
    wall.push({ watcher, newEntries: fresh });
    for (const entry of fresh) {
      const esc = escalate(entry);
      if (esc.length) escalatedNew.push({ watcherId: watcher.id, entry, escalations: esc });
    }
  }

  const nextIds = new Set(seen);
  for (const e of entries) nextIds.add(String(e.id));

  return {
    wall,
    escalatedNew,
    nextSeenStore: {
      ids: [...nextIds].sort(),
      updatedAt: null, // set by the caller's clock when persisting (keeps core deterministic)
      count: nextIds.size,
    },
    stats: {
      entriesInFeed: entries.length,
      watchers: watchers.length,
      newEntries: totalNew,
      escalated: escalatedNew.length,
    },
  };
}

/**
 * Convenience: update the seen-store snapshot after review.
 * @param {ReturnType<typeof processFeed>['nextSeenStore']} nextSeenStore
 * @param {string} isoTimestamp
 */
export function stampSeenStore(nextSeenStore, isoTimestamp) {
  return { ...nextSeenStore, updatedAt: isoTimestamp };
}

// ---------------------------------------------------------------------------
// Wall rendering
// ---------------------------------------------------------------------------

/**
 * Render the wall as markdown (per watcher: new entries, escalations in caps).
 * @param {ReturnType<typeof processFeed>} result
 * @returns {string}
 */
export function toMarkdown(result) {
  const lines = ['# Docket watch wall — new entries since last review', ''];
  for (const col of result.wall) {
    lines.push(`## ${col.watcher.name} (${col.newEntries.length} new)`);
    if (!col.newEntries.length) { lines.push('_no new matching entries_', ''); continue; }
    for (const e of col.newEntries) {
      const esc = escalate(e).map((x) => `[${x.level.toUpperCase()}: ${x.label}]`).join(' ');
      lines.push(`- **${e.date}** ${e.case.name} — ${e.description} ${esc}`.trim());
    }
    lines.push('');
  }
  lines.push(`Stats: ${result.stats.entriesInFeed} in feed · ${result.stats.newEntries} new · ${result.stats.escalated} escalated.`);
  lines.push('');
  lines.push('_Feed data is fictional. CourtListener RECAP ingestion is a spec\'d future hook (see spec.md); this core makes no network calls._');
  return lines.join('\n');
}
