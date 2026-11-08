/**
 * intake-benchmark — deterministic core.
 *
 * Benchmarks law-firm intake flows (software OR human/paper) against a
 * configurable rubric: completeness, non-redundancy, fallback quality,
 * speed, retention. Side-by-side comparison table + CSV/MD export.
 * No LLM, no network, no dependencies. Browser + Node ES module.
 *
 * @module core
 */

/**
 * Default rubric weights (sum 1). Any dimension with no data is dropped and
 * the remaining weights renormalize — a human process without measured
 * abandonment is still comparable on the other axes.
 * @type {Readonly<Record<string, number>>}
 */
export const DEFAULT_WEIGHTS = Object.freeze({
  completeness: 0.3,
  non_redundancy: 0.2,
  fallback_quality: 0.2,
  speed: 0.15,
  retention: 0.15,
});

/** Latency target: a flow at or under this scores 100 on speed. Configurable. */
export const DEFAULT_LATENCY_TARGET_SECONDS = 900; // 15 minutes

// ---------------------------------------------------------------------------
// Practice-area canon library.
//
// The data lives HERE (not in a separate canons.js) on purpose: the demo's
// single relative import of core.js gets inlined as a data-URL module by
// deploy/build-site.mjs, and a nested relative import inside such a module
// cannot resolve in browsers. core/canons.js re-exports this API for callers
// that prefer the canon-named module.
//
// ILLUSTRATIVE DATA: field lists and risk tags are plausible defaults, not
// verified law. Jurisdiction and practice requirements vary — edit the canon
// for your scenario before relying on it. [verify] against local rules.
// ---------------------------------------------------------------------------

/** @typedef {'core'|'deadline'|'conflict'} RiskClass */

/**
 * Starter canon per practice area. `deadline` fields drive a clock (notice,
 * hearing, filing, limitations) and are scored as `deadline_capture`;
 * `conflict` fields feed the conflicts check and are scored as
 * `conflict_check`; `core` is everything else.
 * @type {Readonly<Record<string, {name: string, description: string, fields: ReadonlyArray<{name: string, risk_class: RiskClass}>}>>}
 */
