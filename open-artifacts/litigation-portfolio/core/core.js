/**
 * litigation-portfolio core — deterministic matter portfolio with
 * statute-of-limitations date math driven by rules-as-data.
 *
 * NO LLM: every deadline, band, and dashboard number is reproducible
 * from the input. Jurisdiction-specific limitation periods are NOT
 * hard-coded truths — they ship as an editable `claimRules` map with
 * US-default values and citations, and every output carries a
 * "verify against current law" disclaimer.
 *
 * Responsibilities:
 *   - SOL deadline per matter: accrual date + rule period (years|days),
 *     accrual mode occurrence|discovery, extended by tolling spans
 *   - days-remaining + status band (expired / critical / warning / ok)
 *   - exposure banding (low / medium / high / unquantified)
 *   - dashboard rollups + CSV export
 *
 * Never guesses: unknown claim types, unparseable dates, and missing
 * rules produce explicit flags (`deadline: null`, entry in `flags`),
 * never an invented deadline.
 */

// ---------------------------------------------------------------- utils

/** True for valid calendar dates in ISO YYYY-MM-DD. */
export function isValidIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

/** Parse ISO date to a UTC timestamp; returns NaN for invalid input. */
export function toUtc(iso) {
  if (!isValidIsoDate(iso)) return NaN;
  return Date.parse(iso + 'T00:00:00Z');
}

