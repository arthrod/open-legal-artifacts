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

/**
 * Deterministic negation/waiver contexts that neutralize a marker hit:
 * "without waiver of privilege and work product", "not privileged",
 * "nothing is withheld", "isn't privileged". Anything not matching these
 * patterns still flags (flag-on-uncertain default; see README for limits).
 */
const NEGATION_BEFORE =
  /\bwithout waiver of\b[\w\s-]*$|\b(?:not|no|non-|nothing|neither|never)\b(?:\s+(?:is|are|was|were|be|been|being|am|a|an|the|any|further|longer))?\s*$|\w+n['’]t\s*$/;

/** True when the text right before a marker hit is a negation/waiver context. */
function isNegatedBefore(text, idx) {
  return NEGATION_BEFORE.test(text.slice(Math.max(0, idx - 48), idx));
}

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
 * @param {Array<{days:number, basis?:string, agreedDate?:string}>} [params.extensions]
 *   FRCP 29(b) stipulated extensions; each adds an audit line to calculation[]
 * @param {Object} [config]
 * @param {number} [config.responseDays=30]
 * @param {Record<string,number>} [config.serviceExtensions]
 * @returns {{dueDate: string, responseDays: number, extensionDays: number,
 *            stipulatedDays: number,
 *            serviceMethod: string, ruleBasis: string, calculation: string[]}}
 */
export function calculateDeadline(params, config = {}) {
  const responseDays = config.responseDays ?? 30;
  const ext = { ...DEFAULT_SERVICE_EXTENSIONS, ...(config.serviceExtensions || {}) };
  const method = params.serviceMethod || 'electronic';
  if (!(method in ext)) throw new Error('unknown serviceMethod: ' + method);
  const extensionDays = ext[method];
  let stipulatedDays = 0;
  const stipulationLines = [];
  for (const s of params.extensions || []) {
    if (!Number.isInteger(s.days) || s.days <= 0) {
      throw new Error('invalid stipulated extension days: ' + JSON.stringify(s.days));
    }
    stipulatedDays += s.days;
    stipulationLines.push(
      `+ ${s.days} days stipulated extension (FRCP 29(b)${s.agreedDate ? ' — agreed ' + s.agreedDate : ''}: ${s.basis || 'stipulation between counsel'})`,
    );
  }
  // FRCP 6(a)(1): exclude the day of service itself.
  const dueDate = addDays(addDays(params.servedDate, 1), responseDays + extensionDays + stipulatedDays - 1);
  return {
    dueDate,
    responseDays,
    extensionDays,
    stipulatedDays,
    serviceMethod: method,
    ruleBasis: 'FRCP 33(b)(2)/34(b)(2) + FRCP 6(a),(d) — configurable defaults',
    calculation: [
      `service ${params.servedDate} (${method}); day of service excluded (FRCP 6(a)(1))`,
      `+ ${responseDays} days response period (FRCP default 30; configured: ${responseDays})`,
      `+ ${extensionDays} days service-method extension (FRCP 6(d) default for method "${method}")`,
      ...stipulationLines,
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
 * Deterministic negation/waiver contexts ("without waiver of privilege",
 * "not privileged", "nothing is withheld") do not flag; anything else that
 * matches a marker flags — flag-on-uncertain default.
 *
 * @param {string} responseText
 * @param {Object} [config]
 * @param {string[]} [config.privilegeMarkers] replace the default marker list
 * @returns {{privilegeSafe: boolean, flags: string[]}}
 *   flags is empty when safe; each flag names the marker + a reason.
 */
export function assessPrivilegeSafety(responseText, config = {}) {
  const text = (responseText || '').toLowerCase();
  const markers = config.privilegeMarkers || PRIVILEGE_MARKERS;
  const flags = [];
  for (const marker of markers) {
    let idx = text.indexOf(marker);
    while (idx !== -1) {
      if (!isNegatedBefore(text, idx)) {
        flags.push(`mentions "${marker}" — verify against the privilege log before release; do not describe withheld content here`);
        break;
      }
      idx = text.indexOf(marker, idx + marker.length);
    }
  }
  return { privilegeSafe: flags.length === 0, flags };
}

// ---------------------------------------------------------------------------
// Citation-manifest check
// ---------------------------------------------------------------------------

/** Bates-style cite: PREFIX NNNN or PREFIX NNNN-NNNN. */
const BATES_CITE = /^([A-Za-z][A-Za-z0-9]*)[ -]?(\d{1,6})(?:\s*-\s*(\d{1,6}))?$/;

/**
 * Check a response's Bates citations against the production manifest
 * (ranges actually produced). A cite outside every manifest range — or not
 * parseable as a Bates cite — is flagged rather than trusted.
 * No manifest configured → no flags (screening is opt-in).
 *
 * @param {string[]} citations
 * @param {Array<{prefix:string, start:number, end:number}>} [manifest]
 * @returns {{citations: string[], citationFlags: string[]}}
 */
export function checkCitations(citations = [], manifest = null) {
  const flags = [];
  if (!manifest || !manifest.length) return { citations: [...citations], citationFlags: flags };
  for (const cite of citations) {
    const m = BATES_CITE.exec(String(cite).trim());
    if (!m) {
      flags.push(`"${cite}" is not a recognizable Bates cite (expected PREFIX 0000-9999) — fix or annotate`);
      continue;
    }
    const [, prefix, start, end] = m;
    const citeStart = Number(start);
    const citeEnd = end === undefined ? citeStart : Number(end);
    if (citeEnd < citeStart) {
      flags.push(`"${cite}" has an inverted range — fix before release`);
      continue;
    }
    const covered = manifest.some(
      (r) => r.prefix.toLowerCase() === prefix.toLowerCase() && citeStart >= r.start && citeEnd <= r.end,
    );
    if (!covered) flags.push(`cite "${cite}" is outside every range in the production manifest — verify the production index`);
  }
  return { citations: [...citations], citationFlags: flags };
}

// ---------------------------------------------------------------------------
// Drafting + versioned rounds (meet and confer)
// ---------------------------------------------------------------------------

/**
 * Deterministic entry id derived from the request number (no module counter —
 * identical inputs produce identical ids regardless of call order).
 */
function idFor(requestNo) {
  const slug = String(requestNo).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('requestNo must contain at least one letter or digit');
  return 'dr-' + slug;
}

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
 * @param {string[]} [request.citations]    Bates cites relied on by the answer
 * @param {Object} [config]                 supplies grounds library + manifest + markers
 * @returns {import('./core.js').DraftEntry}
 */
export function draftResponse(request, config = {}) {
  const grounds = config.objectionGrounds || DEFAULT_OBJECTION_GROUNDS;
  const byId = new Map(grounds.map((g) => [g.id, g]));
  const objectionIds = (request.objectionIds || []).filter((id) => byId.has(id));
  const unknown = (request.objectionIds || []).filter((id) => !byId.has(id));
  if (unknown.length) throw new Error('unknown objection ground ids: ' + unknown.join(', '));
  const objections = objectionIds.map((id) => byId.get(id));
  const screening = assessPrivilegeSafety(request.responseText || '', config);
  const { citations, citationFlags } = checkCitations(request.citations, config.productionManifest);
  const withholding = Boolean(request.privilegeBasis);
  return {
    id: idFor(request.requestNo),
    requestNo: request.requestNo,
    type: request.type,
    requestText: request.text,
    responseText: request.responseText || '',
    citations,
    citationFlags,
    objections,
    privilegeBasis: request.privilegeBasis || null,
    status: withholding ? 'withheld-logged' : objections.length ? 'objection-and-response' : 'response-only',
    reviewState: 'draft',
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
          citations,
        },
        changes: ['initial draft'],
      },
    ],
  };
}

/** Fields tracked across meet-and-confer revisions. */
const TRACKED = ['responseText', 'objectionIds', 'privilegeBasis', 'citations'];

/**
 * Revise a draft after a meet-and-confer round. Appends a new version with a
 * deterministic field-level diff (old → new) so every concession or narrowing
 * is auditable per round.
 *
 * @param {import('./core.js').DraftEntry} draft
 * @param {Object} patch                   subset of TRACKED fields
 * @param {string} [label]                 e.g. "M&C round 2 — narrowed to 2024"
 * @param {Object} [config]                same config as draftResponse (grounds,
 *   productionManifest, privilegeMarkers) — objection ids and citations are
 *   validated against it, and unknown ground ids throw
 * @returns {import('./core.js').DraftEntry} same draft, mutated + returned
 */
export function reviseDraft(draft, patch, label, config = {}) {
  if (patch.objectionIds !== undefined) {
    const grounds = new Map((config.objectionGrounds || DEFAULT_OBJECTION_GROUNDS).map((g) => [g.id, g]));
    const unknown = patch.objectionIds.filter((id) => !grounds.has(id));
    if (unknown.length) throw new Error('unknown objection ground ids: ' + unknown.join(', '));
  }
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
    const grounds = new Map((config.objectionGrounds || DEFAULT_OBJECTION_GROUNDS).map((g) => [g.id, g]));
    draft.objections = patch.objectionIds.map((id) => grounds.get(id));
  }
  if (patch.privilegeBasis !== undefined) draft.privilegeBasis = patch.privilegeBasis;
  if (patch.citations !== undefined) {
    const checked = checkCitations(patch.citations, config.productionManifest);
    draft.citations = checked.citations;
    draft.citationFlags = checked.citationFlags;
  }
  const screening = assessPrivilegeSafety(draft.responseText, config);
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
// Review / release gate
// ---------------------------------------------------------------------------

const REVIEW_STATES = ['draft', 'in-review', 'approved'];

/**
 * Set an entry's review state (draft → in-review → approved). Approving a
 * withholding entry attests it appears on the privilege log (FRCP 26(b)(5)).
 * @param {import('./core.js').DraftEntry} entry
 * @param {'draft'|'in-review'|'approved'} state
 * @returns {import('./core.js').DraftEntry} same entry, mutated + returned
 */
export function setReviewState(entry, state) {
  if (!REVIEW_STATES.includes(state)) throw new Error('invalid reviewState: ' + JSON.stringify(state));
  entry.reviewState = state;
  return entry;
}

/**
 * Code-enforced release gate: throws unless EVERY entry is attorney-approved
 * and privilege-safe. Withholding entries ('withheld-logged') are releasable
 * once approved — approval attests the privilege-log routing — but a draft
 * whose text trips the privilege screen blocks release even when approved.
 * @param {ReturnType<typeof buildLog>} log
 * @returns {true} when releasable
 * @throws {Error} listing every blocking entry
 */
export function assertReleasable(log) {
  const blockers = [];
  for (const e of log.entries) {
    if (e.reviewState !== 'approved') {
      blockers.push(`${e.requestNo}: review state "${e.reviewState}" — attorney approval required before release`);
    } else if (!e.privilegeSafe && e.status !== 'withheld-logged') {
      blockers.push(`${e.requestNo}: privilege-unsafe draft — resolve flags: ${e.safetyFlags.join('; ')}`);
    }
  }
  if (blockers.length) throw new Error('log not releasable:\n- ' + blockers.join('\n- '));
  return true;
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
 * @param {Array<{days:number, basis?:string, agreedDate?:string}>} [params.extensions]
 *   FRCP 29(b) stipulated extensions for the whole set
 * @param {Object} [config]
 * @returns {{ deadline: Object, entries: import('./core.js').DraftEntry[],
 *             counts: Object, disclaimer: string }}
 */
export function buildLog(params, config = {}) {
  const seen = new Set();
  for (const r of params.requests) {
    if (seen.has(r.requestNo)) throw new Error('duplicate requestNo: ' + r.requestNo + ' — request numbers must be unique within a set');
    seen.add(r.requestNo);
  }
  const deadline = calculateDeadline(params, config);
  const entries = params.requests.map((r) => draftResponse(r, config));
  const counts = {
    total: entries.length,
    objectionAndResponse: entries.filter((e) => e.status === 'objection-and-response').length,
    responseOnly: entries.filter((e) => e.status === 'response-only').length,
    withheldLogged: entries.filter((e) => e.status === 'withheld-logged').length,
    privilegeFlags: entries.filter((e) => !e.privilegeSafe).length,
    citationFlags: entries.filter((e) => e.citationFlags.length > 0).length,
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
 * Render the log as a markdown table for meet-and-confer correspondence,
 * plus a per-round diff table for every entry with revision history.
 * @param {ReturnType<typeof buildLog>} log
 * @returns {string}
 */
export function toMarkdown(log) {
  const lines = [
    `# Discovery response log`,
    ``,
    `Response deadline: **${log.deadline.dueDate}** (${log.deadline.serviceMethod} service, ` +
      `${log.deadline.responseDays}d + ${log.deadline.extensionDays}d ext` +
      `${log.deadline.stipulatedDays ? ` + ${log.deadline.stipulatedDays}d stipulated (FRCP 29(b))` : ''})`,
    ``,
    `| # | Type | Status | Objections | Privilege-safe | Review | Cite check |`,
    `|---|------|--------|------------|----------------|--------|------------|`,
  ];
  for (const e of log.entries) {
    const obj = e.objections.map((o) => o.label).join('; ') || '—';
    const cite = e.citationFlags.length ? `FLAG (${e.citationFlags.length})` : 'ok';
    lines.push(`| ${e.requestNo} | ${e.type} | ${e.status} | ${obj} | ${e.privilegeSafe ? 'yes' : 'FLAG'} | ${e.reviewState} | ${cite} |`);
  }
  const revised = log.entries.filter((e) => e.versions.length > 1);
  if (revised.length) {
    lines.push('', `## Meet-and-confer rounds`, ``,
      `| Entry | Round | Label | Changes |`,
      `|-------|-------|-------|---------|`);
    for (const e of revised) {
      for (const v of e.versions) {
        const changes = v.changes.map((c) => c.replace(/\|/g, '\\|')).join('<br>');
        lines.push(`| ${e.requestNo} | ${v.round} | ${v.label} | ${changes} |`);
      }
    }
  }
  lines.push('', `_${log.disclaimer}_`);
  return lines.join('\n');
}

/**
 * CSV export (RFC 4180-style quoting): header + one row per entry.
 * @param {ReturnType<typeof buildLog>} log
 * @returns {string}
 */
export function toCSV(log) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = [['requestNo', 'type', 'status', 'objections', 'privilegeSafe', 'reviewState', 'citationFlags'].join(',')];
  for (const e of log.entries) {
    rows.push([
      e.requestNo,
      e.type,
      e.status,
      e.objections.map((o) => o.label).join('; '),
      e.privilegeSafe ? 'yes' : 'FLAG',
      e.reviewState,
      e.citationFlags.join('; '),
    ].map(esc).join(','));
  }
  return rows.join('\n');
}
