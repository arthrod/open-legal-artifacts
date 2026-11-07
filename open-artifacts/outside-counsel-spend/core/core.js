/**
 * outside-counsel-spend — deterministic core.
 *
 * Matters × firms spend ledger audit: rate-card compliance (hourly entries vs
 * negotiated rate cards), budget variance (net of write-offs), write-off
 * flags, period rollups, and JSON/CSV exports. The auditable object is the
 * FINDINGS LEDGER — every exception cites the entry, the rule, the expected
 * value, and the dollar impact.
 *
 * Dependency-free plain-JavaScript ES module; browser + Node compatible.
 * All money arithmetic in integer cents; no floats in comparisons, no hidden
 * clocks. Rate cards, budgets, and thresholds are rules-as-data.
 * @module core
 */

/* ---------- helpers ---------- */

/** Parse "YYYY-MM-DD" to UTC Date (null when unparseable — never guessed).
 * @param {string|null|undefined} d
 * @returns {Date|null} */
export function parseDate(d) {
  if (!d || typeof d !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return null;
  return dt;
}

/** Dollars → integer cents (half-up on ties, deterministic).
 * @param {number|string|null|undefined} usd
 * @returns {number} */
export function toCents(usd) {
  const n = typeof usd === "string" ? Number(usd.replace(/[$,]/g, "")) : usd;
  if (n === null || n === undefined || Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

/** Cents → dollar number (2 decimals).
 * @param {number} c @returns {number} */
export function toUsd(c) {
  return Math.round(c) / 100;
}

/** Derived billing for an entry: amount when present, else hours × rate.
 * Disbursements always use their amount. Returns cents.
 * @param {any} e @returns {number} */
function billedCents(e) {
  if (e.amount !== undefined && e.amount !== null) return toCents(e.amount);
  if (e.hours !== undefined && e.hours !== null && e.rate !== undefined && e.rate !== null) {
    return Math.round((toCents(e.hours) * toCents(e.rate)) / 100);
  }
  return 0;
}

/** Default settings (rules-as-data; override via input.settings).
 * @type {{ rateToleranceUsd: number, writeOffFlagPct: number }} */
export const DEFAULT_SETTINGS = {
  rateToleranceUsd: 0, // allowed excess over the card rate before "over_rate"
  writeOffFlagPct: 10, // write-off as % of bill that triggers a flag
};

/* ---------- rate-card resolution ---------- */

/**
 * Resolve the most specific rate card covering an entry: matter-scoped beats
 * firm-wide; the entry date must fall inside [effectiveFrom, effectiveTo]
 * (open-ended when omitted). Ties resolve to first occurrence in input order
 * (documented, deterministic).
 *
 * @param {any} entry @param {any[]} rateCards
 * @returns {{ card: any, specificity: number } | null}
 */
export function resolveRateCard(entry, rateCards) {
  const d = parseDate(entry.date);
  let best = null;
  for (const card of rateCards ?? []) {
    if (String(card.firmId) !== String(entry.firmId)) continue;
    if (card.matterId !== undefined && card.matterId !== null && String(card.matterId) !== String(entry.matterId)) continue;
    if (d) {
      const from = card.effectiveFrom ? parseDate(card.effectiveFrom) : null;
      const to = card.effectiveTo ? parseDate(card.effectiveTo) : null;
      if (from && d < from) continue;
      if (to && d > to) continue;
    }
    const specificity = card.matterId !== undefined && card.matterId !== null ? 2 : 1;
    if (!best || specificity > best.specificity) best = { card, specificity };
  }
  return best;
}

/**
 * Check every hourly fee entry against its resolved rate card.
 * Findings (non-"ok" only are returned; "ok" counts in okCount):
 *   over_rate     — billed rate exceeds card level rate by more than tolerance
 *   unknown_level — timekeeper level not present on the card
 *   no_rate_card  — no card covers this firm (± matter) on the entry date
 *
 * @param {{ ledger?: any[], rateCards?: any[], settings?: any }} input
 * @returns {{ findings: any[], okCount: number, checked: number }}
 */
export function checkRateCompliance(input) {
  const toleranceCents = toCents(input.settings?.rateToleranceUsd ?? DEFAULT_SETTINGS.rateToleranceUsd);
  const findings = [];
  let okCount = 0;
  let checked = 0;
  for (const e of input.ledger ?? []) {
    const type = e.type ?? "fee";
    const billing = e.billing ?? (e.hours !== undefined && e.hours !== null ? "hourly" : "flat");
    if (type !== "fee" || billing !== "hourly" || e.rate === undefined || e.rate === null) continue;
    checked++;
    const base = {
      kind: "rate",
      entryId: e.id,
      matterId: e.matterId,
      firmId: e.firmId,
      period: e.period,
      timekeeper: e.timekeeper ?? null,
      level: e.level ?? null,
      billedRate: toUsd(toCents(e.rate)),
      hours: e.hours ?? null,
    };
    const res = resolveRateCard(e, input.rateCards ?? []);
    if (!res) {
      findings.push({ ...base, status: "no_rate_card", expectedRate: null, rateVariance: null, amountImpact: null, detail: `no rate card covers firm "${e.firmId}" on ${e.date}` });
      continue;
    }
    const expected = res.card.rates?.[e.level];
    if (expected === undefined) {
      findings.push({
        ...base,
        status: "unknown_level",
        expectedRate: null,
        rateVariance: null,
        amountImpact: null,
        detail: `level "${e.level}" is not on rate card for firm "${e.firmId}"${res.card.matterId ? ` (matter ${res.card.matterId})` : ""} — expected rate cannot be determined`,
      });
      continue;
    }
    const billedC = toCents(e.rate);
    const expectedC = toCents(expected);
    if (billedC > expectedC + toleranceCents) {
      const impactC = Math.round((billedC - expectedC) * (e.hours ?? 0));
      findings.push({
        ...base,
        status: "over_rate",
        expectedRate: toUsd(expectedC),
        rateVariance: toUsd(billedC - expectedC),
        amountImpact: toUsd(impactC),
        detail: `billed ${base.billedRate}/h for level "${e.level}" but card rate is ${toUsd(expectedC)}/h (${res.card.matterId ? `matter card` : "firm card"}, from ${res.card.effectiveFrom ?? "open"}) — impact ${toUsd(impactC)} over ${e.hours}h`,
      });
      continue;
    }
    okCount++;
  }
  return { findings, okCount, checked };
}

/* ---------- budget variance ---------- */

/**
 * Matter × firm budget variance. Spend is NET of write-offs. Budget matching:
 * an exact matter+firm budget (optionally period-scoped) shadows matter-wide
 * budgets for that firm; a firm without an exact budget falls back to the
 * matter-wide budget (firmId omitted). Pairs with no matching budget are
 * `unbudgeted` — visible, never silently passed.
 *
 * @param {{ ledger?: any[], budgets?: any[] }} input
 * @returns {Array<{ matterId: string, firmId: string, gross: number, writeOffs: number, net: number, approved: number|null, variance: number|null, variancePct: number|null, status: "within"|"over"|"unbudgeted", budgetScopes: string[] }>}
 */
export function computeBudgetVariance(input) {
  const pairs = new Map();
  for (const e of input.ledger ?? []) {
    const key = `${e.matterId}::${e.firmId}`;
    const p = pairs.get(key) ?? { matterId: e.matterId, firmId: e.firmId, grossC: 0, writeOffC: 0, periods: new Set() };
    const amtC = billedCents(e);
    const woC = toCents(e.writeOff ?? 0);
    p.grossC += amtC;
    p.writeOffC += woC;
    p.periods.add(e.period);
    pairs.set(key, p);
  }
  const entriesOf = (matterId, firmId) =>
    (input.ledger ?? []).filter((e) => String(e.matterId) === String(matterId) && String(e.firmId) === String(firmId));

  const out = [];
  for (const p of pairs.values()) {
    const budgets = input.budgets ?? [];
    const exact = budgets.filter((b) => String(b.matterId) === String(p.matterId) && b.firmId !== undefined && b.firmId !== null && String(b.firmId) === String(p.firmId));
    const scoped = exact.length > 0 ? exact : budgets.filter((b) => String(b.matterId) === String(p.matterId) && (b.firmId === undefined || b.firmId === null));

    let approvedC = 0;
    const budgetScopes = [];
    // Period-scoped budgets count only entries in their period; a pair is
    // "in" a period budget when it has at least one ledger entry there.
    const activePeriods = new Set();
    for (const b of scoped) {
      approvedC += toCents(b.approved);
      budgetScopes.push(b.period ? `matter ${b.matterId} firm ${b.firmId ?? "all"} period ${b.period}` : `matter ${b.matterId} firm ${b.firmId ?? "all"}`);
      if (b.period && p.periods.has(b.period)) activePeriods.add(b.period);
    }
    const periodScoped = scoped.filter((b) => b.period);
    const netC = periodScoped.length > 0 && scoped.length === periodScoped.length
      ? entriesOf(p.matterId, p.firmId)
          .filter((e) => activePeriods.has(e.period))
          .reduce((s, e) => s + billedCents(e) - toCents(e.writeOff ?? 0), 0)
      : p.grossC - p.writeOffC;

    if (scoped.length === 0) {
      out.push({
        matterId: p.matterId, firmId: p.firmId,
        gross: toUsd(p.grossC), writeOffs: toUsd(p.writeOffC), net: toUsd(netC),
        approved: null, variance: null, variancePct: null, status: "unbudgeted", budgetScopes: [],
      });
      continue;
    }
    const varianceC = netC - approvedC;
    out.push({
      matterId: p.matterId, firmId: p.firmId,
      gross: toUsd(p.grossC), writeOffs: toUsd(p.writeOffC), net: toUsd(netC),
      approved: toUsd(approvedC),
      variance: toUsd(varianceC),
      variancePct: approvedC === 0 ? null : Math.round((varianceC / approvedC) * 10000) / 100,
      status: varianceC > 0 ? "over" : "within",
      budgetScopes,
    });
  }
  out.sort((a, b) => String(a.matterId).localeCompare(String(b.matterId)) || String(a.firmId).localeCompare(String(b.firmId)));
  return out;
}

/* ---------- write-off flags ---------- */

/**
 * Flag entries whose write-off is at least `writeOffFlagPct`% of the billed
 * amount (default 10%). Every write-off appears in period rollups; only
 * over-threshold ones are flagged here.
 *
 * @param {{ ledger?: any[], settings?: any }} input
 * @returns {Array<{ kind: "write_off", entryId: string, matterId: string, firmId: string, period: string, timekeeper: string|null, amount: number, writeOff: number, writeOffPct: number, flag: "high_write_off", detail: string }>}
 */
export function flagWriteOffs(input) {
  const pctTh = input.settings?.writeOffFlagPct ?? DEFAULT_SETTINGS.writeOffFlagPct;
  const flags = [];
  for (const e of input.ledger ?? []) {
    const woC = toCents(e.writeOff ?? 0);
    if (woC <= 0) continue;
    const amtC = billedCents(e);
    const pct = amtC === 0 ? null : Math.round((woC / amtC) * 10000) / 100;
    if (pct !== null && pct >= pctTh) {
      flags.push({
        kind: "write_off",
        entryId: e.id,
        matterId: e.matterId,
        firmId: e.firmId,
        period: e.period,
        timekeeper: e.timekeeper ?? null,
        amount: toUsd(amtC),
        writeOff: toUsd(woC),
        writeOffPct: pct,
        flag: "high_write_off",
        detail: `write-off ${toUsd(woC)} is ${pct}% of the ${toUsd(amtC)} bill (threshold ${pctTh}%) — narrative: "${e.narrative ?? ""}"`,
      });
    }
  }
  return flags;
}

/* ---------- period rollups ---------- */

/**
 * Roll the ledger up per "YYYY-MM" period: fees, disbursements, write-offs,
 * net spend, plus by-firm and by-matter net splits. Sorted by period.
 *
 * @param {{ ledger?: any[] }} input
 * @returns {Array<{ period: string, entries: number, fees: number, disbursements: number, writeOffs: number, net: number, byFirm: Record<string, number>, byMatter: Record<string, number> }>}
 */
export function rollupByPeriod(input) {
  const byPeriod = new Map();
  for (const e of input.ledger ?? []) {
    const p = byPeriod.get(e.period) ?? { period: e.period, entries: 0, feesC: 0, disbC: 0, woC: 0, byFirmC: {}, byMatterC: {} };
    const amtC = billedCents(e);
    const woC = toCents(e.writeOff ?? 0);
    p.entries += 1;
    if ((e.type ?? "fee") === "disbursement") p.disbC += amtC;
    else p.feesC += amtC;
    p.woC += woC;
    p.byFirmC[e.firmId] = (p.byFirmC[e.firmId] ?? 0) + amtC - woC;
    p.byMatterC[e.matterId] = (p.byMatterC[e.matterId] ?? 0) + amtC - woC;
    byPeriod.set(e.period, p);
  }
  return [...byPeriod.values()]
    .sort((a, b) => String(a.period).localeCompare(String(b.period)))
    .map((p) => ({
      period: p.period,
      entries: p.entries,
      fees: toUsd(p.feesC),
      disbursements: toUsd(p.disbC),
      writeOffs: toUsd(p.woC),
      net: toUsd(p.feesC + p.disbC - p.woC),
      byFirm: Object.fromEntries(Object.entries(p.byFirmC).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, toUsd(v)])),
      byMatter: Object.fromEntries(Object.entries(p.byMatterC).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, toUsd(v)])),
    }));
}