export const CANONS = Object.freeze({
  housing: {
    name: 'Housing / tenant intake',
    description: 'Illustrative tenant-side intake (eviction defense, habitability, subsidies). [verify] local notice periods and court deadlines.',
    fields: Object.freeze([
      Object.freeze({ name: 'full_name', risk_class: 'core' }),
      Object.freeze({ name: 'contact_email', risk_class: 'core' }),
      Object.freeze({ name: 'contact_phone', risk_class: 'core' }),
      Object.freeze({ name: 'unit_address', risk_class: 'core' }),
      Object.freeze({ name: 'household_size', risk_class: 'core' }),
      Object.freeze({ name: 'rent_amount', risk_class: 'core' }),
      Object.freeze({ name: 'subsidy_status', risk_class: 'core' }),
      Object.freeze({ name: 'repair_requests', risk_class: 'core' }),
      Object.freeze({ name: 'landlord_name', risk_class: 'conflict' }),
      Object.freeze({ name: 'prior_counsel', risk_class: 'conflict' }),
      Object.freeze({ name: 'notice_date', risk_class: 'deadline' }),
      Object.freeze({ name: 'court_date', risk_class: 'deadline' }),
    ]),
  },
  immigration: {
    name: 'Immigration intake',
    description: 'Illustrative immigration intake (hearings, filings, prior orders). [verify] filing windows against the applicable forum and form.',
    fields: Object.freeze([
      Object.freeze({ name: 'full_name', risk_class: 'core' }),
      Object.freeze({ name: 'date_of_birth', risk_class: 'core' }),
      Object.freeze({ name: 'contact_email', risk_class: 'core' }),
      Object.freeze({ name: 'a_number', risk_class: 'core' }),
      Object.freeze({ name: 'country_of_origin', risk_class: 'core' }),
      Object.freeze({ name: 'current_status', risk_class: 'core' }),
      Object.freeze({ name: 'prior_counsel', risk_class: 'conflict' }),
      Object.freeze({ name: 'related_party_name', risk_class: 'conflict' }),
      Object.freeze({ name: 'hearing_date', risk_class: 'deadline' }),
      Object.freeze({ name: 'filing_deadline', risk_class: 'deadline' }),
      Object.freeze({ name: 'prior_removal_order', risk_class: 'deadline' }),
    ]),
  },
  family: {
    name: 'Family-law intake',
    description: 'Illustrative family-law intake (divorce, custody, support). [verify] statutory filing deadlines and service windows locally.',
    fields: Object.freeze([
      Object.freeze({ name: 'full_name', risk_class: 'core' }),
      Object.freeze({ name: 'contact_phone', risk_class: 'core' }),
      Object.freeze({ name: 'children_names', risk_class: 'core' }),
      Object.freeze({ name: 'marriage_date', risk_class: 'core' }),
      Object.freeze({ name: 'separation_date', risk_class: 'core' }),
      Object.freeze({ name: 'asset_inventory', risk_class: 'core' }),
      Object.freeze({ name: 'safety_concerns', risk_class: 'core' }),
      Object.freeze({ name: 'opposing_party_name', risk_class: 'conflict' }),
      Object.freeze({ name: 'prior_counsel', risk_class: 'conflict' }),
      Object.freeze({ name: 'hearing_date', risk_class: 'deadline' }),
      Object.freeze({ name: 'filing_deadline', risk_class: 'deadline' }),
    ]),
  },
  consumer: {
    name: 'Consumer-debt intake',
    description: 'Illustrative consumer-debt intake (collections defense). [verify] limitations periods and answer deadlines locally.',
    fields: Object.freeze([
      Object.freeze({ name: 'full_name', risk_class: 'core' }),
      Object.freeze({ name: 'contact_email', risk_class: 'core' }),
      Object.freeze({ name: 'debt_amount', risk_class: 'core' }),
      Object.freeze({ name: 'debt_account_number', risk_class: 'core' }),
      Object.freeze({ name: 'debt_collection_practices', risk_class: 'core' }),
      Object.freeze({ name: 'creditor_name', risk_class: 'conflict' }),
      Object.freeze({ name: 'original_creditor', risk_class: 'conflict' }),
      Object.freeze({ name: 'last_payment_date', risk_class: 'deadline' }),
      Object.freeze({ name: 'first_delinquency_date', risk_class: 'deadline' }),
      Object.freeze({ name: 'summons_date', risk_class: 'deadline' }),
    ]),
  },
});

/** IDs of the shipped canons, in catalog order. @returns {string[]} */
export function listCanons() {
  return Object.keys(CANONS);
}

/**
 * Get a practice-area canon by id.
 * @param {string} id
 * @returns {{id: string, name: string, description: string, fields: Array<{name: string, risk_class: RiskClass}>}}
 * @throws {Error} unknown canon id
 */
export function getCanon(id) {
  const c = CANONS[id];
  if (!c) throw new Error(`Unknown canon "${id}". Available: ${listCanons().join(', ')}.`);
  return { id, name: c.name, description: c.description, fields: c.fields.map((f) => ({ ...f })) };
}

/** @param {string} s @returns {string} */
function norm(s) { return String(s).trim().toLowerCase().replace(/[\s-]+/g, '_'); }

/** @param {number} n @returns {number} */
const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n * 100) / 100));

/**
 * Score one intake flow against the scenario's required-field canon.
 *
 * @param {{id: string, name: string, kind?: string,
 *          steps: Array<{id: string, purpose?: string, fields?: string[], latency_seconds?: number, fallback?: string|null}>,
 *          abandonment_rate?: number|null}} flow
 * @param {string[]|Array<{name: string, risk_class: 'core'|'deadline'|'conflict'}>} requiredFields
 *        plain field names, or a tagged canon (risk_class adds the
 *        deadline_capture / conflict_check dimensions and missing_critical)
 * @param {{latencyTargetSeconds?: number}} config
 * @returns {{
 *  id: string, name: string, kind: string,
 *  dimensions: {completeness: number, non_redundancy: number, fallback_quality: number|null, speed: number|null, retention: number|null,
 *    deadline_capture: number|null, conflict_check: number|null},
 *  composite: number,
 *  metrics: {steps: number, field_asks: number, duplicates: number, extra_field_asks: number,
 *    covered_fields: string[], missing_fields: string[], missing_critical: string[],
 *    total_latency_seconds: number|null, abandonment_rate: number|null},
 *  warnings: string[]
 * }}
 * @throws {Error} unknown risk_class tag
 */
