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

/**
 * Build the obligation register.
 *
 * @param {Object} input
 *   { asOf: ISO, obligations: Obligation[], satisfaction: Satisfaction[],
 *     settings?: { dueSoonDays?: number } }
 *
 * Obligation: { id, clause, party, verb, text, dueDate?: ISO|null,
 *               condition?: string, amount?: number }
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

    if (record) {
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
      dueDate: o.dueDate ?? null,
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
    open: rows.filter((r) => ['pending', 'due-soon', 'overdue'].includes(r.status)).length,
    flagged: rows.filter((r) => r.flags.length > 0).length,
    unscheduledOrConditional: (byStatus.unscheduled ?? 0) + (byStatus.conditional ?? 0),
  };
  return { asOf, obligations: rows, summary, settings: { dueSoonDays } };
}

/** CSV export, one row per obligation. */
export function toCSV(register) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = ['id,clause,party,verb,text,dueDate,amount,status,breachRisk,satisfiedOn,evidence,flags'];
  for (const r of register.obligations) {
    lines.push([r.id, r.clause, r.party, r.verb, r.text, r.dueDate, r.amount, r.status, r.breachRisk,
      r.satisfaction?.satisfiedOn ?? '', r.satisfaction?.evidence ?? '',
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
    L.push(`| ${r.status}${r.breachRisk ? ' ⚠' : ''} | ${r.id}${r.clause ? ` (${r.clause})` : ''} | ${r.party} | ${r.verb}: ${r.text} | ${r.dueDate ?? '—'} | ${r.satisfaction?.satisfiedOn ?? '—'} | ${r.flags.join('; ') || '—'} |`);
  }
  L.push('');
  return L.join('\n');
}