/* ---------- audit entry point ---------- */

/**
 * Run the full audit: rate compliance + budget variance + write-off flags +
 * period rollups, with a summary.
 *
 * @param {{ ledger?: any[], rateCards?: any[], budgets?: any[], settings?: any }} input
 * @returns {any}
 */
export function runSpendAudit(input) {
  const rate = checkRateCompliance(input);
  const budgets = computeBudgetVariance(input);
  const writeOffs = flagWriteOffs(input);
  const rollups = rollupByPeriod(input);

  const grossC = (input.ledger ?? []).reduce((s, e) => s + billedCents(e), 0);
  const feesC = (input.ledger ?? []).reduce((s, e) => s + ((e.type ?? "fee") === "fee" ? billedCents(e) : 0), 0);
  const disbC = (input.ledger ?? []).reduce((s, e) => s + (e.type === "disbursement" ? billedCents(e) : 0), 0);
  const woC = (input.ledger ?? []).reduce((s, e) => s + toCents(e.writeOff ?? 0), 0);

  return {
    summary: {
      entries: (input.ledger ?? []).length,
      fees: toUsd(feesC),
      disbursements: toUsd(disbC),
      writeOffs: toUsd(woC),
      netSpend: toUsd(grossC - woC),
      hourlyChecked: rate.checked,
      rateOk: rate.okCount,
      rateExceptions: rate.findings.length,
      overBudget: budgets.filter((b) => b.status === "over").length,
      unbudgeted: budgets.filter((b) => b.status === "unbudgeted").length,
      writeOffFlags: writeOffs.length,
    },
    rateFindings: rate.findings,
    budgetVariances: budgets,
    writeOffFlags: writeOffs,
    periodRollups: rollups,
  };
}

