/**
 * pro-bono-case-board core — deterministic pro bono case tracker:
 *   - intake → placement → closure workflow states with guarded transitions
 *   - volunteer-skill matching by deterministic tag matching with a score
 *   - stale-case flags (no activity beyond a configurable threshold)
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

function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
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
  const volunteers = input.volunteers ?? [];
  const byId = Object.fromEntries(volunteers.map((v) => [v.id, v]));

  const rows = input.cases.map((c) => {
    const flags = [];
    if (!WORKFLOW.states.includes(c.state)) flags.push(`unknown state "${c.state}"`);
    if (!VALID_ISO.test(c.lastActivityDate ?? '')) flags.push('lastActivityDate missing or not ISO — staleness unverified');
    const staleFor = VALID_ISO.test(c.lastActivityDate ?? '') && !['closed', 'withdrawn'].includes(c.state)
      ? daysBetween(c.lastActivityDate, asOf) : null;
    const stale = staleFor != null && staleFor > staleDays;
    if (stale) flags.push(`no activity for ${staleFor} days (> ${staleDays})`);
    if (c.state === 'placed' && !c.volunteerId) flags.push('state is placed but no volunteerId set');
    if (c.volunteerId && !byId[c.volunteerId]) flags.push(`assigned volunteer "${c.volunteerId}" not in roster`);
    if (c.state === 'closed' && !c.outcome) flags.push('closed without outcome');

    const isOpen = !['closed', 'withdrawn'].includes(c.state);
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
      stale,
      staleFor,
      flags,
      matches: isOpen ? rankVolunteers(c, volunteers, matchLimit) : [],
    };
  });

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
  };

  return { asOf, cases: rows, impact, settings: { staleDays, matchLimit } };
}

function tally(values) {
  const t = {};
  for (const v of values) t[v] = (t[v] ?? 0) + 1;
  return t;
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
  L.push(`- Outcomes: ${Object.entries(i.byOutcome).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}`);
  L.push('', '## Cases', '');
  L.push('| Case | State | Volunteer | Last activity | Flags | Top match |');
  L.push('|---|---|---|---|---|---|');
  const order = { active: 0, closing: 1, placed: 2, ready: 3, triage: 4, intake: 5, closed: 6, withdrawn: 7 };
  for (const r of [...b.cases].sort((a, c) =>
    (order[a.state] ?? 99) - (order[c.state] ?? 99) || (c.staleFor ?? -1) - (a.staleFor ?? -1))) {
    const top = r.matches[0];
    L.push(`| ${r.id} ${r.client} — ${r.problem} | ${r.state} | ${r.volunteerId ?? '—'} | ${r.lastActivityDate ?? '—'}${r.stale ? ' (STALE)' : ''} | ${r.flags.join('; ') || '—'} | ${top ? `${top.volunteerId} ${top.score}${top.eligible ? '' : ' (ineligible)'}` : '—'} |`);
  }
  L.push('');
  return L.join('\n');
}
