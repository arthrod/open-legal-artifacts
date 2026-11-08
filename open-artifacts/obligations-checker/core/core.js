/**
 * obligations-checker core — deterministic contract obligations register:
 *   - takes obligations JSON (party, verb, deadline, condition)
 *   - tracks per-obligation compliance status against satisfaction records
 *   - flags breach risk when a due date passes without a satisfaction record
 *   - CSV export
 *
 * NO LLM: statuses are pure functions of (obligations, satisfaction,
 * asOf). Extracting obligations JSON from a contract is the LLM's job —
 * its prompt schema is in spec.md; the core only computes on what it is
 * given and never invents deadlines or satisfactions.
 */

const VALID_ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const CADENCE_MONTHS = { monthly: 1, quarterly: 3, annual: 12 };
const OPEN = ['pending', 'due-soon', 'overdue'];

/** Anchor + n months, day clamped to the target month's last day (Jan 31 → Feb 28). */
function addMonthsISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12 + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Cycle due dates strictly before asOf, plus the next one at/after asOf. */
function cycleDates(recurrence, asOf) {
  const step = CADENCE_MONTHS[recurrence.cadence];
  const past = [];
  let next = null;
  for (let k = 0; ; k++) {
    const d = addMonthsISO(recurrence.anchor, k * step);
    if (d < asOf) past.push(d);
    else { next = d; break; }
  }
  return { past, next };
}

/**
 * Build the obligation register.
 *
 * @param {Object} input
 *   { asOf: ISO, obligations: Obligation[], satisfaction: Satisfaction[],
 *     settings?: { dueSoonDays?: number } }
 *
 * Obligation: { id, clause, party, owner?, verb, text, dueDate?: ISO|null,
 *               condition?: string, amount?: number, sourceQuote?: string,
 *               recurrence?: { cadence: 'monthly'|'quarterly'|'annual', anchor: ISO } }
 * Satisfaction: { obligationId, satisfiedOn: ISO, evidence?: string, note?: string }
 */