/* ---------- exports ---------- */

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV export of the findings ledger — one row per actionable finding
 * (rate exception, budget breach/unbudgeted pair, write-off flag).
 * @param {any} audit — output of runSpendAudit
 * @returns {string}
 */
export function auditToCsv(audit) {
  const header = ["kind", "ref", "matterId", "firmId", "period", "status", "detail", "amount"];
  const rows = [
    ...audit.rateFindings.map((f) => ["rate", f.entryId, f.matterId, f.firmId, f.period, f.status, f.detail, f.amountImpact ?? f.rateVariance ?? ""]),
    ...audit.budgetVariances
      .filter((b) => b.status !== "within")
      .map((b) => ["budget", `${b.matterId}×${b.firmId}`, b.matterId, b.firmId, "", b.status, b.status === "over" ? `net spend ${b.net} exceeds approved ${b.approved} by ${b.variance} (${b.variancePct}%)` : `no budget found for this matter × firm (net spend ${b.net})`, b.status === "over" ? b.variance : b.net]),
    ...audit.writeOffFlags.map((w) => ["write_off", w.entryId, w.matterId, w.firmId, w.period, w.flag, w.detail, w.writeOff]),
  ];
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}

/**
 * JSON export of the audit (stable key order; safe to commit to version control).
 * @param {any} audit @returns {string} */
