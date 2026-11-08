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
  // decision-layer terminal states (reached only via decide(), never transition())
  accepted: [],
  declined: [],
  escalated: [],
};

// Decision layer: accept / decline / escalate from any open (undecided)
// state. Every decision requires an actor and a reason — no unexplained
// routing, unlike the counterpart's LLM-opaque triage.
const DECISION_ACTIONS = { accept: 'accepted', decline: 'declined', escalate: 'escalated' };
const DECIDABLE_STATES = ['new', 'conflict-review', 'urgent', 'assignable'];

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

    // conflict check: either party matching any roster entry or one of its
    // aliases[] — aliases are first-class candidates; on a score tie the
    // primary roster name wins (an alias only supplements, never overrides)
    const conflicts = [];
    for (const r of roster) {
      const candidates = [{ name: r.name, alias: null }, ...(r.aliases ?? []).map((a) => ({ name: a, alias: a }))];
      for (const [side, party] of [['client', sub.client.name], ['opposing', sub.opposing.name]]) {
        let best = null;
        for (const cand of candidates) {
          const sim = nameSimilarity(cand.name, party);
          if (!best || sim > best.score) best = { score: sim, via: cand.alias };
        }
        if (best && best.score >= conflictThreshold) {
          conflicts.push({
            rosterName: r.name,
            role: r.role,
            matter: r.matter ?? null,
            matchedSide: side,
            score: best.score,
            ...(best.via ? { aliasMatch: true, matchedVia: best.via } : {}),
          });
        }
      }
    }
    for (const c of conflicts) {
      flags.push(`possible conflict: ${c.rosterName} (${c.role} on ${c.matter ?? 'roster'}) matches ${c.matchedSide} at ${c.score}${c.aliasMatch ? ` via alias "${c.matchedVia}"` : ''}`);
    }

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
  const queue = { asOf, items, summary, settings: { dedupeThreshold, conflictThreshold }, audit: [] };
  appendAudit(queue, 'process', 'system', `${items.length} submissions screened (dedupe ≥ ${dedupeThreshold}, conflicts ≥ ${conflictThreshold})`);
  return queue;
}

function tally(values) {
  const t = {};
  for (const v of values) t[v] = (t[v] ?? 0) + 1;
  return t;
}

/** Append one entry to the queue's audit trail (who did what, when). */
function appendAudit(queue, action, actor, detail) {
  queue.audit.push({ seq: queue.audit.length + 1, at: queue.asOf, actor, action, detail });
}

/** Assign an item to staff (new/conflict-review/urgent/assignable → assigned).
 *  Validates the transition on a copy first: a rejected assign leaves the
 *  item untouched and writes no audit entry. */
export function assign(queue, id, staffId) {
  const item = queue.items.find((i) => i.id === id);
  if (!item) return { ok: false, queue, error: `no item "${id}"` };
  const r = transition({ ...item, assignedTo: staffId }, 'assigned');
  if (!r.ok) return { ok: false, queue, error: r.error };
  Object.assign(item, r.item);
  appendAudit(queue, 'assign', staffId, `assigned ${id} to ${staffId}`);
  return { ok: true, queue };
}

/** Record an accept / decline / escalate decision with actor + reason.
 *  Terminal: once accepted/declined/escalated (or assigned/duplicate), no
 *  further decision is possible. */
