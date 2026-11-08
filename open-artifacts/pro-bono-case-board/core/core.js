/**
 * pro-bono-case-board core — deterministic pro bono case tracker:
 *   - intake → placement → closure workflow states with guarded transitions
 *   - volunteer-skill matching by deterministic tag matching with a score
 *   - stale-case flags (no activity beyond a configurable threshold)
 *   - malpractice-aware deadline severity + ICS calendar export
 *   - tolerant CSV intake parsing (per-row issues, never throws)
 *   - volunteer capacity rollup and per-stage SLA aging
 *   - board diff (regen audit: added / stage-changed / deadline-moved / closed)
 *   - impact rollups over closed cases
 *
 * NO LLM: matching, staleness, transitions, and rollups are pure
 * functions of the input; identical inputs give identical boards.
 * All example entities are fictional.
 */

// ---------------------------------------------------------- workflow

/** Allowed workflow transitions. Guard notes are advisory strings. */
export const WORKFLOW = {
  states: ['intake', 'triage', 'ready', 'placed', 'active', 'closing', 'closed', 'withdrawn'],
  transitions: {
    intake: ['triage', 'withdrawn'],
    triage: ['ready', 'withdrawn'],
    ready: ['placed', 'withdrawn'],
    placed: ['active', 'ready', 'withdrawn'], // placed → ready when placement falls through
    active: ['closing', 'withdrawn'],
    closing: ['closed', 'active'],
    closed: [],
    withdrawn: [],
  },
};

/**
 * Validate + apply a workflow transition.
 * @returns {{ ok: boolean, case_: Object, error?: string }}
 */
export function transition(case_, to) {
  const from = case_.state;
  if (!WORKFLOW.states.includes(to)) {
    return { ok: false, case_, error: `unknown state "${to}"` };
  }
  const allowed = WORKFLOW.transitions[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, case_, error: `transition ${from} → ${to} not allowed (allowed: ${allowed.join(', ') || 'none'})` };
  }
  if (to === 'closed' && !case_.outcome) {
    return { ok: false, case_, error: 'cannot close without an outcome (e.g. favorable-settlement, advice-only)' };
  }
  return { ok: true, case_: { ...case_, state: to } };
}

// ---------------------------------------------------------- matching

/**
 * Deterministic volunteer-match score for a case, 0–100:
 *   required tags matched  → up to 70 pts (proportional)
 *   optional tags matched  → up to 30 pts (proportional)
 * Any unmatched REQUIRED tag caps eligibility: the candidate is returned
 * with `eligible: false` and the missing tags listed (never silently
 * ignored). A case with no required tags scores from optional only.
 *
 * @returns {{ volunteerId, score, eligible, missingRequired[], matched[] }}
 */
export function matchScore(volCase, volunteer) {
  const required = volCase.requiredSkills ?? [];
  const optional = volCase.optionalSkills ?? [];
  const skills = new Set(volunteer.skills ?? []);
  const missingRequired = required.filter((t) => !skills.has(t));
  const matched = [...required, ...optional].filter((t) => skills.has(t));
  const reqScore = required.length ? (required.length - missingRequired.length) / required.length * 70 : 0;
  const optScore = optional.length ? optional.filter((t) => skills.has(t)).length / optional.length * 30 : 0;
  return {
    volunteerId: volunteer.id,
    score: Math.round((reqScore + optScore) * 10) / 10,
    eligible: missingRequired.length === 0,
    missingRequired,
    matched,
  };
}

/**
 * Rank volunteers for a case. Deterministic: eligible first, then score
 * descending, then volunteer id ascending (stable tie-break).
 */
export function rankVolunteers(volCase, volunteers, limit = 5) {
  return volunteers
    .map((v) => matchScore(volCase, v))
    .sort((a, b) =>
      Number(b.eligible) - Number(a.eligible) || b.score - a.score ||
      (a.volunteerId < b.volunteerId ? -1 : a.volunteerId > b.volunteerId ? 1 : 0))
    .slice(0, limit);
}

// ------------------------------------------------------------- board

const VALID_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Default per-stage SLA budgets in days (open states only). */
export const DEFAULT_STAGE_SLA = { intake: 7, triage: 7, ready: 14, placed: 21, active: 90, closing: 21 };

/** Deadlines closer than this many days are "warn". */
const DEADLINE_WARN_DAYS = 7;

