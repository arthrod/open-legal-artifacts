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
// Deadline rules (deterministic heuristics — ALL fictional, always [verify])
// ---------------------------------------------------------------------------

/**
 * Deadline phrases as data. SIMPLIFIED FICTION — no jurisdiction rule tables
 * (out of scope, see spec.md). Every extracted deadline carries
 * needsVerification:true; nothing is invented when no rule matches.
 * Each pattern has one capture group = day count.
 * @type {Array<{id: string, label: string, pattern: string, confidence: 'medium'}>}
 */
export const DEADLINE_RULES = [
  { id: 'response-days', label: 'Response due', pattern: 'response\\s+due\\s+within\\s+(\\d+)\\s+days', confidence: 'medium' },
  { id: 'answer-days', label: 'Answer due', pattern: 'answer\\s+due\\s+within\\s+(\\d+)\\s+days', confidence: 'medium' },
  { id: 'opposition-days', label: 'Opposition due', pattern: 'opposition\\s+due\\s+within\\s+(\\d+)\\s+days', confidence: 'medium' },
  { id: 'reply-brief-days', label: 'Reply brief due', pattern: 'reply\\s+brief\\s+due\\s+within\\s+(\\d+)\\s+days', confidence: 'medium' },
];

// ---------------------------------------------------------------------------
// Safe-rule linting (untrusted-text hardening)
// ---------------------------------------------------------------------------

/** Thrown by lintRule/escalate when a rule pattern is unsafe or invalid. */
export class SafeRuleError extends Error {
  constructor(message, rule) {
    super(`${message} (rule: ${JSON.stringify(rule && rule.id !== undefined ? rule.id : rule)})`);
    this.name = 'SafeRuleError';
  }
}

