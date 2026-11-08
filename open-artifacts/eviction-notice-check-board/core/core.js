/**
 * eviction-notice-check-board core — checks eviction notice facts against
 * jurisdiction rules-as-data and outputs a per-requirement PASS/FAIL/
 * UNVERIFIED board with the rule cited for every cell.
 *
 * NEVER GUESSES: any fact not positively attested in the input is
 * UNVERIFIED, never inferred; unknown jurisdictions and notice types are
 * flagged, never approximated from a "similar" rule.
 *
 * The bundled jurisdiction rulesets are EDITABLE EXAMPLE DATA with US
 * defaults and citations that must be verified against current law —
 * eviction notice law changes frequently and varies by city/county.
 */

// ------------------------------------------------------ rules-as-data

/**
 * Ten example US jurisdictions plus one fictional city overlay (showing
 * the `extends` overlay mechanism). EDITABLE JSON-shaped data: extend,
 * correct, or replace — every check cites the `cite` it used.
 * Values are plausible defaults for demonstration, marked verify-first.
 */
export const JURISDICTIONS = {
  'california-example': {
    name: 'California (example defaults — verify locally)',
    noticeTypes: {
      'pay-or-quit': {
        minDays: 3,
        excludeWeekendsHolidays: true,
        contents: [
          { id: 'amount-due', label: 'Amount of rent due', cite: 'CCP § 1161(2) (example)' },
          { id: 'payment-person', label: 'Name, telephone, and street address of person to pay', cite: 'CCP § 1161(2) (example)' },
          { id: 'payment-methods', label: 'Permitted payment methods (incl. at least one non-electronic during business hours)', cite: 'CCP § 1161(2) (example)' },
          { id: 'nonrent-fees-excluded', label: 'States notice is void if non-rent fees are included', cite: 'CCP § 1161.3 (example)' },
        ],
        service: {
          methods: ['personal', 'substituted-and-mail', 'post-and-mail', 'electronic-with-consent'],
          cite: 'CCP § 1162 (example)',
        },
        cite: 'CCP §§ 1161(2), 1161.3 (example defaults)',
      },
      'termination-month-to-month': {
        minDays: 30,
        longTenancyMinDays: 60,
        longTenancyYears: 1,
        contents: [
          { id: 'termination-date', label: 'Date the tenancy ends', cite: 'CCP § 1946.1 (example)' },
        ],
        service: { methods: ['personal', 'substituted-and-mail', 'post-and-mail', 'electronic-with-consent'], cite: 'CCP § 1162 (example)' },
        cite: 'CCP § 1946.1 (example defaults)',
      },
    },
  },
  'texas-example': {
    name: 'Texas (example defaults — verify locally)',
    noticeTypes: {
      'notice-to-vacate': {
        minDays: 3,
        leaseCanShorten: true,
        contents: [
          { id: 'vacate-demand', label: 'Demand to vacate the premises', cite: 'Tex. Prop. Code § 24.005 (example)' },
        ],
        service: {
          methods: ['personal', 'mail', 'inside-premises', 'conspicuous-place'],
          cite: 'Tex. Prop. Code § 24.005(f) (example)',
        },
        cite: 'Tex. Prop. Code § 24.005 (example defaults)',
      },
    },
  },
  'new-york-example': {
    name: 'New York (example defaults — verify locally)',
    noticeTypes: {
      'rent-demand': {
        minDays: 14,
        contents: [
          { id: 'amount-due', label: 'Amount of rent due', cite: 'RPAPL § 733(1) (example)' },
          { id: 'rent-periods', label: 'Rent periods the demand covers', cite: 'RPAPL § 733(1) (example)' },
        ],
        service: {
          methods: ['personal', 'substituted', 'conspicuous-place', 'mail'],
          cite: 'RPAPL § 733(2) (example)',
        },
        cite: 'RPAPL § 733 (example defaults)',
      },
    },
  },
  'washington-example': {
    name: 'Washington (example defaults — verify locally)',
    noticeTypes: {
      'pay-or-vacate': {
        minDays: 14,
        contents: [
          { id: 'amount-due', label: 'Amount of rent, utilities, and periodic charges due', cite: 'RCW 59.18.057 (example)' },
          { id: 'payment-address', label: 'Address and method for payment', cite: 'RCW 59.18.057 (example)' },
          { id: 'deadline-date', label: 'Date and time by which rent must be paid', cite: 'RCW 59.18.057 (example)' },
        ],
        service: {
          methods: ['personal', 'mail-with-certificate-of-mailing'],
          cite: 'RCW 59.12.030 (example)',
        },
        cite: 'RCW 59.18.057, 59.12.030 (example defaults)',
      },
    },
  },
  'ohio-example': {
    name: 'Ohio (example defaults — verify locally)',
    noticeTypes: {
      'notice-to-leave': {
        minDays: 3,
        contents: [
          { id: 'statutory-language', label: 'Statutory leave-premises language ("You are being asked to leave the premises…")', cite: 'ORC 1923.04 (example)' },
        ],
        service: {
          methods: ['personal-delivery', 'mail'],
          cite: 'ORC 1923.04 (example)',
        },
        cite: 'ORC 1923.04 (example defaults)',
      },
    },
  },
  'florida-example': {
    name: 'Florida (example defaults — verify locally)',
    noticeTypes: {
      'pay-or-quit': {
        minDays: 3,
        contents: [
          { id: 'amount-due', label: 'Amount of rent due', cite: 'Fla. Stat. § 83.56(3) (example)' },
        ],
        service: { methods: ['personal', 'mail', 'post'], cite: 'Fla. Stat. § 83.56 (example)' },
        cite: 'Fla. Stat. § 83.56(3) (example defaults)',
      },
    },
  },
  'georgia-example': {
    name: 'Georgia (example defaults — verify locally)',
    noticeTypes: {
      'termination-month-to-month': {
        minDays: 60,
        contents: [
          { id: 'termination-date', label: 'Date the tenancy ends', cite: 'Ga. Code § 44-7-7 (example)' },
        ],
        service: { methods: ['personal', 'mail'], cite: 'Ga. Code § 44-7-7 (example)' },
        cite: 'Ga. Code § 44-7-7 (example defaults)',
      },
    },
  },
  'arizona-example': {
    name: 'Arizona (example defaults — verify locally)',
    noticeTypes: {
      'pay-or-vacate': {
        minDays: 5,
        contents: [
          { id: 'amount-due', label: 'Amount of rent due', cite: 'A.R.S. § 33-1368(B) (example)' },
        ],
        service: { methods: ['personal', 'mail'], cite: 'A.R.S. § 33-1368 (example)' },
        cite: 'A.R.S. § 33-1368(B) (example defaults)',
      },
    },
  },
  'illinois-example': {
    name: 'Illinois (example defaults — verify locally)',
    noticeTypes: {
      'pay-or-quit': {
        minDays: 5,
        contents: [
          { id: 'amount-due', label: 'Amount of rent due', cite: '735 ILCS 5/9-209 (example)' },
        ],
        service: { methods: ['personal', 'mail'], cite: '735 ILCS 5/9-209 (example)' },
        cite: '735 ILCS 5/9-209 (example defaults)',
      },
    },
  },
  'oregon-example': {
    name: 'Oregon (example defaults — verify locally)',
    noticeTypes: {
      'termination-month-to-month': {
        minDays: 90,
        contents: [
          { id: 'termination-date', label: 'Date the tenancy ends', cite: 'ORS 90.427 (example)' },
        ],
        service: { methods: ['personal', 'mail', 'post-and-mail'], cite: 'ORS 90.427 (example)' },
        cite: 'ORS 90.427 (example defaults)',
      },
    },
  },
  'fiction-city-example': {
    name: 'Fiction City (FICTIONAL overlay example — extends california-example; fork me for your city)',
    extends: 'california-example',
    noticeTypes: {
      'pay-or-quit': {
        contents: [
          { id: 'bilingual-notice', label: 'Notice also given in Spanish (Fiction City language requirement)', cite: 'Fiction City Mun. Code § 9.99 (FICTIONAL — illustrative only)' },
        ],
      },
    },
  },
};

