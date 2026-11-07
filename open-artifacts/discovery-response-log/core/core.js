/**
 * discovery-response-log — deterministic core.
 *
 * Plain-JavaScript ES module, zero dependencies, browser + Node compatible.
 * All deadlines and objection grounds are rules-as-data with FRCP defaults;
 * every jurisdiction-dependent value is configurable and disclaimed.
 *
 * ALL DATA IS FICTIONAL. Not legal advice.
 */

// ---------------------------------------------------------------------------
// Rules-as-data: objection grounds library (FRCP defaults)
// ---------------------------------------------------------------------------

/**
 * Default objection-ground library. FRCP-based US defaults; override or
 * extend per jurisdiction via `config.objectionGrounds`.
 * @typedef {Object} ObjectionGround
 * @property {string} id          stable slug, e.g. "overbroad"
 * @property {string} label       short human label
 * @property {string} authority   default cite (configurable per jurisdiction)
 * @property {string} description plain-language basis
 */

/** @type {ObjectionGround[]} */
export const DEFAULT_OBJECTION_GROUNDS = [
  { id: 'overbroad', label: 'Overly broad', authority: 'FRCP 26(b)(1); Wiginton v. CBRE (N.D. Cal. 2014) standards', description: 'Request not proportional to the needs of the case; scope exceeds permissible discovery.' },
  { id: 'unduly-burdensome', label: 'Unduly burdensome', authority: 'FRCP 26(b)(1)', description: 'Burden or expense of responding outweighs likely benefit.' },
  { id: 'vague-ambiguous', label: 'Vague and ambiguous', authority: 'FRCP 33(a); Davis v. Fendler (9th Cir. 1979) standards', description: 'Terms are undefined so the responding party cannot ascertain what is asked.' },
  { id: 'privileged', label: 'Attorney-client privilege', authority: 'FRCP 26(b)(5); Fed. R. Evid. 502', description: 'Seeks information protected by the attorney-client privilege.' },
  { id: 'work-product', label: 'Work product', authority: 'FRCP 26(b)(3)', description: 'Seeks documents/thoughts prepared in anticipation of litigation.' },
  { id: 'trade-secret', label: 'Trade secret / confidential', authority: 'FRCP 26(c)(1)(G)', description: 'Seeks competitively sensitive or confidential information; protective order may be required.' },
  { id: 'premature', label: 'Premature / subject to further discovery', authority: 'FRCP 26(d)', description: 'Response deferred pending earlier discovery in the sequence.' },
  { id: 'assumes-facts', label: 'Assumes facts not in evidence', authority: 'FRCP 33 practice', description: 'Interrogatory premise is unestablished; responding party objects to the premise.' },
  { id: 'equal-access', label: 'Equally available / better source', authority: 'FRCP 26(b)(1) proportionality', description: 'Information is equally available to the requesting party from its own records.' },
  { id: 'improper-purpose', label: 'Improper purpose', authority: 'FRCP 26(b)(1), 26(g)', description: 'Request appears designed to harass or impose unnecessary burden.' },
];

/**
 * Service methods and their FRCP 6(d) "added time" defaults (days), given
 * interposed under FRCP 5 if permit. FRCP 6(d)(1) adds 3 days for service by
 * mail; electronic service under FRCP 5 gets NO extension after the 2016
 * amendment. State rules differ — override via config.serviceExtensions.
 * @type {Record<string, number>}
 */
export const DEFAULT_SERVICE_EXTENSIONS = {
  electronic: 0,
  personal: 0,
  mail: 3,
  'leave-of-court': 3,
  other: 0,
};