export function decide(queue, id, action, by, reason) {
  const item = queue.items.find((i) => i.id === id);
  if (!item) return { ok: false, queue, error: `no item "${id}"` };
  if (!(action in DECISION_ACTIONS)) {
    return { ok: false, queue, error: `unknown decision "${action}" (use: ${Object.keys(DECISION_ACTIONS).join(', ')})` };
  }
  if (!by || !String(by).trim()) {
    return { ok: false, queue, error: `decision "${action}" on ${id} requires an actor (by)` };
  }
  if (!reason || !String(reason).trim()) {
    return { ok: false, queue, error: `decision "${action}" on ${id} requires a reason` };
  }
  if (!DECIDABLE_STATES.includes(item.state)) {
    return { ok: false, queue, error: `decision ${action} from ${item.state} not allowed (allowed from: ${DECIDABLE_STATES.join(', ')})` };
  }
  item.state = DECISION_ACTIONS[action];
  item.decision = { action, by, reason: String(reason), at: queue.asOf };
  appendAudit(queue, 'decide', by, `${action} ${id}: ${reason}`);
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
  const stateRank = { urgent: 0, 'conflict-review': 1, assignable: 2, duplicate: 3, assigned: 4, accepted: 5, declined: 6, escalated: 7, new: 8 };
  [...q.items]
    .sort((a, b) => stateRank[a.state] - stateRank[b.state] || rank[a.urgency.level] - rank[b.urgency.level] || (a.id < b.id ? -1 : 1))
    .forEach((i, n) => {
      L.push(`| ${n + 1} | ${i.id} | ${i.submittedAt} | ${i.client} ↔ ${i.opposing} | ${i.matterType} | ${i.deadline ?? '—'} | ${i.urgency.level} | ${i.state}${i.assignedTo ? ` → ${i.assignedTo}` : ''}${i.decision ? ` (${i.decision.action} by ${i.decision.by})` : ''} | ${i.flags.join('; ') || '—'} |`);
    });
  L.push('');
  L.push('## Audit log', '');
  L.push('| # | At | Actor | Action | Detail |');
  L.push('|---|---|---|---|---|');
  for (const a of q.audit ?? []) {
    L.push(`| ${a.seq} | ${a.at} | ${a.actor} | ${a.action} | ${a.detail} |`);
  }
  L.push('');
  return L.join('\n');
}

// ------------------------------------------------------ letter drafts

/** Cite one conflict the way a letter must: roster party, role, matter,
 *  matched side, score — and the alias when the match came via one. */
function citeConflict(c) {
  const base = `${c.rosterName} (${c.role} on ${c.matter ?? 'roster'}) matched the ${c.matchedSide} party`;
  return c.aliasMatch
    ? `${base} "${c.matchedVia}" (alias) with similarity score ${c.score}`
    : `${base} with similarity score ${c.score}`;
}

/**
 * Deterministic letter drafts: kind = 'engagement' | 'declination'.
 * Every line is generated from queue fields — nothing invented, no
 * hallucination possible. Jurisdiction stays a [JURISDICTION] placeholder
 * (UPL-safe: these templates are not legal advice).
 */
export function renderLetter(q, id, kind) {
  const item = q.items.find((i) => i.id === id);
  if (!item) throw new Error(`no item "${id}"`);
  if (kind !== 'engagement' && kind !== 'declination') {
    throw new Error(`unknown letter kind "${kind}" (use: engagement, declination)`);
  }
  const L = [];
  L.push('[FIRM LETTERHEAD]', '');
  L.push(`Date: ${q.asOf}`, '');
  L.push(`${item.client}`);
  L.push(`Re: ${kind === 'engagement' ? 'Proposed engagement' : 'Your inquiry'} — ${item.matterType} (intake ${item.id})`, '');
  L.push(`Dear ${item.client}:`, '');
  if (kind === 'engagement') {
    L.push(`Thank you for contacting [FIRM NAME] about the matter above. We are pleased to confirm that [FIRM NAME] will consider representing you in this matter, subject to the terms below.`);
    if (item.conflicts.length === 0) {
      L.push('', `Conflict screening: our roster check found no roster match at or above the ${q.settings.conflictThreshold} conflict threshold for either party (intake ${item.id}, screened ${q.asOf}).`);
    } else {
      L.push('', `Conflict screening: our roster check found ${item.conflicts.length} possible match(es) that must be resolved before opening the matter:`);
      for (const c of item.conflicts) L.push(`- ${citeConflict(c)}`);
    }
    L.push('', `Scope: ${item.matterType}.${item.deadline ? ` The intake records a possible deadline of ${item.deadline} [verify].` : ''} Scope of services, fees, and the governing law of [JURISDICTION] [verify] will be set out in a signed engagement agreement.`);
    L.push('', 'This draft is a template generated from intake data; it is not legal advice and creates no attorney-client relationship until the engagement agreement is signed.');
  } else {
    const c = item.conflicts.find((x) => x.role === 'adverse' || x.role === 'client') ?? item.conflicts[0] ?? null;
    L.push(`Thank you for contacting [FIRM NAME] about the matter above. After our conflict-screening review, we are unable to accept this engagement.`);
    L.push('', c ? `Our records show that ${citeConflict(c)}. Because of that relationship, we cannot represent you in this matter.` : `Our screening review did not identify a matter we can accept; the decision record below states the reason.`);
    if (item.decision) L.push('', `Decision record: ${item.decision.action} by ${item.decision.by} on ${item.decision.at} — "${item.decision.reason}".`);
    L.push('', `Deadlines can pass quickly: the intake records ${item.deadline ? `a possible deadline of ${item.deadline} [verify]` : 'no deadline'}. Please consult another attorney promptly; the [JURISDICTION] bar association [verify] maintains a lawyer referral service.`);
    L.push('', 'This letter is not legal advice and does not create an attorney-client relationship.');
  }
  L.push('', 'Sincerely,', '[FIRM NAME]');
  return L.join('\n');
}