function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/**
 * Evaluate one deadline against asOf. Malpractice-aware severity:
 *   critical = overdue court date · warn = overdue (any kind) or due < 7 d.
 */
function evalDeadline(dl, asOf) {
  const valid = VALID_ISO.test(dl.dueDate ?? '');
  const daysTo = valid ? daysBetween(asOf, dl.dueDate) : null;
  const overdue = valid ? daysTo < 0 : false;
  let severity = 'none';
  if (valid) {
    if (overdue && dl.kind === 'court') severity = 'critical';
    else if (overdue || daysTo < DEADLINE_WARN_DAYS) severity = 'warn';
  }
  return { label: dl.label ?? '(unlabeled)', dueDate: dl.dueDate ?? null, kind: dl.kind ?? 'internal',
    valid, daysTo, overdue, severity };
}

/**
 * Build the full board.
 * @param {Object} input
 *   { asOf: ISO, cases: Case[], volunteers: Volunteer[],
 *     settings?: { staleDays?: number, matchLimit?: number } }
 * Case: { id, client (fictional), problem, state, openedDate,
 *         lastActivityDate, requiredSkills?, optionalSkills?,
 *         volunteerId?, outcome?, hours?, closedDate? }
 */
export function buildBoard(input) {
  const asOf = input.asOf;
  if (!VALID_ISO.test(asOf)) throw new Error(`asOf must be ISO date, got "${asOf}"`);
  const staleDays = input.settings?.staleDays ?? 30;
  const matchLimit = input.settings?.matchLimit ?? 5;
  const maxOpen = input.settings?.maxOpenPerVolunteer ?? 5;
  const stageSla = { ...DEFAULT_STAGE_SLA, ...(input.settings?.stageSla ?? {}) };
  const volunteers = input.volunteers ?? [];
  const byId = Object.fromEntries(volunteers.map((v) => [v.id, v]));

  const rows = input.cases.map((c) => {
    const flags = [];
    if (!WORKFLOW.states.includes(c.state)) flags.push(`unknown state "${c.state}"`);
    if (!VALID_ISO.test(c.lastActivityDate ?? '')) flags.push('lastActivityDate missing or not ISO — staleness unverified');
    if (!VALID_ISO.test(c.openedDate ?? '')) flags.push('openedDate missing or not ISO — SLA aging unverified');
    const staleFor = VALID_ISO.test(c.lastActivityDate ?? '') && !['closed', 'withdrawn'].includes(c.state)
      ? daysBetween(c.lastActivityDate, asOf) : null;
    const stale = staleFor != null && staleFor > staleDays;
    if (stale) flags.push(`no activity for ${staleFor} days (> ${staleDays})`);
    if (c.state === 'placed' && !c.volunteerId) flags.push('state is placed but no volunteerId set');
    if (c.volunteerId && !byId[c.volunteerId]) flags.push(`assigned volunteer "${c.volunteerId}" not in roster`);
    if (c.state === 'closed' && !c.outcome) flags.push('closed without outcome');

    const isOpen = !['closed', 'withdrawn'].includes(c.state);

    // deadlines: computed for display everywhere; flagged/counted on open cases only
    const deadlines = (c.deadlines ?? []).map((d) => evalDeadline(d, asOf));
    if (isOpen) {
      for (const d of deadlines) {
        if (!d.valid) flags.push(`deadline "${d.label}" dueDate missing or not ISO: "${d.dueDate}"`);
        else if (d.severity === 'critical') flags.push(`OVERDUE court deadline "${d.label}" (${-d.daysTo} d overdue)`);
        else if (d.overdue) flags.push(`overdue ${d.kind} deadline "${d.label}" (${-d.daysTo} d overdue)`);
        else if (d.severity === 'warn') flags.push(`deadline "${d.label}" due in ${d.daysTo} d (< ${DEADLINE_WARN_DAYS})`);
      }
    }

    // stage SLA aging: days in the workflow approximated by days since openedDate
    // (the input contract carries no state-entry history; approximation documented in spec.md)
    const daysOpen = VALID_ISO.test(c.openedDate ?? '') ? daysBetween(c.openedDate, asOf) : null;
    const slaDays = stageSla[c.state] ?? null;
    const slaBreached = isOpen && slaDays != null && daysOpen != null && daysOpen > slaDays;
    if (slaBreached) flags.push(`in ${c.state} ${daysOpen} d > SLA ${slaDays} d`);

    return {
      id: c.id,
      client: c.client,
      problem: c.problem,
      state: c.state,
      openedDate: c.openedDate,
      lastActivityDate: c.lastActivityDate,
      volunteerId: c.volunteerId ?? null,
      outcome: c.outcome ?? null,
      hours: c.hours ?? 0,
      deadlines,
      stale,
      staleFor,
      daysOpen,
      slaDays,
      slaBreached,
      flags,
      matches: isOpen ? rankVolunteers(c, volunteers, matchLimit) : [],
    };
  });

  // volunteer capacity rollup: grounds placement decisions in actual load
  const byVolunteer = {};
  for (const v of volunteers) {
    byVolunteer[v.id] = { openCases: 0, hours: 0, staleOwned: 0, maxOpen, atCapacity: false };
  }
  for (const r of rows) {
    const slot = r.volunteerId != null ? byVolunteer[r.volunteerId] : undefined;
    if (!slot) continue;
    slot.hours += r.hours || 0;
    if (!['closed', 'withdrawn'].includes(r.state)) {
      slot.openCases += 1;
      if (r.stale) slot.staleOwned += 1;
    }
  }
  for (const slot of Object.values(byVolunteer)) {
    slot.hours = Math.round(slot.hours * 10) / 10;
    slot.atCapacity = slot.openCases > slot.maxOpen;
  }

  // aging buckets over open cases by days since openedDate
  const aging = { '0-7': 0, '8-30': 0, '31-90': 0, '>90': 0 };
  for (const r of rows) {
    if (['closed', 'withdrawn'].includes(r.state) || r.daysOpen == null) continue;
    if (r.daysOpen <= 7) aging['0-7'] += 1;
    else if (r.daysOpen <= 30) aging['8-30'] += 1;
    else if (r.daysOpen <= 90) aging['31-90'] += 1;
    else aging['>90'] += 1;
  }

  const closed = rows.filter((r) => r.state === 'closed');
  const impact = {
    openCases: rows.filter((r) => !['closed', 'withdrawn'].includes(r.state)).length,
    closedCases: closed.length,
    withdrawnCases: rows.filter((r) => r.state === 'withdrawn').length,
    placedCases: rows.filter((r) => ['placed', 'active', 'closing', 'closed'].includes(r.state)).length,
    totalHours: Math.round(rows.reduce((s, r) => s + (r.hours || 0), 0) * 10) / 10,
    byOutcome: tally(closed.map((r) => r.outcome).filter(Boolean)),
    staleCases: rows.filter((r) => r.stale).length,
    flaggedCases: rows.filter((r) => r.flags.length > 0).length,
    overdueDeadlines: rows.filter((r) => !['closed', 'withdrawn'].includes(r.state))
      .reduce((s, r) => s + r.deadlines.filter((d) => d.overdue).length, 0),
    slaBreaches: rows.filter((r) => r.slaBreached).length,
    aging,
    byVolunteer,
  };

  return { asOf, cases: rows, impact, settings: { staleDays, matchLimit, maxOpenPerVolunteer: maxOpen, stageSla } };
}