export function scoreFlow(flow, requiredFields, config = {}) {
  const warnings = [];
  const steps = flow.steps ?? [];
  if (!Array.isArray(steps) || steps.length === 0) {
    warnings.push('Flow has no steps; completeness is 0 and fallback quality is unscored.');
  }

  // ---- canon: plain names or risk-tagged fields ------------------------
  const raw = requiredFields ?? [];
  const tagged = raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null && 'risk_class' in raw[0];
  /** @type {{name: string, risk_class: 'core'|'deadline'|'conflict'}[]} */
  const taggedFields = [];
  if (tagged) {
    for (const f of raw) {
      if (!f || typeof f.name !== 'string' || !f.name) throw new Error(`Canon field needs a name; got ${JSON.stringify(f)}`);
      if (!['core', 'deadline', 'conflict'].includes(f.risk_class)) {
        throw new Error(`Field "${f.name}" has unknown risk_class ${JSON.stringify(f.risk_class)} (need core|deadline|conflict).`);
      }
      taggedFields.push({ name: norm(f.name), risk_class: f.risk_class });
    }
  }

  // ---- field asks -------------------------------------------------------
  const required = new Set((tagged ? taggedFields.map((f) => f.name) : raw).map(norm));
  const asked = [];
  for (const st of steps) for (const f of st.fields ?? []) asked.push(norm(f));

  const covered = new Set(asked.filter((f) => required.has(f)));
  const missingFields = [...required].filter((f) => !covered.has(f));
  const completeness = required.size ? clamp100((covered.size / required.size) * 100) : 0;

  // ---- risk dimensions (tagged canon only) ------------------------------
  const share = (cls) => {
    const fields = taggedFields.filter((f) => f.risk_class === cls);
    if (!fields.length) return null;
    return clamp100((fields.filter((f) => covered.has(f.name)).length / fields.length) * 100);
  };
  const deadline_capture = tagged ? share('deadline') : null;
  const conflict_check = tagged ? share('conflict') : null;
  const missingCritical = tagged
    ? taggedFields.filter((f) => f.risk_class !== 'core' && !covered.has(f.name)).map((f) => f.name)
    : [];

  const seen = new Set();
  let duplicates = 0;
  for (const f of asked) { if (seen.has(f)) duplicates++; else seen.add(f); }
  const non_redundancy = asked.length ? clamp100((1 - duplicates / asked.length) * 100) : 100;
  const extraFieldAsks = asked.filter((f) => !required.has(f)).length;

  // ---- fallback quality -------------------------------------------------
  let fallback_quality = null;
  if (steps.length) {
    const withFallback = steps.filter((st) => typeof st.fallback === 'string' && st.fallback.trim() !== '');
    fallback_quality = clamp100((withFallback.length / steps.length) * 100);
  }

  // ---- speed ------------------------------------------------------------
  let total_latency = null;
  let speed = null;
  if (steps.length) {
    const missingLatency = steps.filter((st) => typeof st.latency_seconds !== 'number' || st.latency_seconds < 0);
    if (missingLatency.length) warnings.push(`${missingLatency.length} step(s) lack latency_seconds; counted as 0.`);
    total_latency = steps.reduce((s, st) => s + (typeof st.latency_seconds === 'number' ? st.latency_seconds : 0), 0);
    const target = config.latencyTargetSeconds ?? DEFAULT_LATENCY_TARGET_SECONDS;
    speed = clamp100((Math.min(1, target / Math.max(total_latency, 1)) * 100));
  }

  // ---- retention --------------------------------------------------------
  let abandonment = null;
  let retention = null;
  if (flow.abandonment_rate != null) {
    abandonment = Number(flow.abandonment_rate);
    if (!Number.isFinite(abandonment) || abandonment < 0 || abandonment > 1) {
      throw new Error(`Flow "${flow.id}" has invalid abandonment_rate ${JSON.stringify(flow.abandonment_rate)} (need 0–1 or null)`);
    }
    retention = clamp100((1 - abandonment) * 100);
  }

  return {
    id: flow.id, name: flow.name, kind: flow.kind ?? 'unspecified',
    dimensions: { completeness, non_redundancy, fallback_quality, speed, retention, deadline_capture, conflict_check },
    composite: 0, // filled by benchmark()
    metrics: {
      steps: steps.length, field_asks: asked.length, duplicates,
      extra_field_asks: extraFieldAsks,
      covered_fields: [...covered], missing_fields: missingFields,
      missing_critical: missingCritical,
      total_latency_seconds: total_latency, abandonment_rate: abandonment,
    },
    warnings,
  };
}