// ------------------------------------------------------------ ICS

/**
 * RFC 5545 calendar export: one VEVENT per submission with a valid ISO
 * deadline. CRLF line endings, escaped text (\\, \\; \\n), folding at
 * 75 octets per line (multibyte characters counted as their UTF-8 size).
 */
export function toICS(q) {
  const escIcs = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const cpOctets = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);
  const fold = (line) => {
    const out = [];
    let cur = '';
    let curOct = 0;
    for (const ch of line) {
      const chOct = cpOctets(ch.codePointAt(0));
      if (curOct + chOct > 75) { // RFC 5545 3.1: ≤75 octets per line
        out.push(cur);
        cur = ' ';
        curOct = 1;
      }
      cur += ch;
      curOct += chOct;
    }
    out.push(cur);
    return out;
  };
  const stamp = `${q.asOf.replace(/-/g, '')}T000000Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//intake-queue//open-legal-artifacts//EN', 'CALSCALE:GREGORIAN'];
  for (const i of q.items) {
    if (!i.deadline || !VALID_ISO.test(i.deadline)) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${i.id}@intake-queue`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${i.deadline.replace(/-/g, '')}`,
      `SUMMARY:${escIcs(`Intake ${i.id}: ${i.client} v. ${i.opposing}`)}`,
      `DESCRIPTION:${escIcs(`${i.matterType} — deadline. State: ${i.state}.`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}

// --------------------------------------------------- ingest verifier

/**
 * Verify an LLM extraction against the raw source text before it enters
 * the queue: every extracted party name must appear VERBATIM in the
 * source (enforces the spec's "copy names verbatim" prompt rule).
 * Non-verbatim names flag the submission `unverified-extraction` and a
 * human must re-extract; null names are simply "nothing extracted".
 */
export function ingestSubmission(extracted, sourceText) {
  const source = String(sourceText ?? '');
  const submission = {
    id: extracted.id,
    submittedAt: extracted.submittedAt,
    client: { name: extracted.client?.name ?? null },
    opposing: { name: extracted.opposing?.name ?? null },
    matterType: extracted.matterType ?? null,
    description: extracted.description ?? null,
    deadline: extracted.deadline ?? null,
    occurredOn: extracted.occurredOn ?? null,
    flags: [],
  };
  const issues = [];
  for (const side of ['client', 'opposing']) {
    const name = submission[side].name;
    // verbatim = appears in the source delimited by non-letter/non-digit
    // characters on both sides (any script), so a truncated "Sable
    // Insurance Co" inside "Sable Insurance Company" — or a name glued
    // to another word ("XRidgeline…", "…CompanyX") — does NOT count as
    // copied verbatim
    const verbatim = name != null && new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(source);
    if (name != null && !verbatim) {
      issues.push(`${side} name "${name}" not found verbatim in source text — extraction unverified`);
      if (!submission.flags.includes('unverified-extraction')) submission.flags.push('unverified-extraction');
    }
  }
  return { ok: issues.length === 0, submission, issues };
}
