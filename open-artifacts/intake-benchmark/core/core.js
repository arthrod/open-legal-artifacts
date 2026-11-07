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
 * @param {string[]} requiredFields
 * @param {{latencyTargetSeconds?: number}} config
 * @returns {{
 *  id: string, name: string, kind: string,
 *  dimensions: {completeness: number, non_redundancy: number, fallback_quality: number|null, speed: number|null, retention: number|null},
 *  composite: number,
 *  metrics: {steps: number, field_asks: number, duplicates: number, extra_field_asks: number,
 *    covered_fields: string[], missing_fields: string[], total_latency_seconds: number|null, abandonment_rate: number|null},
 *  warnings: string[]
 * }}
 */
export function scoreFlow(flow, requiredFields, config = {}) {
  const warnings = [];
  const steps = flow.steps ?? [];
  if (!Array.isArray(steps) || steps.length === 0) {
    warnings.push('Flow has no steps; completeness is 0 and fallback quality is unscored.');
  }

  // ---- field asks -------------------------------------------------------
  const required = new Set((requiredFields ?? []).map(norm));
  const asked = [];
  for (const st of steps) for (const f of st.fields ?? []) asked.push(norm(f));

  const covered = new Set(asked.filter((f) => required.has(f)));
  const missingFields = [...required].filter((f) => !covered.has(f));
  const completeness = required.size ? clamp100((covered.size / required.size) * 100) : 0;

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
    dimensions: { completeness, non_redundancy, fallback_quality, speed, retention },
    composite: 0, // filled by benchmark()
    metrics: {
      steps: steps.length, field_asks: asked.length, duplicates,
      extra_field_asks: extraFieldAsks,
      covered_fields: [...covered], missing_fields: missingFields,
      total_latency_seconds: total_latency, abandonment_rate: abandonment,
    },
    warnings,
  };
}

/**
 * Composite over available dimensions (weights renormalized).
 * @param {{dimensions: Record<string, number|null>, warnings: string[]}} scored
 * @param {Record<string, number>} weights
 */
function composite(scored, weights) {
  const entries = Object.entries(scored.dimensions).filter(([, v]) => v != null);
  const wSum = entries.reduce((s, [k]) => s + (weights[k] ?? 0), 0);
  if (!(wSum > 0)) return 0;
  const total = entries.reduce((s, [k, v]) => s + (v ?? 0) * (weights[k] ?? 0), 0);
  return clamp100(total / wSum);
}

/**
 * Benchmark two or more intake flows against the same scenario canon.
 *
 * @param {{scenario: {name?: string, required_fields: string[]},
 *          flows: Array<object>,
 *          config?: {latencyTargetSeconds?: number, weights?: Record<string, number>}}} input
 * @returns {{scenario: string, latencyTargetSeconds: number,
 *   flows: Array<ReturnType<scoreFlow> & {composite: number, rank: number}>,
 *   dimensionOrder: string[], warnings: string[]}}
 * @throws {Error} on fewer than 1 flow, unknown weight keys, or invalid data
 */
export function benchmark(input) {
  const flows = input?.flows ?? [];
  if (!flows.length) throw new Error('At least one flow is required.');
  const weights = { ...DEFAULT_WEIGHTS, ...input?.config?.weights };
  for (const k of Object.keys(weights)) if (!(k in DEFAULT_WEIGHTS)) throw new Error(`Unknown weight key "${k}"`);
  const latencyTargetSeconds = input?.config?.latencyTargetSeconds ?? DEFAULT_LATENCY_TARGET_SECONDS;

  const scored = flows.map((f) => {
    const s = scoreFlow(f, input.scenario.required_fields, { latencyTargetSeconds });
    return { ...s, composite: composite(s, weights) };
  });
  scored.sort((a, b) => b.composite - a.composite || a.name.localeCompare(b.name));
  scored.forEach((f, i) => { f.rank = i + 1; });

  return {
    scenario: input.scenario?.name ?? 'intake scenario',
    latencyTargetSeconds,
    flows: scored,
    dimensionOrder: ['completeness', 'non_redundancy', 'fallback_quality', 'speed', 'retention', 'composite'],
    warnings: scored.flatMap((f) => f.warnings.map((w) => `${f.id}: ${w}`)),
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