/**
 * Editable example: 2026 US federal-holiday dates as ISO. Used only by the
 * deadline engine when a rule excludes weekends/holidays. Replace with your
 * court's actual holiday calendar. Jurisdiction-level `holidays` arrays are
 * merged on top of these.
 */
export const HOLIDAYS = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19',
  '2026-07-03', '2026-09-07', '2026-11-11', '2026-11-26', '2026-12-25',
];

/** Ruleset provenance stamped into every board output. */
export const RULESET_META = { version: '2.0.0', asOf: '2026-11-07' };

export const DISCLAIMER =
  'Jurisdiction rulesets are editable example data with US defaults; notice periods, required contents, and service rules vary by state, city, and lease. Not legal advice — verify every cited rule against current law before acting.';

// ------------------------------------------------------------- checks

function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Stable content hash of a rules object (sorted-key canonical JSON → FNV-1a). */
export function rulesetHash(rules) {
  return fnv1a(canonical(rules ?? JURISDICTIONS));
}

function provenance(rules) {
  return { version: RULESET_META.version, asOf: RULESET_META.asOf, hash: rulesetHash(rules) };
}

const VALID_ISO = /^\d{4}-\d{2}-\d{2}$/;

function isoAddDays(iso, n) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

function isBusinessDay(iso, holidays) {
  const dow = new Date(Date.parse(iso + 'T00:00:00Z')).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.includes(iso);
}