function tally(values) {
  const t = {};
  for (const v of values) t[v] = (t[v] ?? 0) + 1;
  return t;
}

// -------------------------------------------------------- ICS export

/**
 * Deterministic iCalendar export: one all-day VEVENT per deadline
 * (UTC dates only; DTSTAMP pinned to the board's asOf so reruns are
 * byte-identical). Invalid dates are skipped, never guessed.
 */
export function toICS(board) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const ymd = (d) => d.replace(/-/g, '');
  const nextDay = (d) => new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//pro-bono-case-board//open-artifact//EN', 'CALSCALE:GREGORIAN'];
  for (const r of board.cases) {
    (r.deadlines ?? []).forEach((d, i) => {
      if (!d.valid) return;
      L.push('BEGIN:VEVENT',
        `UID:${r.id}-dl${i + 1}@pro-bono-case-board`,
        `DTSTAMP:${ymd(board.asOf)}T000000Z`,
        `DTSTART;VALUE=DATE:${ymd(d.dueDate)}`,
        `DTEND;VALUE=DATE:${ymd(nextDay(d.dueDate))}`,
        `SUMMARY:${esc(`${r.id} ${d.label} [${d.kind}]${d.overdue ? ' (OVERDUE)' : ''}`)}`,
        `DESCRIPTION:${esc(`Fictional demo data. Case ${r.id} (${r.client}) — ${r.problem}. Severity: ${d.severity}.`)}`,
        'END:VEVENT');
    });
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}