/**
 * Composite over available dimensions (weights renormalized). When
 * `allowedDims` is set, dimensions outside it are treated as unavailable.
 * @param {{dimensions: Record<string, number|null>, warnings: string[]}} scored
 * @param {Record<string, number>} weights
 * @param {string[]|null} [allowedDims]
 */
function composite(scored, weights, allowedDims = null) {
  const entries = Object.entries(scored.dimensions)
    .filter(([k, v]) => v != null && (allowedDims == null || allowedDims.includes(k)));
  const wSum = entries.reduce((s, [k]) => s + (weights[k] ?? 0), 0);
  if (!(wSum > 0)) return 0;
  const total = entries.reduce((s, [k, v]) => s + (v ?? 0) * (weights[k] ?? 0), 0);
  return clamp100(total / wSum);
}

/**
 * Benchmark two or more intake flows against the same scenario canon.
 *
 * @param {{scenario: {name?: string, required_fields?: string[]|Array<{name: string, risk_class: 'core'|'deadline'|'conflict'}>, canon?: string},
 *          flows: Array<object>,
 *          config?: {latencyTargetSeconds?: number, weights?: Record<string, number>, fairMode?: boolean}}} input
 * @returns {{scenario: string, latencyTargetSeconds: number,
 *   flows: Array<ReturnType<scoreFlow> & {composite: number, rank: number}>,
 *   dimensionOrder: string[], warnings: string[]}}
 * @throws {Error} on fewer than 1 flow, unknown weight keys, unknown canon id, or invalid data
 */
export function benchmark(input) {
  const flows = input?.flows ?? [];
  if (!flows.length) throw new Error('At least one flow is required.');
  const weights = { ...DEFAULT_WEIGHTS, ...input?.config?.weights };
  for (const k of Object.keys(weights)) if (!(k in DEFAULT_WEIGHTS)) throw new Error(`Unknown weight key "${k}"`);
  const latencyTargetSeconds = input?.config?.latencyTargetSeconds ?? DEFAULT_LATENCY_TARGET_SECONDS;

  const warnings = [];
  /** @type {string[]|Array<{name: string, risk_class: 'core'|'deadline'|'conflict'}>} */
  let fields = input.scenario?.required_fields ?? [];
  if (input.scenario?.canon != null) {
    const canon = getCanon(String(input.scenario.canon));
    fields = canon.fields;
    if (input.scenario.required_fields?.length) {
      warnings.push(`canon "${canon.id}" overrides scenario.required_fields (${input.scenario.required_fields.length} entries ignored).`);
    }
    if (!input.scenario?.name) input.scenario.name = canon.name;
  }

  const scored = flows.map((f) => {
    const s = scoreFlow(f, fields, { latencyTargetSeconds });
    return { ...s, composite: composite(s, weights) };
  });

  // ---- fair mode: score everyone only on dimensions every flow has -------
  if (input?.config?.fairMode) {
    const dims = Object.keys(DEFAULT_WEIGHTS);
    const shared = dims.filter((d) => scored.every((s) => s.dimensions[d] != null));
    const excluded = dims.filter((d) => !shared.includes(d));
    if (excluded.length) {
      for (const s of scored) s.composite = composite(s, weights, shared);
      warnings.push(`fair mode: ${excluded.join(', ')} not available in every flow; composites recomputed on the remaining dimensions only.`);
    }
  }

  scored.sort((a, b) => b.composite - a.composite || a.name.localeCompare(b.name));
  scored.forEach((f, i) => { f.rank = i + 1; });

  return {
    scenario: input.scenario?.name ?? 'intake scenario',
    latencyTargetSeconds,
    flows: scored,
    dimensionOrder: ['completeness', 'non_redundancy', 'fallback_quality', 'speed', 'retention', 'deadline_capture', 'conflict_check', 'composite'],
    warnings: [...scored.flatMap((f) => f.warnings.map((w) => `${f.id}: ${w}`)), ...warnings],
  };
}