/**
 * Deadline engine: counting starts the day AFTER service. With
 * excludeWeekendsHolidays, Saturdays, Sundays, and listed holiday dates are
 * skipped (not counted). The notice period expires at the end of the
 * requiredDays-th counted day, and that day is the earliest lawful filing
 * date (acceptance: served Fri, 3-day excl-weekend → pass only from Wed).
 * Returns null on any invalid input — never a guess.
 */
export function computeDeadlines(serviceDate, requiredDays, opts) {
  const { excludeWeekendsHolidays = false, holidays = [] } = opts ?? {};
  if (!VALID_ISO.test(String(serviceDate ?? ''))) return null;
  if (!Number.isFinite(requiredDays) || requiredDays < 1) return null;
  const countedDays = [];
  const skippedDays = [];
  let d = serviceDate;
  for (let i = 0; countedDays.length < requiredDays && i < 3660; i++) {
    d = isoAddDays(d, 1);
    if (excludeWeekendsHolidays && !isBusinessDay(d, holidays)) skippedDays.push(d);
    else countedDays.push(d);
  }
  if (countedDays.length < requiredDays) return null;
  const last = countedDays[countedDays.length - 1];
  return {
    serviceDate,
    requiredDays,
    counting: excludeWeekendsHolidays ? 'business' : 'calendar',
    earliestFiling: last,
    expires: last,
    countedDays,
    skippedDays,
  };
}

/** Counted days in (serviceDate, filedDate] under the rule's counting mode. */
function countElapsedDays(serviceDate, filedDate, excludeWeekendsHolidays, holidays) {
  if (Date.parse(filedDate + 'T00:00:00Z') < Date.parse(serviceDate + 'T00:00:00Z')) return -1;
  if (filedDate === serviceDate) return 0; // same-day filing: 0 counted days, not an uncountable span
  let d = serviceDate;
  let counted = 0;
  for (let i = 0; i < 4000; i++) {
    d = isoAddDays(d, 1);
    if (!excludeWeekendsHolidays || isBusinessDay(d, holidays)) counted++;
    if (d === filedDate) return counted;
  }
  return null; // span too large — refuse rather than guess
}

/**
 * Resolve a jurisdiction entry through its `extends` chain: an overlay
 * (e.g. a city on top of a state) inherits the base's notice types and adds
 * its own; overlay content rows are APPENDED to the base type's rows.
 */