export function buildRegister(input) {
  const asOf = input.asOf;
  if (!VALID_ISO.test(asOf)) throw new Error(`asOf must be ISO date, got "${asOf}"`);
  const dueSoonDays = input.settings?.dueSoonDays ?? 14;

  // latest satisfaction record wins (by satisfiedOn then array order)
  const satisfied = new Map();
  for (const s of input.satisfaction ?? []) {
    const prev = satisfied.get(s.obligationId);
    if (!prev || !VALID_ISO.test(prev.satisfiedOn) || (VALID_ISO.test(s.satisfiedOn) && s.satisfiedOn >= prev.satisfiedOn)) {
      satisfied.set(s.obligationId, s);
    }
  }

  const rows = input.obligations.map((o) => {
    const flags = [];
    const record = satisfied.get(o.id) ?? null;
    let status;
    let nextDue = null;
    let cyclesMissed = null;

    if (o.recurrence && (!CADENCE_MONTHS[o.recurrence.cadence] || !VALID_ISO.test(o.recurrence.anchor ?? ''))) {
      status = 'unscheduled';
      flags.push(`invalid recurrence (${JSON.stringify(o.recurrence)}) — compliance unverified, never guessed`);
    } else if (o.recurrence) {
      // Each cycle is its own duty: the latest satisfaction record covers at
      // most the most recent past cycle (when it falls in that cycle's window);
      // every earlier unmet cycle is a miss.
      const { past, next } = cycleDates(o.recurrence, asOf);
      nextDue = next;
      const missed = [...past];
      const lastPast = past[past.length - 1];
      if (record && lastPast && (!VALID_ISO.test(record.satisfiedOn) || record.satisfiedOn >= (past[past.length - 2] ?? ''))) {
        missed.pop(); // the record covers the most recent past cycle
        if (VALID_ISO.test(record.satisfiedOn) && record.satisfiedOn > lastPast) {
          flags.push(`satisfied ${days(lastPast, record.satisfiedOn)} days late for cycle due ${lastPast}`);
        } else if (!VALID_ISO.test(record.satisfiedOn)) {
          flags.push(`satisfaction date "${record.satisfiedOn}" not valid ISO — lateness unverified`);
        }
      }
      cyclesMissed = missed.length;
      if (cyclesMissed > 0) {
        status = 'overdue';
        flags.push(`breach risk: ${cyclesMissed} missed ${o.recurrence.cadence} cycle${cyclesMissed > 1 ? 's' : ''} — due ${missed.join(', ')} with no satisfaction record`);
      } else if (record) {
        status = 'satisfied';
      } else {
        const d = days(asOf, next);
        if (d <= dueSoonDays) {
          status = 'due-soon';
          flags.push(`next ${o.recurrence.cadence} cycle due in ${d} days (≤ ${dueSoonDays})`);
        } else {
          status = 'pending';
        }
      }
    } else if (record) {
      status = 'satisfied';
      if (o.dueDate && VALID_ISO.test(o.dueDate) && VALID_ISO.test(record.satisfiedOn) && record.satisfiedOn > o.dueDate) {
        flags.push(`satisfied ${days(o.dueDate, record.satisfiedOn)} days late (due ${o.dueDate}, done ${record.satisfiedOn})`);
      } else if (o.dueDate && !VALID_ISO.test(record.satisfiedOn)) {
        flags.push(`satisfaction date "${record.satisfiedOn}" not valid ISO — lateness unverified`);
      }
    } else if (o.dueDate && VALID_ISO.test(o.dueDate)) {
      const d = days(asOf, o.dueDate);
      if (d < 0) {
        status = 'overdue';
        flags.push(`breach risk: due ${o.dueDate} — ${-d} days past with no satisfaction record`);
      } else if (d <= dueSoonDays) {
        status = 'due-soon';
        flags.push(`due in ${d} days (≤ ${dueSoonDays}) with no satisfaction record yet`);
      } else {
        status = 'pending';
      }
    } else if (o.dueDate) {
      status = 'unscheduled';
      flags.push(`dueDate "${o.dueDate}" not valid ISO — compliance unverified, never guessed`);
    } else if (o.condition) {
      status = 'conditional';
      flags.push(`no calendar due date — triggered by condition: "${o.condition}"; monitor manually`);
    } else {
      status = 'unscheduled';
      flags.push('no due date and no condition — cannot track automatically');
    }

    return {
      id: o.id,
      clause: o.clause ?? null,
      party: o.party,
      verb: o.verb,
      text: o.text,
      owner: o.owner ?? null,
      dueDate: o.dueDate ?? null,
      nextDue,
      recurrence: o.recurrence ?? null,
      cyclesMissed,
      sourceQuote: o.sourceQuote ?? null,
      condition: o.condition ?? null,
      amount: o.amount ?? null,
      status,
      breachRisk: flags.some((f) => f.startsWith('breach risk')),
      flags,
      satisfaction: record ? { satisfiedOn: record.satisfiedOn, evidence: record.evidence ?? null, note: record.note ?? null } : null,
    };
  });

  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const summary = {
    total: rows.length,
    byStatus,
    breachRisk: rows.filter((r) => r.breachRisk).length,
    satisfied: byStatus.satisfied ?? 0,
    satisfiedLate: rows.filter((r) => r.status === 'satisfied' && r.flags.some((f) => f.includes('late'))).length,
    open: rows.filter((r) => OPEN.includes(r.status)).length,
    flagged: rows.filter((r) => r.flags.length > 0).length,
    unscheduledOrConditional: (byStatus.unscheduled ?? 0) + (byStatus.conditional ?? 0),
  };
  const byParty = {};
  for (const r of rows) {
    const b = (byParty[r.party] ??= { open: 0, overdue: 0, exposure: 0 });
    if (OPEN.includes(r.status)) b.open += 1;
    if (r.status === 'overdue') {
      b.overdue += 1;
      if (typeof r.amount === 'number') b.exposure += r.amount;
    }
  }
  summary.byParty = byParty;
  return { asOf, obligations: rows, summary, settings: { dueSoonDays } };
}

