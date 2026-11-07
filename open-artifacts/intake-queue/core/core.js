/**
 * intake-queue core — deterministic new-matter intake queue:
 *   - dedupe: same-party detection across submissions
 *   - conflict check: party matching against an existing-relationship roster
 *   - urgency triage: deadline proximity + age-of-matter rules
 *   - assign states with guarded transitions, CSV export
 *
 * NO LLM: name normalization, similarity scoring, urgency levels, and
 * states are pure functions of the input. All example entities fictional.
 */

// ---------------------------------------------------- name similarity

const CORP_SUFFIXES = new Set(['inc', 'incorporated', 'llc', 'llp', 'ltd', 'limited', 'co', 'corp', 'corporation', 'company', 'plc', 'pc', 'pa', 'the']);

/** Normalize a party name: lowercase, collapse dotted abbreviations
 *  (L.L.C. → llc), strip punctuation/diacritics, drop corporate suffixes.
 *  Initials are kept (M. Iwata ≠ K. Iwata) — conflict checks need them. */
export function normalizeName(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])\./g, '$1')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !CORP_SUFFIXES.has(t))
    .join(' ');
}

/**
 * Deterministic similarity in [0,1]: token Jaccard with a bonus for
 * containment (one name's tokens fully inside the other).
 */
export function nameSimilarity(a, b) {
  const A = new Set(normalizeName(a).split(' ').filter(Boolean));
  const B = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  if (A.size === B.size && [...A].every((t) => B.has(t))) return 1;
  const inter = [...A].filter((t) => B.has(t)).length;
  const union = new Set([...A, ...B]).size;
  const jaccard = inter / union;
  const contains = [...A].every((t) => B.has(t)) || [...B].every((t) => A.has(t));
  return Math.min(1, Math.round((jaccard + (contains ? 0.25 : 0)) * 100) / 100);
}

// ---------------------------------------------------------- workflow

export const STATES = {
  new: ['duplicate', 'conflict-review', 'urgent', 'assignable'],
  duplicate: [],
  'conflict-review': ['assignable', 'urgent'],
  urgent: ['assigned', 'conflict-review'],
  assignable: ['assigned'],
  assigned: [],
};

/** Guarded state transition for one queue item. */
export function transition(item, to) {
  if (!(to in STATES)) return { ok: false, item, error: `unknown state "${to}"` };
  const allowed = STATES[item.state] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, item, error: `${item.state} → ${to} not allowed (allowed: ${allowed.join(', ') || 'none'})` };
  }
  if (to === 'assigned' && !item.assignedTo) {
    return { ok: false, item, error: 'cannot assign without assignedTo' };
  }
  return { ok: true, item: { ...item, state: to } };
}

// ----------------------------------------------------------- triage

const VALID_ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/**
 * Urgency rules (deterministic, thresholds configurable):
 *   - hard deadline (court date, SOL, response due) ≤ overdueDays past → "overdue"
 *   - deadline within criticalDays (14) → "urgent"
 *   - deadline within soonDays (30) → "deadline-soon"
 *   - matter occurred > staleAgeDays (365) ago → "aged" bump (never lowers)
 *   - otherwise "routine"
 */
export function assessUrgency(sub, asOf, settings) {
  const s = settings ?? {};
  const criticalDays = s.criticalDays ?? 14;
  const soonDays = s.soonDays ?? 30;
  const staleAgeDays = s.staleAgeDays ?? 365;
  const reasons = [];
  let level = 'routine';

  if (sub.deadline && VALID_ISO.test(sub.deadline)) {
    const d = days(asOf, sub.deadline);
    if (d < 0) { level = 'overdue'; reasons.push(`deadline ${sub.deadline} passed ${-d} days ago`); }
    else if (d <= criticalDays) { level = 'urgent'; reasons.push(`deadline ${sub.deadline} in ${d} days (≤ ${criticalDays})`); }
    else if (d <= soonDays) { level = 'deadline-soon'; reasons.push(`deadline ${sub.deadline} in ${d} days (≤ ${soonDays})`); }
  } else if (sub.deadline) {
    reasons.push(`deadline "${sub.deadline}" not valid ISO — urgency unverified`);
  }

  if (sub.occurredOn && VALID_ISO.test(sub.occurredOn) && days(sub.occurredOn, asOf) > staleAgeDays) {
    reasons.push(`matter is ${days(sub.occurredOn, asOf)} days old (> ${staleAgeDays}) — check limitations`);
    if (level === 'routine' || level === 'deadline-soon') level = 'urgent';
  }
  return { level, reasons };
}

/**
 * Process the intake queue.
 *
 * @param {Object} input
 *   { asOf: ISO, submissions: Submission[], roster: RosterEntry[],
 *     settings?: { dedupeThreshold?, conflictThreshold?, ...urgency } }
 * Submission: { id, submittedAt, client: {name}, opposing: {name},
 *              matterType, description?, deadline?, occurredOn? }
 * RosterEntry: { name, role: 'client'|'adverse'|'other', matter }
 */