/** Words that mark a response as raising privilege/work-product. */
const PRIVILEGE_MARKERS = [
  'privilege', 'privileged', 'work product', 'attorney-client',
  'withheld', 'withhold', 'redact', 'redacted', 'fre 502', 'fre502',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Add N calendar days to an ISO date string (UTC, timezone-safe).
 * @param {string} isoDate  e.g. "2026-03-10"
 * @param {number} days
 * @returns {string} ISO date
 */
export function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) throw new Error('invalid ISO date: ' + isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Difference in whole calendar days between two ISO dates (b - a).
 * @param {string} aIso
 * @param {string} bIso
 * @returns {number}
 */
export function diffDays(aIso, bIso) {
  const a = new Date(aIso + 'T00:00:00Z').getTime();
  const b = new Date(bIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

// ---------------------------------------------------------------------------
// Deadline math
// ---------------------------------------------------------------------------

/**
 * Compute the response deadline for a discovery set.
 *
 * Defaults mirror FRCP 33/34: responses due 30 days after service of the
 * requests (the day of service is excluded, FRCP 6(a)(1)), plus 3 added days
 * when served by mail (FRCP 6(d)). Jurisdiction rules-as-data override all
 * of this via `config`.
 *
 * @param {Object} params
 * @param {string} params.servedDate      ISO date the requests were served
 * @param {string} [params.serviceMethod] key of config.serviceExtensions
 * @param {Object} [config]
 * @param {number} [config.responseDays=30]
 * @param {Record<string,number>} [config.serviceExtensions]
 * @param {number[]} [config.holidays] ISO holidays skipped only if config.countBusinessDays
 * @returns {{dueDate: string, responseDays: number, extensionDays: number,
 *            serviceMethod: string, ruleBasis: string, calculation: string[]}}
 */
export function calculateDeadline(params, config = {}) {
  const responseDays = config.responseDays ?? 30;
  const ext = { ...DEFAULT_SERVICE_EXTENSIONS, ...(config.serviceExtensions || {}) };
  const method = params.serviceMethod || 'electronic';
  if (!(method in ext)) throw new Error('unknown serviceMethod: ' + method);
  const extensionDays = ext[method];
  // FRCP 6(a)(1): exclude the day of service itself.
  const dueDate = addDays(addDays(params.servedDate, 1), responseDays + extensionDays - 1);
  return {
    dueDate,
    responseDays,
    extensionDays,
    serviceMethod: method,
    ruleBasis: 'FRCP 33(b)(2)/34(b)(2) + FRCP 6(a),(d) — configurable defaults',
    calculation: [
      `service ${params.servedDate} (${method}); day of service excluded (FRCP 6(a)(1))`,
      `+ ${responseDays} days response period (FRCP default 30; configured: ${responseDays})`,
      `+ ${extensionDays} days service-method extension (FRCP 6(d) default for method "${method}")`,
    ],
  };
}

/**
 * Deadline status relative to a check date.
 * @param {string} dueDate
 * @param {string} [asOf=today-ish ISO] ISO date
 * @returns {{status: 'ok'|'due-soon'|'overdue', daysRemaining: number}}
 */
export function deadlineStatus(dueDate, asOf) {
  const days = diffDays(asOf, dueDate);
  const status = days < 0 ? 'overdue' : days <= 7 ? 'due-soon' : 'ok';
  return { status, daysRemaining: days };
}

// ---------------------------------------------------------------------------
// Privilege-safety screen
// ---------------------------------------------------------------------------

/**
 * Screen a draft response for privilege-sensitive content so the draft is
 * never accidentally released with a disclosure of privileged material.
 *
 * @param {string} responseText
 * @returns {{privilegeSafe: boolean, flags: string[]}}
 *   flags is empty when safe; each flag names the marker + a reason.
 */
export function assessPrivilegeSafety(responseText) {
  const text = (responseText || '').toLowerCase();
  const flags = [];
  for (const marker of PRIVILEGE_MARKERS) {
    if (text.includes(marker)) {
      flags.push(`mentions "${marker}" — verify against the privilege log before release; do not describe withheld content here`);
    }
  }
  return { privilegeSafe: flags.length === 0, flags };
}

// ---------------------------------------------------------------------------
// Drafting + versioned rounds (meet and confer)
// ---------------------------------------------------------------------------

let seq = 0;
function nextId(prefix) { seq += 1; return `${prefix}-${String(seq).padStart(3, '0')}`; }

/**
 * Create the v1 draft response entry for one discovery request.
 *
 * @param {Object} request
 * @param {string} request.requestNo        e.g. "RFP 7"
 * @param {string} request.type             'interrogatory'|'rfp'|'rfa'
 * @param {string} request.text             the request text
 * @param {string} [request.responseText]   substantive draft answer
 * @param {string[]} [request.objectionIds] ground ids from the library
 * @param {string} [request.privilegeBasis] short basis if withholding
 * @param {Object} [config]                 supplies the grounds library
 * @returns {import('./core.js').DraftEntry}
 */
export function draftResponse(request, config = {}) {
  const grounds = config.objectionGrounds || DEFAULT_OBJECTION_GROUNDS;
  const byId = new Map(grounds.map((g) => [g.id, g]));
  const objectionIds = (request.objectionIds || []).filter((id) => byId.has(id));
  const unknown = (request.objectionIds || []).filter((id) => !byId.has(id));
  if (unknown.length) throw new Error('unknown objection ground ids: ' + unknown.join(', '));
  const objections = objectionIds.map((id) => byId.get(id));
  const screening = assessPrivilegeSafety(request.responseText || '');
  const withholding = Boolean(request.privilegeBasis);
  return {
    id: nextId('dr'),
    requestNo: request.requestNo,
    type: request.type,
    requestText: request.text,
    responseText: request.responseText || '',
    objections,
    privilegeBasis: request.privilegeBasis || null,
    status: withholding ? 'withheld-logged' : objections.length ? 'objection-and-response' : 'response-only',
    privilegeSafe: withholding ? false : screening.privilegeSafe,
    safetyFlags: withholding
      ? [`withholds on: ${request.privilegeBasis} — must appear on the privilege log (FRCP 26(b)(5))`]
      : screening.flags,
    versions: [
      {
        round: 0,
        label: 'initial draft',
        fields: {
          responseText: request.responseText || '',
          objectionIds,
          privilegeBasis: request.privilegeBasis || null,
        },
        changes: ['initial draft'],
      },
    ],
  };
}

/** Fields tracked across meet-and-confer revisions. */
const TRACKED = ['responseText', 'objectionIds', 'privilegeBasis'];

/**
 * Revise a draft after a meet-and-confer round. Appends a new version with a
 * deterministic field-level diff (old → new) so every concession or narrowing
 * is auditable per round.
 *
 * @param {import('./core.js').DraftEntry} draft
 * @param {Object} patch                   subset of TRACKED fields
 * @param {string} [label]                 e.g. "M&C round 2 — narrowed to 2024"
 * @returns {import('./core.js').DraftEntry} same draft, mutated + returned
 */
export function reviseDraft(draft, patch, label) {
  const prev = draft.versions[draft.versions.length - 1];
  const round = prev.round + 1;
  const changes = [];
  for (const key of TRACKED) {
    if (key in patch) {
      const before = prev.fields[key];
      const after = patch[key];
      const same = JSON.stringify(before) === JSON.stringify(after);
      if (!same) changes.push(`${key}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    }
  }
  if (!changes.length) changes.push('no substantive change recorded this round');
  if (patch.responseText !== undefined) draft.responseText = patch.responseText;
  if (patch.objectionIds !== undefined) {
    const grounds = new Map(DEFAULT_OBJECTION_GROUNDS.map((g) => [g.id, g]));
    draft.objections = patch.objectionIds.filter((id) => grounds.has(id)).map((id) => grounds.get(id));
  }
  if (patch.privilegeBasis !== undefined) draft.privilegeBasis = patch.privilegeBasis;
  const screening = assessPrivilegeSafety(draft.responseText);
  draft.status = draft.privilegeBasis
    ? 'withheld-logged'
    : draft.objections.length ? 'objection-and-response' : 'response-only';
  draft.privilegeSafe = draft.privilegeBasis ? false : screening.privilegeSafe;
  draft.safetyFlags = draft.privilegeBasis
    ? [`withholds on: ${draft.privilegeBasis} — must appear on the privilege log (FRCP 26(b)(5))`]
    : screening.flags;
  draft.versions.push({
    round,
    label: label || `meet-and-confer round ${round}`,
    fields: { ...prev.fields, ...patch },
    changes,
  });
  return draft;
}

// ---------------------------------------------------------------------------
// Log assembly
// ---------------------------------------------------------------------------

/**
 * Build the request/response log for a whole discovery set.
 *
 * @param {Object} params
 * @param {string} params.servedDate
 * @param {string} [params.serviceMethod]
 * @param {Array<Object>} params.requests  passed to draftResponse one by one
 * @param {Object} [config]
 * @returns {{ deadline: Object, entries: import('./core.js').DraftEntry[],
 *             counts: Object, disclaimer: string }}
 */
export function buildLog(params, config = {}) {
  const deadline = calculateDeadline(params, config);
  const entries = params.requests.map((r) => draftResponse(r, config));
  const counts = {
    total: entries.length,
    objectionAndResponse: entries.filter((e) => e.status === 'objection-and-response').length,
    responseOnly: entries.filter((e) => e.status === 'response-only').length,
    withheldLogged: entries.filter((e) => e.status === 'withheld-logged').length,
    privilegeFlags: entries.filter((e) => !e.privilegeSafe).length,
  };
  return {
    deadline,
    entries,
    counts,
    disclaimer:
      'Deadlines and objection grounds use configurable FRCP defaults; verify against the governing ' +
      'state or local rules before reliance. Fictional data. Not legal advice.',
  };
}

// ---------------------------------------------------------------------------
// Export (JSON/markdown)
// ---------------------------------------------------------------------------

/**
 * Render the log as a markdown table for meet-and-confer correspondence.
 * @param {ReturnType<typeof buildLog>} log
 * @returns {string}
 */
export function toMarkdown(log) {
  const lines = [
    `# Discovery response log`,
    ``,
    `Response deadline: **${log.deadline.dueDate}** (${log.deadline.serviceMethod} service, ` +
      `${log.deadline.responseDays}d + ${log.deadline.extensionDays}d ext)`,
    ``,
    `| # | Type | Status | Objections | Privilege-safe |`,
    `|---|------|--------|------------|----------------|`,
  ];
  for (const e of log.entries) {
    const obj = e.objections.map((o) => o.label).join('; ') || '—';
    lines.push(`| ${e.requestNo} | ${e.type} | ${e.status} | ${obj} | ${e.privilegeSafe ? 'yes' : 'FLAG'} |`);
  }
  lines.push('', `_${log.disclaimer}_`);
  return lines.join('\n');
}