function resolveJurisdiction(rules, key, seen = new Set()) {
  const j = Object.prototype.hasOwnProperty.call(rules, key) ? rules[key] : null;
  if (!j || !j.extends || seen.has(j.extends)) return j;
  seen.add(key);
  const base = resolveJurisdiction(rules, j.extends, seen);
  if (!base) return j;
  const noticeTypes = { ...base.noticeTypes };
  for (const [t, over] of Object.entries(j.noticeTypes ?? {})) {
    const b = base.noticeTypes ? base.noticeTypes[t] : null;
    noticeTypes[t] = b
      ? { ...b, ...over, contents: [...(b.contents ?? []), ...(over.contents ?? [])], service: over.service ?? b.service }
      : over;
  }
  return { ...base, ...j, holidays: [...(base.holidays ?? []), ...(j.holidays ?? [])], noticeTypes };
}

/**
 * Check one notice against a jurisdiction ruleset.
 *
 * @param {Object} notice — facts as attested by the reviewer:
 *   { jurisdiction: string, noticeType: string,
 *     statedPeriodDays?: number, serviceDate?: ISO, filedDate?: ISO,
 *     serviceMethod?: string, contents?: { [contentId]: true|false },
 *     tenancyYears?: number, leaseShortensPeriod?: boolean }
 * @param {Object} [rulesets] — overrides/extends JURISDICTIONS
 * @returns {Object} board with per-check rows and an overall verdict
 */