/** CSV export, one row per obligation. */
export function toCSV(register) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = ['id,clause,party,owner,verb,text,dueDate,nextDue,amount,status,breachRisk,satisfiedOn,evidence,sourceQuote,flags'];
  for (const r of register.obligations) {
    lines.push([r.id, r.clause, r.party, r.owner, r.verb, r.text, r.dueDate, r.nextDue, r.amount, r.status, r.breachRisk,
      r.satisfaction?.satisfiedOn ?? '', r.satisfaction?.evidence ?? '',
      r.sourceQuote ?? '',
      r.flags.join('; ')].map((v) => esc(v ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

/** Deterministic Markdown register: worst first. */
export function renderRegister(reg) {
  const L = [];
  L.push(`# Obligations register — as of ${reg.asOf}`, '');
  const s = reg.summary;
  L.push(`Total **${s.total}** · open **${s.open}** · satisfied **${s.satisfied}**${s.satisfiedLate ? ` (${s.satisfiedLate} late)` : ''} · breach risk **${s.breachRisk}** · unscheduled/conditional **${s.unscheduledOrConditional}**`, '');
  L.push('| Status | Id | Party | Obligation | Due | Satisfied | Flags |');
  L.push('|---|---|---|---|---|---|---|');
  const order = { overdue: 0, 'due-soon': 1, unscheduled: 2, conditional: 3, pending: 4, satisfied: 5 };
  for (const r of [...reg.obligations].sort((a, b) => order[a.status] - order[b.status] || (a.id < b.id ? -1 : 1))) {
    const due = r.dueDate ?? (r.recurrence ? `${r.nextDue}${r.cyclesMissed ? ` (+${r.cyclesMissed} missed cycle${r.cyclesMissed > 1 ? 's' : ''})` : ''}` : null) ?? '—';
    L.push(`| ${r.status}${r.breachRisk ? ' ⚠' : ''} | ${r.id}${r.clause ? ` (${r.clause})` : ''} | ${r.party}${r.owner ? ` (${r.owner})` : ''} | ${r.verb}: ${r.text} | ${due} | ${r.satisfaction?.satisfiedOn ?? '—'} | ${r.flags.join('; ') || '—'} |`);
  }
  L.push('');
  const quoted = reg.obligations.filter((r) => r.sourceQuote);
  if (quoted.length) {
    L.push('## Sources', '');
    for (const r of quoted) L.push(`- ${r.id}${r.clause ? ` ${r.clause}` : ''}: "${r.sourceQuote}"`);
    L.push('');
  }
  return L.join('\n');
}

/**
 * Diff two registers (different asOf dates, or before/after an amendment):
 * per-id status transitions, added/removed ids, and flags that appeared.
 * Keyed by obligation id — stable ids across re-extractions are required
 * (see the spec.md prompt schema).
 */
export function diffRegisters(a, b) {
  const A = new Map(a.obligations.map((r) => [r.id, r]));
  const B = new Map(b.obligations.map((r) => [r.id, r]));
  const added = [...B.keys()].filter((id) => !A.has(id)).sort();
  const removed = [...A.keys()].filter((id) => !B.has(id)).sort();
  const transitions = [];
  const newFlags = [];
  for (const [id, rb] of B) {
    const ra = A.get(id);
    if (!ra) continue;
    if (ra.status !== rb.status) transitions.push({ id, party: rb.party, from: ra.status, to: rb.status });
    const oldFlags = new Set(ra.flags);
    const appeared = rb.flags.filter((f) => !oldFlags.has(f));
    if (appeared.length) newFlags.push({ id, flags: appeared });
  }
  transitions.sort((x, y) => (x.id < y.id ? -1 : 1));
  newFlags.sort((x, y) => (x.id < y.id ? -1 : 1));
  return { from: a.asOf, to: b.asOf, added, removed, transitions, newFlags };
}

/** Deterministic Markdown rendering of a register diff. */
export function renderDiff(d) {
  const L = [];
  L.push(`# Register diff — ${d.from} → ${d.to}`, '');
  L.push(`${d.transitions.length} transition(s) · ${d.added.length} added · ${d.removed.length} removed · ${d.newFlags.length} new flag(s)`, '');
  if (d.transitions.length) {
    L.push('| Id | Party | Status |', '|---|---|---|');
    for (const t of d.transitions) L.push(`| ${t.id} | ${t.party} | ${t.from} → ${t.to} |`);
    L.push('');
  }
  if (d.added.length) {
    L.push('**Added**', '');
    for (const id of d.added) L.push(`+ ${id}`);
    L.push('');
  }
  if (d.removed.length) {
    L.push('**Removed**', '');
    for (const id of d.removed) L.push(`- ${id}`);
    L.push('');
  }
  if (d.newFlags.length) {
    L.push('**New flags**', '');
    for (const n of d.newFlags) for (const f of n.flags) L.push(`- ${n.id}: ${f}`);
    L.push('');
  }
  return L.join('\n');
}

/** RFC 5545 text escaping for ICS property values. */
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * iCalendar export: one VEVENT (+VALARM reminder, 7 days ahead) per open
 * obligation with a known date — recurring obligations use their next cycle
 * date. Satisfied, conditional, and undated obligations are excluded.
 */
export function toICS(register) {
  const stamp = register.asOf.replace(/-/g, '') + 'T000000Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//open-legal-artifacts//obligations-checker//EN', 'CALSCALE:GREGORIAN'];
  for (const r of register.obligations) {
    const date = r.dueDate ?? r.nextDue;
    if (!OPEN.includes(r.status) || !date) continue;
    const end = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    const summary = `${r.status}: ${r.id}${r.clause ? ` (${r.clause})` : ''} — ${r.verb}: ${r.text}`;
    const desc = [`Party: ${r.party}`, r.owner ? `Owner: ${r.owner}` : null, ...r.flags].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@obligations-checker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-P7D',
      `DESCRIPTION:${icsEscape(`obligation ${r.id} due ${date}`)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\n') + '\n';
}