/**
 * Side-by-side comparison table as CSV.
 * @param {ReturnType<benchmark>} result
 */
export function exportCsv(result) {
  const head = ['dimension', ...result.flows.map((f) => f.name)];
  const rows = [head.join(',')];
  for (const dim of result.dimensionOrder) {
    rows.push([dim, ...result.flows.map((f) => {
      const v = dim === 'composite' ? f.composite : f.dimensions[dim];
      return v == null ? '' : String(v);
    })].join(','));
  }
  rows.push(['rank', ...result.flows.map((f) => String(f.rank))].join(','));
  rows.push(['steps', ...result.flows.map((f) => String(f.metrics.steps))].join(','));
  rows.push(['missing_fields', ...result.flows.map((f) => `"${f.metrics.missing_fields.join('; ')}"`)].join(','));
  return rows.join('\n') + '\n';
}

/**
 * Side-by-side comparison table as Markdown.
 * @param {ReturnType<benchmark>} result
 */
export function exportMd(result) {
  const lines = [`# Intake flow benchmark — ${result.scenario}`, '',
    `Speed target: ${result.latencyTargetSeconds}s. Scores 0–100; blank = no data.`, '',
    `| Dimension | ${result.flows.map((f) => f.name).join(' | ')} |`,
    `|---|${result.flows.map(() => '---:').join('|')}|`];
  for (const dim of result.dimensionOrder) {
    lines.push(`| ${dim} | ${result.flows.map((f) => {
      const v = dim === 'composite' ? f.composite : f.dimensions[dim];
      return v == null ? '—' : String(v);
    }).join(' | ')} |`);
  }
  lines.push('', '## Missing required fields', '');
  for (const f of result.flows) {
    lines.push(`- **${f.name}** (rank ${f.rank}): ${f.metrics.missing_fields.length ? f.metrics.missing_fields.join(', ') : 'none'}`);
  }
  lines.push('', '---', '', '_Deterministic output of the open intake-benchmark rubric. Fictional data; not legal advice._');
  return lines.join('\n');
}

/**
 * Rank-stability analysis: how much the ranking depends on the (somewhat
 * arbitrary) rubric weights. Re-scores the same flows over a deterministic
 * grid of perturbed weights and counts the runs whose #1 flow differs from
 * the baseline winner. The grid has two families, in order:
 *   1. drop runs — one rubric dimension removed entirely (weight 0),
 *      because a reviewer may simply not care about that axis;
 *   2. mix runs — every weight scaled by 1 ± jitter (fixed-seed LCG).
 *
 * Deterministic: the grid is a function of (dims, runs, jitter) only, so the
 * same input always yields identical output.
 *
 * @param {Parameters<benchmark>[0]} input
 * @param {{jitter?: number, runs?: number}} [options] jitter 0–1 (default 0.25), runs ≥ 1 (default 12)
 * @returns {{scenario: string, jitter: number, runs: number, flips: number, flip_rate: number,
 *   verdict: 'robust'|'fragile', baseline: Array<{id: string, name: string, rank: number}>}}
 * @throws {Error} via benchmark(), or on bad options
 */