// quantified group whose body itself contains a quantifier, e.g. (a+)+, (?:x{2})?
const NESTED_QUANTIFIER = /\((?:\?:)?[^()+]*[+*{][^()]*\)[*+{?]/;
// alternation inside a quantified group, e.g. (a|b)+
const QUANTIFIED_ALTERNATION = /\((?:\?:)?[^()]*(?:\|[^()]*)+\)[*+{?]/;

/**
 * Lint one escalation/deadline rule before its pattern is compiled and run
 * over untrusted filer text. Heuristic ReDoS screen — not a proof. Throws
 * SafeRuleError on: empty/oversized (>200 chars) pattern, invalid regex,
 * nested quantifiers, alternation inside a quantified group, or more than 4
 * alternation branches. Returns true when the rule passes.
 * @param {{pattern: string}} rule
 * @returns {boolean}
 */
export function lintRule(rule) {
  if (!rule || typeof rule.pattern !== 'string' || rule.pattern.length === 0) {
    throw new SafeRuleError('rule.pattern must be a non-empty string', rule);
  }
  if (rule.pattern.length > 200) {
    throw new SafeRuleError('rule.pattern exceeds 200 characters', rule);
  }
  try {
    new RegExp(rule.pattern, 'i'); // eslint-disable-line no-new
  } catch (e) {
    throw new SafeRuleError(`rule.pattern is not a valid regular expression (${e.message})`, rule);
  }
  if (NESTED_QUANTIFIER.test(rule.pattern)) {
    throw new SafeRuleError('nested quantifier (quantified group containing a quantifier) — ReDoS risk', rule);
  }
  if (QUANTIFIED_ALTERNATION.test(rule.pattern)) {
    throw new SafeRuleError('alternation inside a quantified group — ReDoS risk', rule);
  }
  if ((rule.pattern.match(/\|/g) || []).length > 4) {
    throw new SafeRuleError('more than 4 alternation branches', rule);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Deadline extraction
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse 'YYYY-MM-DD' (first 10 chars) as UTC ms; null when unusable. */
function parseUTCDate(value) {
  const s = typeof value === 'string' ? value.slice(0, 10) : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms : null;
}

/** UTC ms → 'YYYY-MM-DD'. */
function fmtUTCDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Deadline anchor: caller-supplied asOf wins, else the entry's filing date.
 * Documented recipe — the core never reads a clock (see spec.md).
 */
function anchorMs(entry, asOf) {
  return (asOf ? parseUTCDate(asOf) : null) ?? parseUTCDate(entry.date);
}

/**
 * Extract candidate deadlines from one entry's description. Deterministic:
 * each DEADLINE_RULES match yields {date, label, basis, confidence,
 * needsVerification:true}. Blank court → confidence 'low' (never a silent
 * default); a non-empty court keeps the rule tier — the core keeps no court
 * registry (recognizing court names would be a jurisdiction table, out of
 * scope, see spec.md). No matching basis → [] (no deadline is invented).
 *
 * @param {Object} entry
 * @param {{asOf?: string}} [options]  anchor date ('YYYY-MM-DD'); defaults to entry.date
 * @returns {Array<{date: string, label: string, basis: string, confidence: string, needsVerification: boolean}>}
 */
export function extractDeadlines(entry, { asOf } = {}) {
  const anchor = anchorMs(entry, asOf);
  if (anchor === null) return [];
  const court = norm(entry.case && entry.case.court);
  const out = [];
  for (const rule of DEADLINE_RULES) {
    lintRule(rule);
    const m = new RegExp(rule.pattern, 'i').exec(entry.description || '');
    if (!m) continue;
    const days = Number.parseInt(m[1], 10);
    if (!Number.isFinite(days)) continue;
    out.push({
      date: fmtUTCDate(anchor + days * DAY_MS),
      label: rule.label,
      basis: rule.id,
      confidence: court ? rule.confidence : 'low',
      needsVerification: true,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Feed normalization (future CourtListener RECAP hook — pure, no network)
// ---------------------------------------------------------------------------

/**
 * Normalize a `parties` value from a CourtListener RECAP payload into
 * `string[]`. The API returns different shapes across endpoints: a
 * `;`/`,`-separated string (split, trim, drop empties), an array of party
 * names or `{name}` records, or nothing at all → []. Fail-closed: any other
 * shape normalizes to [] instead of throwing.
 * @param {string|Array<string|{name: string}>|undefined} parties
 * @returns {string[]}
 */
export function normalizeParties(parties) {
  if (typeof parties === 'string') {
    return parties.split(/[;,]/).map((s) => s.trim()).filter((s) => s.length > 0);
  }
  if (Array.isArray(parties)) {
    return parties
      .map((p) => (typeof p === 'string' ? p : p && p.name))
      .filter((name) => typeof name === 'string' && name.length > 0);
  }
  return [];
}

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
      parties: normalizeParties(recap.parties || d.parties),
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
  return applyRules(entry, compileRules(rules));
}

/** Lint every rule, then compile its pattern once (fail closed pre-match). */
function compileRules(rules) {
  return rules.map((rule) => {
    lintRule(rule); // fail closed: never compile an unlinted pattern over untrusted text
    return { rule, re: new RegExp(rule.pattern, 'i') };
  });
}

/** Run already-linted, already-compiled rules over one entry. */
function applyRules(entry, compiled) {
  const out = [];
  for (const { rule, re } of compiled) {
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
 * @param {{ escalationRules?: EscalationRule[], asOf?: string, horizonDays?: number }} [options]
 *        escalationRules override the defaults end-to-end (escalatedNew + toMarkdown);
 *        asOf anchors deadline date math (defaults to each entry's filing date);
 *        horizonDays is the fallback deadline horizon (watcher value wins, default 14)
 * @returns {{ wall: Array<{ watcher: Object, newEntries: Array<Object> }>,
 *             escalatedNew: Array<{ watcherId: string, entry: Object, escalations: Object[] }>,
 *             deadlinesNew: Array<{ watcherId: string, entry: Object, deadlines: Object[] }>,
 *             nextSeenStore: { ids: string[], updatedAt: string|null, count: number },
 *             stats: Object }}
 */
export function processFeed(entries, watchers, seenStore = {}, options = {}) {
  const seen = new Set(Array.isArray(seenStore.ids) ? seenStore.ids : []);
  const rules = options.escalationRules || DEFAULT_ESCALATION_RULES;
  let compiled = null; // lint+compile rules once per processFeed, on first use
  const wall = [];
  const escalatedNew = [];
  const deadlinesNew = [];
  let totalNew = 0;
  let totalDeadlines = 0;

  for (const watcher of watchers) {
    const matching = entries.filter((e) => entryMatchesWatcher(e, watcher));
    const fresh = matching.filter((e) => !seen.has(String(e.id)));
    totalNew += fresh.length;
    wall.push({ watcher, newEntries: fresh });
    for (const entry of fresh) {
      const esc = applyRules(entry, (compiled ??= compileRules(rules)));
      if (esc.length) escalatedNew.push({ watcherId: watcher.id, entry, escalations: esc });
      const anchor = anchorMs(entry, options.asOf);
      const dls = extractDeadlines(entry, { asOf: options.asOf });
      if (dls.length) {
        const horizon = watcher.deadlineHorizonDays ?? options.horizonDays ?? 14;
        const flagged = dls.map((d) => {
          const daysUntil = anchor !== null ? (parseUTCDate(d.date) - anchor) / DAY_MS : Infinity;
          return { ...d, withinHorizon: daysUntil >= 0 && daysUntil <= horizon };
        });
        deadlinesNew.push({ watcherId: watcher.id, entry, deadlines: flagged });
        totalDeadlines += flagged.length;
      }
    }
  }

  const nextIds = new Set(seen);
  for (const e of entries) nextIds.add(String(e.id));

  return {
    wall,
    escalatedNew,
    deadlinesNew,
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
      deadlines: totalDeadlines,
    },
  };
}

/**
 * Prune a seen-store snapshot: `keep` ids (the current feed's ids) always
 * survive — even over a smaller cap; remaining capacity is filled from the
 * tail of the existing id list (ids are stored sorted, so the head is the
 * stalest-looking). Deterministic — no clock reads.
 * @param {{ ids: string[], updatedAt?: string|null, count?: number }} store
 * @param {{ keep?: string[]|Set<string>, maxIds?: number }} [options]
 * @returns {{ ids: string[], updatedAt: string|null, count: number }}
 */
export function pruneSeenStore(store, { keep = [], maxIds = 500 } = {}) {
  const ids = Array.isArray(store && store.ids) ? store.ids : [];
  const keepSet = new Set(Array.from(keep, String));
  const retained = [];
  const have = new Set();
  const add = (id) => { if (!have.has(id)) { have.add(id); retained.push(id); } };
  for (const k of keepSet) add(k); // keep ids win, even beyond maxIds
  if (retained.length < maxIds) {
    for (let i = ids.length - 1; i >= 0 && retained.length < maxIds; i--) {
      const id = String(ids[i]);
      if (!keepSet.has(id)) add(id);
    }
  }
  const out = retained.sort();
  return { ids: out, updatedAt: (store && store.updatedAt) ?? null, count: out.length };
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
  // render stored escalations only — no re-derivation, so caller-supplied
  // escalationRules flow through processFeed → toMarkdown unchanged
  const escBy = new Map();
  for (const x of result.escalatedNew || []) escBy.set(`${x.watcherId}|${String(x.entry.id)}`, x.escalations);
  for (const col of result.wall) {
    lines.push(`## ${col.watcher.name} (${col.newEntries.length} new)`);
    if (!col.newEntries.length) { lines.push('_no new matching entries_', ''); continue; }
    for (const e of col.newEntries) {
      const esc = (escBy.get(`${col.watcher.id}|${String(e.id)}`) || [])
        .map((x) => `[${x.level.toUpperCase()}: ${x.label}]`).join(' ');
      lines.push(`- **${e.date}** ${e.case.name} — ${e.description} ${esc}`.trim());
    }
    lines.push('');
  }
  lines.push(`Stats: ${result.stats.entriesInFeed} in feed · ${result.stats.newEntries} new · ${result.stats.escalated} escalated.`);
  lines.push('');
  lines.push('_Feed data is fictional. CourtListener RECAP ingestion is a spec\'d future hook (see spec.md); this core makes no network calls._');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Deadline feed export (iCal) — deterministic deadlines.yaml analog
// ---------------------------------------------------------------------------

/**
 * Render extracted deadlines of a processFeed result as iCal (RFC 5545
 * dialect) text — every VEVENT carries X-NEEDS-VERIFICATION:TRUE. All-day
 * dates only; DTSTAMP is pinned to the entry's filing date so output is
 * replay-identical (the core never reads a clock). Deadlines seen by
 * multiple watchers are emitted once. Lines are not RFC-folded at 75 octets
 * (calendar parsers tolerate long lines; kept simple + deterministic).
 * @param {ReturnType<typeof processFeed>} result
 * @returns {string}
 */
export function toDeadlineFeed(result) {
  const seen = new Set();
  const events = [];
  for (const row of result.deadlinesNew || []) {
    const stamp = (row.entry && row.entry.date) || '1970-01-01';
    for (const d of row.deadlines) {
      const uid = `${String(row.entry.id)}-${d.basis}@docket-watch-wall`;
      if (seen.has(uid)) continue;
      seen.add(uid);
      events.push({ d, uid, stamp });
    }
  }
  events.sort((a, b) => (a.d.date < b.d.date ? -1 : a.d.date > b.d.date ? 1 : (a.uid < b.uid ? -1 : 1)));
  const escText = (s) => String(s).replace(/([,;\\])/g, '\\$1');
  const ymd = (iso) => iso.replaceAll('-', '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//docket-watch-wall//open-legal-artifacts//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const ev of events) {
    const end = fmtUTCDate(parseUTCDate(ev.d.date) + DAY_MS); // DTEND is exclusive
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${ymd(ev.stamp)}T000000Z`,
      `DTSTART;VALUE=DATE:${ymd(ev.d.date)}`,
      `DTEND;VALUE=DATE:${ymd(end)}`,
      `SUMMARY:${escText(`${ev.d.label} [verify]`)}`,
      `DESCRIPTION:${escText(`basis=${ev.d.basis} confidence=${ev.d.confidence} fictional data — verify against the actual docket`)}`,
      'X-NEEDS-VERIFICATION:TRUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