export function checkNotice(notice, rulesets) {
  const rules = { ...JURISDICTIONS, ...(rulesets ?? {}) };
  const checks = [];
  const jurisdiction = notice.jurisdiction;

  const push = (id, requirement, status, detail, cite) =>
    checks.push({ id, requirement, status, detail, ruleCite: cite ?? null });

  const jur = Object.prototype.hasOwnProperty.call(rules, jurisdiction) ? rules[jurisdiction] : null;
  const resolved = jur ? resolveJurisdiction(rules, jurisdiction) : null;
  if (!jur) {
    push('jurisdiction', 'Jurisdiction ruleset loaded', 'unverified',
      `No ruleset for "${jurisdiction}" — add or edit the jurisdiction JSON; refusing to approximate from another jurisdiction`, null);
    return { jurisdiction, noticeType: notice.noticeType ?? null, checks, summary: summarize(checks), ruleset: provenance(rules), deadlines: null, disclaimer: DISCLAIMER };
  }
  push('jurisdiction', 'Jurisdiction ruleset loaded', 'pass', resolved.name, null);

  const type = notice.noticeType != null && Object.prototype.hasOwnProperty.call(resolved.noticeTypes, notice.noticeType)
    ? resolved.noticeTypes[notice.noticeType]
    : null;
  if (!type) {
    push('notice-type', 'Notice type recognized under this ruleset', 'unverified',
      `Notice type "${notice.noticeType}" not configured for ${resolved.name}; known types: ${Object.keys(resolved.noticeTypes).join(', ')} — extend the rules JSON or map to a local equivalent (attorney call)`, resolved.cite ?? null);
    return { jurisdiction, noticeType: notice.noticeType ?? null, checks, summary: summarize(checks), ruleset: provenance(rules), deadlines: null, disclaimer: DISCLAIMER };
  }
  push('notice-type', 'Notice type recognized under this ruleset', 'pass', `${notice.noticeType} (${resolved.name})`, type.cite);

  const holidays = [...HOLIDAYS, ...(resolved.holidays ?? [])];
  const excl = !!type.excludeWeekendsHolidays;

  // --- period ---
  let requiredDays = type.minDays;
  if (type.longTenancyMinDays != null && notice.tenancyYears != null && notice.tenancyYears >= (type.longTenancyYears ?? 1)) {
    requiredDays = type.longTenancyMinDays;
  }
  if (notice.statedPeriodDays == null) {
    push('period', `Notice period ≥ ${requiredDays} days`, 'unverified',
      'statedPeriodDays not provided — read the period off the notice and re-check; not inferred', type.cite);
  } else if (notice.statedPeriodDays >= requiredDays) {
    push('period', `Notice period ≥ ${requiredDays} days`, 'pass',
      `notice states ${notice.statedPeriodDays} days; rule requires ${requiredDays}${requiredDays !== type.minDays ? ' (long-tenancy tier)' : ''}`, type.cite);
  } else {
    push('period', `Notice period ≥ ${requiredDays} days`, 'fail',
      `notice states ${notice.statedPeriodDays} days; rule requires ${requiredDays}${type.leaseCanShorten ? ' unless the lease validly shortens it (attorney to verify lease term)' : ''}`, type.cite);
  }

  // --- deadlines: earliest lawful filing + expiration from serviceDate ---
  const deadlines = notice.serviceDate && VALID_ISO.test(notice.serviceDate)
    ? computeDeadlines(notice.serviceDate, requiredDays, { excludeWeekendsHolidays: excl, holidays })
    : null;

  // --- elapsed days between service and filing, only when a filing date is
  //     actually in play (the notice itself can be facially compliant pre-filing) ---
  if (notice.serviceDate || notice.filedDate) {
    if (notice.serviceDate && notice.filedDate && VALID_ISO.test(notice.serviceDate) && VALID_ISO.test(notice.filedDate)) {
      const kind = excl ? 'lawful' : 'calendar';
      const elapsed = countElapsedDays(notice.serviceDate, notice.filedDate, excl, holidays);
      const dlNote = deadlines ? `; earliest lawful filing ${deadlines.earliestFiling}` : '';
      const span = (n) => `${n} ${kind} ${n === 1 ? 'day' : 'days'} elapsed`;
      if (elapsed === -1) {
        push('elapsed', `≥ ${requiredDays} days between service and filing`, 'fail',
          `filing date ${notice.filedDate} precedes service date ${notice.serviceDate} — check the dates`, type.cite);
      } else if (elapsed == null) {
        push('elapsed', `≥ ${requiredDays} days between service and filing`, 'unverified',
          'service → filing span too large to count — verify the dates', type.cite);
      } else if (elapsed >= requiredDays) {
        push('elapsed', `≥ ${requiredDays} days between service and filing`, 'pass',
          `${span(elapsed)} (${notice.serviceDate} → ${notice.filedDate})${dlNote}`, type.cite);
      } else {
        push('elapsed', `≥ ${requiredDays} days between service and filing`, 'fail',
          `only ${span(elapsed)} (${notice.serviceDate} → ${notice.filedDate})${dlNote}`, type.cite);
      }
    } else {
      push('elapsed', `≥ ${requiredDays} days between service and filing`, 'unverified',
        'service and/or filing date missing or not valid ISO (YYYY-MM-DD) — cannot verify the elapsed compliance window', type.cite);
    }
  }

  // --- required contents (+ user-supplied clinic checklist items) ---
  const attested = notice.contents ?? {};
  const checklist = (Array.isArray(notice.checklist) ? notice.checklist : [])
    .map((it) => ({ id: it.id, label: it.label, cite: it.cite ?? 'user-supplied checklist item (no citation given)' }));
  const seenIds = new Set();
  for (const c of [...type.contents, ...checklist]) {
    if (seenIds.has(c.id)) continue;
    seenIds.add(c.id);
    const v = attested[c.id];
    if (v === true) {
      push(`content:${c.id}`, `Contents: ${c.label}`, 'pass', 'attested present on the notice (no verbatim quote recorded)', c.cite);
    } else if (v === false) {
      push(`content:${c.id}`, `Contents: ${c.label}`, 'fail', 'attested ABSENT from the notice', c.cite);
    } else if (v && typeof v === 'object') {
      const q = typeof v.quote === 'string' && v.quote.trim() ? v.quote.trim() : null;
      if (v.present === true && q) {
        push(`content:${c.id}`, `Contents: ${c.label}`, 'pass', `attested present — verbatim from the notice: “${q}”`, c.cite);
      } else if (v.present === true) {
        push(`content:${c.id}`, `Contents: ${c.label}`, 'unverified', 'attested present but no verbatim quote recorded — add the quote from the notice so the row is auditable', c.cite);
      } else if (v.present === false) {
        push(`content:${c.id}`, `Contents: ${c.label}`, 'fail', `attested ABSENT from the notice${q ? ` — related text: “${q}”` : ''}`, c.cite);
      } else {
        push(`content:${c.id}`, `Contents: ${c.label}`, 'unverified', `present not attested (present=${JSON.stringify(v.present)}) — record true/false for "${c.id}"; never assumed`, c.cite);
      }
    } else {
      push(`content:${c.id}`, `Contents: ${c.label}`, 'unverified',
        `not attested — review the notice document and record true/false for "${c.id}"; never assumed`, c.cite);
    }
  }

  // --- service method ---
  const sm = type.service;
  if (notice.serviceMethod == null) {
    push('service', `Service by an authorized method (${sm.methods.join(', ')})`, 'unverified',
      'serviceMethod not provided — do not assume; record how service was actually made', sm.cite);
  } else if (sm.methods.includes(notice.serviceMethod)) {
    push('service', `Service by an authorized method (${sm.methods.join(', ')})`, 'pass',
      `method "${notice.serviceMethod}" is authorized`, sm.cite);
  } else {
    push('service', `Service by an authorized method (${sm.methods.join(', ')})`, 'fail',
      `method "${notice.serviceMethod}" is NOT in the authorized list`, sm.cite);
  }

  return {
    jurisdiction,
    noticeType: notice.noticeType,
    checks,
    summary: summarize(checks),
    ruleset: provenance(rules),
    deadlines,
    disclaimer: DISCLAIMER,
  };
}