export function processQueue(input) {
  const asOf = input.asOf;
  if (!VALID_ISO.test(asOf)) throw new Error(`asOf must be ISO date, got "${asOf}"`);
  const st = input.settings ?? {};
  const dedupeThreshold = st.dedupeThreshold ?? 0.85;
  const conflictThreshold = st.conflictThreshold ?? 0.8;
  const roster = input.roster ?? [];

  const seen = []; // { id, client, opposing } of earlier submissions
  const items = input.submissions.map((sub) => {
    const flags = [];

    // dedupe against earlier submissions (same client AND same opposing)
    let duplicateOf = null;
    for (const prev of seen) {
      const cSim = nameSimilarity(prev.client, sub.client.name);
      const oSim = nameSimilarity(prev.opposing, sub.opposing.name);
      if (cSim >= dedupeThreshold && oSim >= dedupeThreshold) {
        duplicateOf = prev.id;
        flags.push(`same parties as ${prev.id} (client ${cSim}, opposing ${oSim})`);
        break;
      }
    }
    seen.push({ id: sub.id, client: sub.client.name, opposing: sub.opposing.name });

    // conflict check: either party matching any roster entry
    const conflicts = [];
    for (const r of roster) {
      for (const [side, party] of [['client', sub.client.name], ['opposing', sub.opposing.name]]) {
        const sim = nameSimilarity(r.name, party);
        if (sim >= conflictThreshold) {
          conflicts.push({ rosterName: r.name, role: r.role, matter: r.matter ?? null, matchedSide: side, score: sim });
        }
      }
    }
    for (const c of conflicts) flags.push(`possible conflict: ${c.rosterName} (${c.role} on ${c.matter ?? 'roster'}) matches ${c.matchedSide} at ${c.score}`);

    const urgency = assessUrgency(sub, asOf, st);

    let state;
    if (duplicateOf) state = 'duplicate';
    else if (conflicts.some((c) => c.role === 'adverse' || c.role === 'client')) state = 'conflict-review';
    else if (urgency.level === 'urgent' || urgency.level === 'overdue') state = 'urgent';
    else state = 'assignable';

    return {
      id: sub.id,
      submittedAt: sub.submittedAt,
      client: sub.client.name,
      opposing: sub.opposing.name,
      matterType: sub.matterType,
      description: sub.description ?? null,
      deadline: sub.deadline ?? null,
      duplicateOf,
      conflicts,
      urgency,
      state,
      assignedTo: null,
      flags,
    };
  });

  const summary = {
    total: items.length,
    byState: tally(items.map((i) => i.state)),
    conflicts: items.filter((i) => i.conflicts.length > 0).length,
    duplicates: items.filter((i) => i.duplicateOf).length,
    urgent: items.filter((i) => ['urgent', 'overdue'].includes(i.urgency.level)).length,
  };
  return { asOf, items, summary, settings: { dedupeThreshold, conflictThreshold } };
}

function tally(values) {
  const t = {};
  for (const v of values) t[v] = (t[v] ?? 0) + 1;
  return t;
}

/** Assign an item to staff (new/conflict-review/urgent/assignable → assigned). */
export function assign(queue, id, staffId) {
  const item = queue.items.find((i) => i.id === id);
  if (!item) return { ok: false, queue, error: `no item "${id}"` };
  item.assignedTo = staffId;
  const r = transition(item, 'assigned');
  if (!r.ok) return { ok: false, queue, error: r.error };
  Object.assign(item, r.item);
  return { ok: true, queue };
}

/** CSV export, one row per submission. */
export function toCSV(queue) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = ['id,submittedAt,client,opposing,matterType,deadline,state,duplicateOf,conflictCount,urgencyLevel,assignedTo,flags'];
  for (const i of queue.items) {
    lines.push([i.id, i.submittedAt, i.client, i.opposing, i.matterType, i.deadline, i.state,
      i.duplicateOf ?? '', i.conflicts.length, i.urgency.level, i.assignedTo ?? '',
      i.flags.join('; ')].map((v) => esc(v ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

/** Deterministic Markdown queue. */
export function renderQueue(q) {
  const L = [];
  L.push(`# Intake queue — as of ${q.asOf}`, '');
  L.push(`Total **${q.summary.total}** · duplicates **${q.summary.duplicates}** · conflicts **${q.summary.conflicts}** · urgent **${q.summary.urgent}** · states ${Object.entries(q.summary.byState).map(([k, v]) => `${k} ${v}`).join(', ')}`, '');
  L.push('| # | Id | Submitted | Client ↔ Opposing | Matter | Deadline | Urgency | State | Notes |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  const rank = { overdue: 0, urgent: 1, 'deadline-soon': 2, routine: 3 };
  const stateRank = { urgent: 0, 'conflict-review': 1, assignable: 2, duplicate: 3, assigned: 4, new: 5 };
  [...q.items]
    .sort((a, b) => stateRank[a.state] - stateRank[b.state] || rank[a.urgency.level] - rank[b.urgency.level] || (a.id < b.id ? -1 : 1))
    .forEach((i, n) => {
      L.push(`| ${n + 1} | ${i.id} | ${i.submittedAt} | ${i.client} ↔ ${i.opposing} | ${i.matterType} | ${i.deadline ?? '—'} | ${i.urgency.level} | ${i.state}${i.assignedTo ? ` → ${i.assignedTo}` : ''} | ${i.flags.join('; ') || '—'} |`);
    });
  L.push('');
  return L.join('\n');
}