export function auditToJson(audit) {
  return JSON.stringify(audit, null, 2) + "\n";
}

/** Markdown report — deterministic rendering of an audit.
 * @param {any} audit @param {{ firmNames?: Record<string,string>, matterNames?: Record<string,string> }} [names]
 * @returns {string} */
export function renderReport(audit, names = {}) {
  const firm = (f) => names.firmNames?.[f] ?? f;
  const matter = (m) => names.matterNames?.[m] ?? m;
  const s = audit.summary;
  const lines = [];
  lines.push("# Outside counsel spend audit");
  lines.push("");
  lines.push(`**${s.entries} entries · fees ${s.fees} · disbursements ${s.disbursements} · write-offs ${s.writeOffs} · net spend ${s.netSpend}**`);
  lines.push("");
  lines.push(`Rate check: ${s.hourlyChecked} hourly entries, ${s.rateOk} ok, **${s.rateExceptions} exception(s)** · Budgets: **${s.overBudget} over**, ${s.unbudgeted} unbudgeted · Write-off flags: **${s.writeOffFlags}**`);
  lines.push("");
  if (audit.rateFindings.length) {
    lines.push("## Rate-card exceptions");
    lines.push("");
    for (const f of audit.rateFindings) {
      lines.push(`- \`${f.entryId}\` · ${matter(f.matterId)} × ${firm(f.firmId)} · ${f.timekeeper ?? "?"} (${f.level ?? "?"}) · ${f.period} — **${f.status}**: ${f.detail}.`);
    }
    lines.push("");
  }
  lines.push("## Budget variance (net of write-offs)");
  lines.push("");
  lines.push("| Matter | Firm | Net | Approved | Variance | Status |");
  lines.push("|---|---|---|---|---|---|");
  for (const b of audit.budgetVariances) {
    lines.push(`| ${matter(b.matterId)} | ${firm(b.firmId)} | ${b.net} | ${b.approved ?? "—"} | ${b.variance !== null ? `${b.variance}${b.variancePct !== null ? ` (${b.variancePct}%)` : ""}` : "—"} | ${b.status} |`);
  }
  lines.push("");
  if (audit.writeOffFlags.length) {
    lines.push("## Write-off flags");
    lines.push("");
    for (const w of audit.writeOffFlags) lines.push(`- \`${w.entryId}\` · ${matter(w.matterId)} × ${firm(w.firmId)} · ${w.period} — ${w.detail}.`);
    lines.push("");
  }
  lines.push("## Period rollups");
  lines.push("");
  lines.push("| Period | Entries | Fees | Disbursements | Write-offs | Net |");
  lines.push("|---|---|---|---|---|---|");
  for (const p of audit.periodRollups) lines.push(`| ${p.period} | ${p.entries} | ${p.fees} | ${p.disbursements} | ${p.writeOffs} | ${p.net} |`);
  lines.push("");
  lines.push("_All data fictional. Rate cards and thresholds are rules-as-data. Not legal or billing advice._");
  lines.push("");
  return lines.join("\n");
}