export function rankStability(input, options = {}) {
  const jitter = options.jitter ?? 0.25;
  const runs = options.runs ?? 12;
  if (!(jitter >= 0) || jitter > 1) throw new Error(`jitter must be within 0–1, got ${jitter}`);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be an integer ≥ 1, got ${runs}`);

  const base = benchmark(input);
  const weights = { ...DEFAULT_WEIGHTS, ...input?.config?.weights };
  const dims = Object.keys(weights);
  const baseWinner = base.flows.find((f) => f.rank === 1)?.id ?? null;

  // Fixed-seed LCG for the mix runs: same grid on every call and platform.
  let seed = 0x2f6e2b1;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

  /** @param {Record<string, number>} w */
  const runGrid = (w) => {
    const reranked = base.flows
      .map((f) => ({ id: f.id, name: f.name, composite: composite(f, w) }))
      .sort((a, b) => b.composite - a.composite || a.name.localeCompare(b.name));
    return reranked[0].id !== baseWinner;
  };

  let flips = 0;
  for (let r = 0; r < runs; r++) {
    /** @type {Record<string, number>} */
    const w = {};
    if (r < dims.length) {
      for (const [k, v] of Object.entries(weights)) w[k] = k === dims[r] ? 0 : v;
    } else {
      for (const [k, v] of Object.entries(weights)) w[k] = Math.max(0.01, v * (1 + jitter * (2 * rand() - 1)));
    }
    if (runGrid(w)) flips++;
  }
  const flip_rate = runs ? flips / runs : 0;
  return {
    scenario: base.scenario,
    jitter, runs, flips,
    flip_rate: Math.round(flip_rate * 10000) / 10000,
    verdict: flips === 0 ? 'robust' : 'fragile',
    baseline: base.flows.map((f) => ({ id: f.id, name: f.name, rank: f.rank })),
  };
}

/** Capture-QA ceiling for a single step latency in seconds (7 days). */
const CAPTURE_LATENCY_CEILING_SECONDS = 7 * 86400;

/**
 * Validate the output of the optional LLM capture step against the documented
 * prompt schema — makes that step auditable instead of trusted.
 * Errors = structural problems (missing flows/steps/ids); warnings = data
 * smells a human should re-check (missing purpose, implausible latencies,
 * out-of-bounds abandonment).
 *
 * @param {{flows?: Array<object>}} json captured JSON
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateCapture(json) {
  const errors = [];
  const warnings = [];
  const flows = json?.flows;
  if (!Array.isArray(flows) || flows.length === 0) {
    errors.push('capture JSON must contain a non-empty "flows" array');
    return { valid: false, errors, warnings };
  }
  for (const f of flows) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !f.id) {
      errors.push('every flow needs a non-empty string "id"');
      continue;
    }
    if (!Array.isArray(f.steps) || f.steps.length === 0) {
      errors.push(`flow "${f.id}": missing non-empty "steps" array`);
    } else {
      for (const st of f.steps) {
        if (!st || typeof st !== 'object' || typeof st.id !== 'string' || !st.id) {
          errors.push(`flow "${f.id}": every step needs a non-empty string "id"`);
          continue;
        }
        if (st.purpose == null || String(st.purpose).trim() === '') {
          warnings.push(`${f.id}/${st.id}: missing purpose — the rubric assumes each step exists for a reason`);
        }
        if (typeof st.latency_seconds === 'number' && st.latency_seconds > CAPTURE_LATENCY_CEILING_SECONDS) {
          warnings.push(`${f.id}/${st.id}: latency_seconds ${st.latency_seconds}s exceeds 7 days — likely elapsed wait time (e.g. mail), not step latency; split or omit`);
        }
      }
    }
    if (f.abandonment_rate != null
      && (typeof f.abandonment_rate !== 'number' || !Number.isFinite(f.abandonment_rate)
        || f.abandonment_rate < 0 || f.abandonment_rate > 1)) {
      warnings.push(`flow "${f.id}": abandonment_rate ${JSON.stringify(f.abandonment_rate)} outside 0–1 — benchmark() will reject it`);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Drift diff between two benchmark() runs of the same flows (e.g. before and
 * after a process change): per-flow composite and per-dimension deltas
 * (after − before) plus rank-change flags. Dimensions missing on either side
 * are omitted rather than guessed.
 *
 * @param {ReturnType<benchmark>} after
 * @param {ReturnType<benchmark>} before
 * @returns {{scenario: string, flows: Array<{id: string, name: string, composite: number,
 *   dimensions: Record<string, number>, rank: {from: number|null, to: number, changed: boolean}}>}}
 */
export function compare(after, before) {
  const beforeById = new Map(before.flows.map((f) => [f.id, f]));
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    scenario: after.scenario,
    flows: after.flows.map((f) => {
      const b = beforeById.get(f.id);
      const dimensions = {};
      for (const [k, v] of Object.entries(f.dimensions)) {
        const bv = b ? b.dimensions[k] : null;
        if (v != null && bv != null) dimensions[k] = round2(v - bv);
      }
      return {
        id: f.id, name: f.name,
        composite: b ? round2(f.composite - b.composite) : round2(f.composite),
        dimensions,
        rank: { from: b ? b.rank : null, to: f.rank, changed: !b || b.rank !== f.rank },
      };
    }),
  };
}