// ----------------------------------------------------- intake parsing

const PARSE_FIELDS = new Set(['id', 'client', 'problem', 'state', 'openedDate', 'lastActivityDate',
  'requiredSkills', 'optionalSkills', 'volunteerId', 'hours']);
const PARSE_REQUIRED_COLS = ['id', 'client', 'problem', 'state', 'openedDate', 'lastActivityDate'];

function splitCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

const splitList = (v) => String(v ?? '').split(/[;|]/).map((s) => s.trim()).filter(Boolean);

/** Resolve a header cell to its canonical field name (case-insensitive). */
const canonical = (h) => [...PARSE_FIELDS].find((f) => f.toLowerCase() === h.toLowerCase()) ?? h.toLowerCase();

/**
 * Tolerant intake parsing: pasted CSV rows → draft cases + per-row
 * issues (bad date, unknown state, missing/duplicate id). NEVER throws —
 * messy rows are flagged, not dropped; drafts feed buildBoard which
 * re-flags anything still invalid. Skills cells use ";" or "|" separators.
 *
 * @returns {{ cases: Object[], issues: { row: number, id?: string, issues: string[] }[] }}
 */
export function parseRows(text) {
  const out = { cases: [], issues: [] };
  if (typeof text !== 'string') return out;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return out;

  const header = splitCsvLine(lines[0]).map((h) => canonical(h.trim()));
  const missingCols = PARSE_REQUIRED_COLS.filter((f) => !header.includes(f));
  if (missingCols.length) out.issues.push({ row: 1, issues: [`header missing required column(s): ${missingCols.join(', ')}`] });
  for (const h of header) {
    if (h && !PARSE_FIELDS.has(h)) out.issues.push({ row: 1, issues: [`unknown column "${h}" ignored`] });
  }
  const idIdx = header.indexOf('id');

  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const row = i + 1;
    const cells = splitCsvLine(lines[i]);
    const rec = Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? '').trim()]));
    const rowIssues = [];

    const id = rec.id ?? '';
    if (!id) rowIssues.push('missing id');
    else if (seen.has(id)) rowIssues.push(`duplicate id "${id}"`);
    else seen.add(id);

    const state = rec.state ?? '';
    if (!state) rowIssues.push('missing state — draft left in intake');
    else if (!WORKFLOW.states.includes(state)) rowIssues.push(`unknown state "${state}"`);

    for (const f of ['openedDate', 'lastActivityDate']) {
      if (!VALID_ISO.test(rec[f] ?? '')) rowIssues.push(`${f} "${rec[f] ?? ''}" is not an ISO date (YYYY-MM-DD)`);
    }

    if (rowIssues.length) out.issues.push({ row, id: id || undefined, issues: rowIssues });
    out.cases.push({
      id: id || `ROW-${row}`,
      client: rec.client ?? '',
      problem: rec.problem ?? '',
      state: state && WORKFLOW.states.includes(state) ? state : 'intake',
      openedDate: VALID_ISO.test(rec.openedDate ?? '') ? rec.openedDate : null,
      lastActivityDate: VALID_ISO.test(rec.lastActivityDate ?? '') ? rec.lastActivityDate : null,
      requiredSkills: splitList(rec.requiredSkills),
      optionalSkills: splitList(rec.optionalSkills),
      volunteerId: rec.volunteerId || null,
      hours: Number(rec.hours) || 0,
      sourceRow: row,
    });
  }
  return out;
}

// ---------------------------------------------------------- board diff

/**
 * Deterministic diff between two boards (e.g., last run vs. regen):
 * added / removed cases, stage changes, cases newly closed, and moved
 * deadlines (same label, different dueDate). Sorted by id (then label),
 * so identical inputs always produce an identical change log.
 */