/** Format a UTC timestamp as ISO YYYY-MM-DD. */
export function fromUtc(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calendar-year addition; Feb 29 clamps to Feb 28 (no Mar 1 roll-over). */
export function addYears(iso, years) {
  const [y, m, d] = iso.split('-').map(Number);
  const dd = Math.min(d, daysInMonth(y + years, m));
  return `${String(y + years).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function addDays(iso, n) {
  return fromUtc(toUtc(iso) + n * 86400000);
}

export function diffDays(a, b) {
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

// ------------------------------------------------------ rules-as-data

/**
 * US-default limitation rules per claim type. EDITABLE DATA, not law.
 * Every deadline computed from these carries `ruleCite` + a disclaimer.
 * @typedef {Object} ClaimRule
 * @property {number} [years]      limitation period in whole years
 * @property {number} [days]       limitation period in days (alt. to years)
 * @property {'occurrence'|'discovery'} [accrual='occurrence']
 * @property {string} cite         citation for the default (verify locally)
 * @property {string} label        human-readable claim-type name
 */
export const DEFAULT_CLAIM_RULES = {
  'personal-injury-negligence': {
    label: 'Personal injury — negligence',
    years: 2,
    accrual: 'occurrence',
    cite: 'e.g. Cal. Code Civ. Proc. § 335.1 (2 yr) — US default, verify per state',
  },
  'property-damage': {
    label: 'Property damage',
    years: 3,
    accrual: 'occurrence',
    cite: 'e.g. Cal. Code Civ. Proc. § 338(b) (3 yr) — US default, verify per state',
  },
  'fraud': {
    label: 'Fraud / misrepresentation',
    years: 3,
    accrual: 'discovery',
    cite: 'e.g. Cal. Code Civ. Proc. § 338(d) (3 yr, discovery) — US default, verify per state',
  },
  'breach-of-written-contract': {
    label: 'Breach of written contract',
    years: 4,
    accrual: 'occurrence',
    cite: 'e.g. Cal. Code Civ. Proc. § 337 (4 yr) — US default, verify per state',
  },
  'breach-of-oral-contract': {
    label: 'Breach of oral contract',
    years: 2,
    accrual: 'occurrence',
    cite: 'e.g. Cal. Code Civ. Proc. § 339 (2 yr) — US default, verify per state',
  },
  'employment-discrimination-federal': {
    label: 'Employment discrimination (Title VII route)',
    days: 300,
    accrual: 'occurrence',
    cite: '42 U.S.C. § 2000e-5(e) (300-day EEOC charge window) — US default, verify',
  },
};

/** Default exposure bands (USD high estimate). Editable. */
export const DEFAULT_EXPOSURE_BANDS = [
  { band: 'low', maxHigh: 50000 },
  { band: 'medium', maxHigh: 500000 },
  { band: 'high', maxHigh: Infinity },
];

/** SOL status thresholds in days. Editable. */
export const DEFAULT_SOL_THRESHOLDS = { critical: 30, warning: 90 };

// ------------------------------------------------------------- inputs

/**
 * @typedef {Object} Matter
 * @property {string} id
 * @property {string} name          matter caption (fictional data)
 * @property {string} client        fictional client name
 * @property {string} claimType     key into claimRules
 * @property {string} [accrualDate] ISO date the claim accrued
 * @property {string} [discoveryDate] ISO date of discovery (discovery-rule claims)
 * @property {{from:string,to:string,reason:string}[]} [tollingEvents]
 * @property {'assessing'|'active'|'settlement'|'trial'|'closed'} status
 * @property {string} stage          free-text stage label
 * @property {number} [exposureLow]  USD low estimate
 * @property {number} [exposureHigh] USD high estimate
 * @property {string} [counsel]      rules-of-the-road: lead counsel
 * @property {string} [venue]        rules-of-the-road: venue
 * @property {string} [strategy]     rules-of-the-road: negotiated ground rules
 * @property {string} [nextDeadline] ISO date of next known deadline
 */
/**
 * @typedef {Object} PortfolioInput
 * @property {Matter[]} matters
 * @property {string} asOf             ISO date the portfolio is evaluated at
 * @property {Object} [claimRules]     overrides merged over DEFAULT_CLAIM_RULES
 * @property {Array} [exposureBands]   overrides DEFAULT_EXPOSURE_BANDS
 * @property {Object} [solThresholds]  overrides DEFAULT_SOL_THRESHOLDS
 */

// ----------------------------------------------------------- engine

function ruleFor(claimType, rules) {
  if (Object.prototype.hasOwnProperty.call(rules, claimType)) return rules[claimType];
  return null;
}

/**
 * Compute the SOL deadline for one matter. Pure.
 * Returns { deadline: string|null, accrualUsed, ruleCite, flags[] }.
 * Never invents a date: missing rule / missing dates / bad dates → flags.
 */
export function computeSol(matter, rules) {
  const flags = [];
  const rule = ruleFor(matter.claimType, rules);
  if (!rule) {
    flags.push(`unknown claim type "${matter.claimType}" — no limitation rule configured`);
    return { deadline: null, accrualUsed: null, ruleCite: null, flags };
  }
  const accrual =
    rule.accrual === 'discovery'
      ? matter.discoveryDate ?? matter.accrualDate
      : matter.accrualDate;
  if (!accrual) {
    flags.push(`${rule.accrual === 'discovery' ? 'discovery date' : 'accrual date'} missing`);
    return { deadline: null, accrualUsed: null, ruleCite: rule.cite, flags };
  }
  if (!isValidIsoDate(accrual)) {
    flags.push(`unparseable ${rule.accrual}-accrual date "${accrual}"`);
    return { deadline: null, accrualUsed: null, ruleCite: rule.cite, flags };
  }
  let deadline = rule.days ? addDays(accrual, rule.days) : addYears(accrual, rule.years);
  const tollingEvents = matter.tollingEvents ?? [];
  for (const t of tollingEvents) {
    if (!isValidIsoDate(t.from) || !isValidIsoDate(t.to)) {
      flags.push(`tolling event "${t.reason}" has unparseable dates — ignored`);
      continue;
    }
    deadline = addDays(deadline, diffDays(t.from, t.to));
  }
  return { deadline, accrualUsed: accrual, ruleCite: rule.cite, flags };
}

function exposureBand(matter, bands) {
  if (matter.exposureHigh == null) {
    return { band: 'unquantified', bandBasis: 'no exposure estimate on file' };
  }
  for (const b of bands) {
    if (matter.exposureHigh <= b.maxHigh) return { band: b.band, bandBasis: `high estimate $${matter.exposureHigh.toLocaleString('en-US')}` };
  }
  return { band: 'unquantified', bandBasis: 'no band matched' }; // unreachable with defaults
}

function solStatus(deadline, asOf, thresholds) {
  const remaining = diffDays(asOf, deadline);
  if (remaining < 0) return { remaining, status: 'expired' };
  if (remaining <= thresholds.critical) return { remaining, status: 'critical' };
  if (remaining <= thresholds.warning) return { remaining, status: 'warning' };
  return { remaining, status: 'ok' };
}

/**
 * Build the evaluated portfolio.
 * @param {PortfolioInput} input
 * @returns {{ asOf, matters: Array, summary: Object, disclaimer: string }}
 */
export function buildPortfolio(input) {
  const asOf = input.asOf;
  if (!isValidIsoDate(asOf)) throw new Error(`asOf must be an ISO date, got "${asOf}"`);
  const rules = { ...DEFAULT_CLAIM_RULES, ...(input.claimRules ?? {}) };
  const bands = input.exposureBands ?? DEFAULT_EXPOSURE_BANDS;
  const thresholds = { ...DEFAULT_SOL_THRESHOLDS, ...(input.solThresholds ?? {}) };

  const rows = input.matters.map((m) => {
    const flags = [];
    const sol = computeSol(m, rules);
    flags.push(...sol.flags);
    const st = sol.deadline ? solStatus(sol.deadline, asOf, thresholds) : { remaining: null, status: 'unverified' };
    const ex = exposureBand(m, bands);
    if (m.exposureLow != null && m.exposureHigh != null && m.exposureLow > m.exposureHigh) {
      flags.push('exposureLow > exposureHigh — check estimates');
    }
    if (m.nextDeadline && isValidIsoDate(m.nextDeadline) && diffDays(asOf, m.nextDeadline) < 0) {
      flags.push('nextDeadline is in the past');
    }
    return {
      id: m.id,
      name: m.name,
      client: m.client,
      claimType: m.claimType,
      claimLabel: rules[m.claimType]?.label ?? m.claimType,
      status: m.status,
      stage: m.stage,
      rulesOfRoad: { counsel: m.counsel ?? null, venue: m.venue ?? null, strategy: m.strategy ?? null, nextDeadline: m.nextDeadline ?? null },
      sol: {
        deadline: sol.deadline,
        daysRemaining: st.remaining,
        status: st.status,
        accrualUsed: sol.accrualUsed,
        ruleCite: sol.ruleCite,
      },
      exposure: {
        low: m.exposureLow ?? null,
        high: m.exposureHigh ?? null,
        band: ex.band,
        bandBasis: ex.bandBasis,
      },
      flags,
    };
  });

  const count = (fn) => rows.filter(fn).length;
  const bandTotal = (band) =>
    rows.filter((r) => r.exposure.band === band).reduce((s, r) => s + (r.exposure.high ?? 0), 0);

  const summary = {
    total: rows.length,
    byStatus: tally(rows.map((r) => r.status)),
    solAlerts: rows.filter((r) => r.sol.status === 'expired' || r.sol.status === 'critical').length,
    solUnverified: count((r) => r.sol.status === 'unverified'),
    exposureByBand: {
      low: { matters: count((r) => r.exposure.band === 'low'), totalHighEstimate: bandTotal('low') },
      medium: { matters: count((r) => r.exposure.band === 'medium'), totalHighEstimate: bandTotal('medium') },
      high: { matters: count((r) => r.exposure.band === 'high'), totalHighEstimate: bandTotal('high') },
      unquantified: count((r) => r.exposure.band === 'unquantified'),
    },
    flagged: rows.filter((r) => r.flags.length > 0).length,
  };

  return {
    asOf,
    matters: rows,
    summary,
    disclaimer:
      'Limitation periods are configurable US defaults, not legal advice; verify ruleCite against current law in the governing jurisdiction before relying on any deadline.',
  };
}

function tally(values) {
  const t = {};
  for (const v of values) t[v] = (t[v] ?? 0) + 1;
  return t;
}

// ----------------------------------------------------------- exports

/** CSV export: one row per matter, ISO dates, USD plain numbers. */
export function toCSV(portfolio) {
  const head = [
    'id', 'name', 'client', 'claimType', 'status', 'stage',
    'solDeadline', 'daysRemaining', 'solStatus', 'ruleCite',
    'exposureLow', 'exposureHigh', 'exposureBand', 'flags',
  ];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(',')];
  for (const r of portfolio.matters) {
    lines.push([
      r.id, r.name, r.client, r.claimType, r.status, r.stage,
      r.sol.deadline, r.sol.daysRemaining, r.sol.status, r.sol.ruleCite,
      r.exposure.low, r.exposure.high, r.exposure.band,
      r.flags.length ? r.flags.join('; ') : '',
    ].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}

/** Deterministic Markdown dashboard. */
export function renderDashboard(p) {
  const L = [];
  L.push(`# Litigation portfolio — as of ${p.asOf}`, '');
  L.push(p.disclaimer, '');
  L.push(`## Summary`);
  L.push('');
  L.push(`- Matters: **${p.summary.total}**`);
  L.push(`- SOL alerts (expired + critical): **${p.summary.solAlerts}**`);
  L.push(`- SOL unverified (missing data/rule): **${p.summary.solUnverified}**`);
  L.push(`- Flagged matters: **${p.summary.flagged}**`);
  L.push(`- Status: ${Object.entries(p.summary.byStatus).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  L.push('');
  L.push('## Exposure bands (high estimates, USD)');
  L.push('');
  L.push('| Band | Matters | Total high estimate |');
  L.push('|---|---|---|');
  for (const b of ['low', 'medium', 'high']) {
    const e = p.summary.exposureByBand[b];
    L.push(`| ${b} | ${e.matters} | $${e.totalHighEstimate.toLocaleString('en-US')} |`);
  }
  L.push(`| unquantified | ${p.summary.exposureByBand.unquantified} | — |`);
  L.push('');
  L.push('## Matters');
  L.push('');
  L.push('| Matter | Status | SOL deadline | Days left | Exposure | Flags |');
  L.push('|---|---|---|---|---|---|');
  for (const r of [...p.matters].sort((a, b) => {
    const av = a.sol.daysRemaining == null ? Infinity : a.sol.daysRemaining;
    const bv = b.sol.daysRemaining == null ? Infinity : b.sol.daysRemaining;
    return av - bv;
  })) {
    L.push(`| ${r.name} (${r.id}) | ${r.status}/${r.stage} | ${r.sol.deadline ?? '—'} | ${r.sol.daysRemaining ?? '—'} (${r.sol.status}) | ${r.exposure.band} | ${r.flags.length ? r.flags.join('; ') : '—'} |`);
  }
  L.push('');
  return L.join('\n');
}
