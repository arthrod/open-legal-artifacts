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
 * Five example US jurisdictions. EDITABLE JSON-shaped data: extend,
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
};

export const DISCLAIMER =
  'Jurisdiction rulesets are editable example data with US defaults; notice periods, required contents, and service rules vary by state, city, and lease. Not legal advice — verify every cited rule against current law before acting.';

// ------------------------------------------------------------- checks

function isoDays(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

const VALID_ISO = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!jur) {
    push('jurisdiction', 'Jurisdiction ruleset loaded', 'unverified',
      `No ruleset for "${jurisdiction}" — add or edit the jurisdiction JSON; refusing to approximate from another jurisdiction`, null);
    return { jurisdiction, noticeType: notice.noticeType ?? null, checks, summary: summarize(checks), disclaimer: DISCLAIMER };
  }
  push('jurisdiction', 'Jurisdiction ruleset loaded', 'pass', jur.name, null);

  const type = notice.noticeType != null && Object.prototype.hasOwnProperty.call(jur.noticeTypes, notice.noticeType)
    ? jur.noticeTypes[notice.noticeType]
    : null;
  if (!type) {
    push('notice-type', 'Notice type recognized under this ruleset', 'unverified',
      `Notice type "${notice.noticeType}" not configured for ${jur.name}; known types: ${Object.keys(jur.noticeTypes).join(', ')} — extend the rules JSON or map to a local equivalent (attorney call)`, jur.cite ?? null);
    return { jurisdiction, noticeType: notice.noticeType ?? null, checks, summary: summarize(checks), disclaimer: DISCLAIMER };
  }
  push('notice-type', 'Notice type recognized under this ruleset', 'pass', `${notice.noticeType} (${jur.name})`, type.cite);

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

  // --- elapsed days between service and filing, only when a filing date is
  //     actually in play (the notice itself can be facially compliant pre-filing) ---
  if (notice.serviceDate || notice.filedDate) {
    if (notice.serviceDate && notice.filedDate && VALID_ISO.test(notice.serviceDate) && VALID_ISO.test(notice.filedDate)) {
      const elapsed = isoDays(notice.serviceDate, notice.filedDate);
      if (elapsed >= requiredDays) {
        push('elapsed', `≥ ${requiredDays} days between service and filing`, 'pass',
          `${elapsed} days elapsed (${notice.serviceDate} → ${notice.filedDate})`, type.cite);
      } else {
        push('elapsed', `≥ ${requiredDays} days between service and filing`, 'fail',
          `only ${elapsed} days elapsed (${notice.serviceDate} → ${notice.filedDate})`, type.cite);
      }
    } else {
      push('elapsed', `≥ ${requiredDays} days between service and filing`, 'unverified',
        'service and/or filing date missing or not valid ISO (YYYY-MM-DD) — cannot verify the elapsed compliance window', type.cite);
    }
  }

  // --- required contents ---
  const attested = notice.contents ?? {};
  for (const c of type.contents) {
    const v = attested[c.id];
    if (v === true) {
      push(`content:${c.id}`, `Contents: ${c.label}`, 'pass', 'attested present on the notice', c.cite);
    } else if (v === false) {
      push(`content:${c.id}`, `Contents: ${c.label}`, 'fail', 'attested ABSENT from the notice', c.cite);
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