export function diffBoards(a, b) {
  const A = new Map(a.cases.map((r) => [r.id, r]));
  const B = new Map(b.cases.map((r) => [r.id, r]));
  const added = [...B.keys()].filter((id) => !A.has(id)).sort();
  const removed = [...A.keys()].filter((id) => !B.has(id)).sort();
  const stageChanged = [];
  const closed = [];
  const deadlineMoved = [];
  for (const id of [...A.keys()].filter((id) => B.has(id)).sort()) {
    const x = A.get(id);
    const y = B.get(id);
    if (x.state !== y.state) {
      if (y.state === 'closed') closed.push({ id, from: x.state, to: 'closed' });
      else stageChanged.push({ id, from: x.state, to: y.state });
    }
    const dlA = new Map((x.deadlines ?? []).map((d) => [d.label, d.dueDate]));
    for (const d of y.deadlines ?? []) {
      if (dlA.has(d.label) && dlA.get(d.label) !== d.dueDate) {
        deadlineMoved.push({ id, label: d.label, from: dlA.get(d.label), to: d.dueDate });
      }
    }
  }
  deadlineMoved.sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : p.label < q.label ? -1 : p.label > q.label ? 1 : 0));
  return { added, removed, stageChanged, closed, deadlineMoved };
}

/** CSV export, one row per case. */
export function toCSV(board) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = ['id,client,problem,state,volunteerId,stale,staleFor,hours,outcome,flags'];
  for (const r of board.cases) {
    lines.push([r.id, r.client, r.problem, r.state, r.volunteerId, r.stale, r.staleFor, r.hours, r.outcome,
      r.flags.join('; ')].map((v) => esc(v ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

/** Deterministic Markdown board. */
export function renderBoard(b) {
  const L = [];
  L.push(`# Pro bono case board — as of ${b.asOf}`, '');
  const i = b.impact;
  L.push('## Impact rollup', '');
  L.push(`- Open cases: **${i.openCases}** · placed/active/closing: **${i.placedCases}** · closed: **${i.closedCases}** · withdrawn: **${i.withdrawnCases}**`);
  L.push(`- Volunteer hours logged: **${i.totalHours}**`);
  L.push(`- Stale cases (> ${b.settings.staleDays}d no activity): **${i.staleCases}** · flagged: **${i.flaggedCases}**`);
  L.push(`- Overdue deadlines (open cases): **${i.overdueDeadlines}** · SLA breaches: **${i.slaBreaches}**`);
  L.push(`- Open-case aging: ${Object.entries(i.aging).map(([k, v]) => `${k}d ${v}`).join(' · ')}`);
  L.push(`- Outcomes: ${Object.entries(i.byOutcome).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}`);
  L.push('', '## Volunteer capacity', '');
  L.push('| Volunteer | Open cases | Hours | Stale owned |');
  L.push('|---|---|---|---|');
  for (const [vid, v] of Object.entries(i.byVolunteer)) {
    L.push(`| ${vid} | ${v.openCases}${v.atCapacity ? ` (**at capacity** > ${v.maxOpen})` : ` / ${v.maxOpen}`} | ${v.hours} | ${v.staleOwned} |`);
  }
  L.push('', '## Cases', '');
  L.push('| Case | State | Volunteer | Last activity | Deadlines | Flags | Top match |');
  L.push('|---|---|---|---|---|---|---|');
  const order = { active: 0, closing: 1, placed: 2, ready: 3, triage: 4, intake: 5, closed: 6, withdrawn: 7 };
  for (const r of [...b.cases].sort((a, c) =>
    (order[a.state] ?? 99) - (order[c.state] ?? 99) || (c.staleFor ?? -1) - (a.staleFor ?? -1))) {
    const top = r.matches[0];
    const dls = r.deadlines.length
      ? r.deadlines.map((d) => `${d.valid ? `${d.label} ${d.dueDate}` : `⚠ ${d.label} (invalid date)`} ${d.severity}`).join('<br>')
      : '—';
    L.push(`| ${r.id} ${r.client} — ${r.problem} | ${r.state} | ${r.volunteerId ?? '—'} | ${r.lastActivityDate ?? '—'}${r.stale ? ' (STALE)' : ''} | ${dls} | ${r.flags.join('; ') || '—'} | ${top ? `${top.volunteerId} ${top.score}${top.eligible ? '' : ' (ineligible)'}` : '—'} |`);
  }
  L.push('');
  return L.join('\n');
}