function summarize(checks) {
  const s = { pass: 0, fail: 0, unverified: 0 };
  for (const c of checks) s[c.status]++;
  const verdict = s.fail > 0 ? 'fail' : s.unverified > 0 ? 'unverified' : 'pass';
  return { ...s, verdict };
}

/** Markdown board, one row per requirement with rule citations. */
export function renderBoard(board) {
  const L = [];
  L.push(`# Eviction notice check — ${board.jurisdiction} / ${board.noticeType ?? 'unknown type'}`, '');
  L.push(board.disclaimer, '');
  L.push(`**Verdict: ${board.summary.verdict.toUpperCase()}** ` +
    `(pass ${board.summary.pass} · fail ${board.summary.fail} · unverified ${board.summary.unverified})`, '');
  if (board.ruleset) {
    L.push(`Ruleset: v${board.ruleset.version} · as of ${board.ruleset.asOf} · hash ${board.ruleset.hash}`, '');
  }
  if (board.deadlines) {
    const d = board.deadlines;
    const skipped = d.counting === 'business' && d.skippedDays.length ? `; ${d.skippedDays.length} weekend/holiday days skipped` : '';
    L.push(`Earliest lawful filing: ${d.earliestFiling} · notice period expires ${d.expires} (${d.requiredDays} ${d.counting} days${skipped})`, '');
  }
  L.push('| Status | Requirement | Detail | Rule cited |');
  L.push('|---|---|---|---|');
  const order = { fail: 0, unverified: 1, pass: 2 };
  for (const c of [...board.checks].sort((a, b) => order[a.status] - order[b.status])) {
    L.push(`| ${c.status.toUpperCase()} | ${c.requirement} | ${c.detail} | ${c.ruleCite ?? '—'} |`);
  }
  L.push('');
  return L.join('\n');
}

/** CSV export of the check rows. */
export function toCSV(board) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = ['id,requirement,status,detail,ruleCite'];
  for (const c of board.checks) lines.push([c.id, c.requirement, c.status, c.detail, c.ruleCite ?? ''].map(esc).join(','));
  return lines.join('\n') + '\n';
}
