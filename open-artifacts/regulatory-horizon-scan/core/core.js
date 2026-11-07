/**
 * regulatory-horizon-scan — deterministic core.
 *
 * Dedupes a JSON feed of regulatory items, classifies by topic/jurisdiction,
 * scores impact with a transparent versioned rubric (rules-as-data), diffs
 * feed snapshots and rubric versions, and exports CSV.
 *
 * Dependency-free plain-JavaScript ES module; browser + Node compatible.
 * No hidden clocks: all time math anchors to a caller-supplied `asOf`.
 * @module core
 */

/* ---------- small shared helpers (self-contained by design) ---------- */

/** Normalize a title for fuzzy comparison: lowercase, collapse non-alphanumerics.
 * @param {string} s
 * @returns {string} */
export function normalizeTitle(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\u2019'`]/g, "") // apostrophes: "children's" == "childrens"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Parse "YYYY-MM-DD" to a UTC date. Returns null when unparseable — never guessed.
 * @param {string|undefined|null} d
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

/** Format a UTC date back to "YYYY-MM-DD".
 * @param {Date} dt
 * @returns {string} */
export function fmtDate(dt) {
  return dt.toISOString().slice(0, 10);
}

/** Whole days from `asOf` to `d` (negative = past). Null-safe.
 * @param {Date|null} d
 * @param {Date} asOf
 * @returns {number|null} */
export function daysUntil(d, asOf) {
  if (!d) return null;
  return Math.round((d.getTime() - asOf.getTime()) / 86400000);
}

/** Normalize a jurisdiction label to an uppercase code with US state support.
 * @param {string} j
 * @returns {string} */
export function normalizeJurisdiction(j) {
  let s = String(j ?? "").trim().toUpperCase().replace(/\./g, "");
  if (["US", "USA", "FED", "FEDERAL", "US-FED"].includes(s)) return "US-FED";
  const m = /^US[- ]([A-Z]{2})$/.exec(s);
  if (m) return US_STATES.has(m[1]) ? `US-${m[1]}` : s;
  if (/^[A-Z]{2}$/.test(s) && US_STATES.has(s)) return `US-${s}`;
  if (US_STATE_NAMES.has(s)) return `US-${US_STATE_NAMES.get(s)}`;
  return s;
}

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ")
);

const US_STATE_NAMES = new Map([
  ["ALABAMA", "AL"], ["ALASKA", "AK"], ["ARIZONA", "AZ"], ["ARKANSAS", "AR"],
  ["CALIFORNIA", "CA"], ["COLORADO", "CO"], ["CONNECTICUT", "CT"], ["DELAWARE", "DE"],
  ["FLORIDA", "FL"], ["GEORGIA", "GA"], ["HAWAII", "HI"], ["IDAHO", "ID"],
  ["ILLINOIS", "IL"], ["INDIANA", "IN"], ["IOWA", "IA"], ["KANSAS", "KS"],
  ["KENTUCKY", "KY"], ["LOUISIANA", "LA"], ["MAINE", "ME"], ["MARYLAND", "MD"],
  ["MASSACHUSETTS", "MA"], ["MICHIGAN", "MI"], ["MINNESOTA", "MN"], ["MISSISSIPPI", "MS"],
  ["MISSOURI", "MO"], ["MONTANA", "MT"], ["NEBRASKA", "NE"], ["NEVADA", "NV"],
  ["NEW HAMPSHIRE", "NH"], ["NEW JERSEY", "NJ"], ["NEW MEXICO", "NM"], ["NEW YORK", "NY"],
  ["NORTH CAROLINA", "NC"], ["NORTH DAKOTA", "ND"], ["OHIO", "OH"], ["OKLAHOMA", "OK"],
  ["OREGON", "OR"], ["PENNSYLVANIA", "PA"], ["RHODE ISLAND", "RI"], ["SOUTH CAROLINA", "SC"],
  ["SOUTH DAKOTA", "SD"], ["TENNESSEE", "TN"], ["TEXAS", "TX"], ["UTAH", "UT"],
  ["VERMONT", "VT"], ["VIRGINIA", "VA"], ["WASHINGTON", "WA"], ["WEST VIRGINIA", "WV"],
  ["WISCONSIN", "WI"], ["WYOMING", "WY"], ["DISTRICT OF COLUMBIA", "DC"],
]);

/* ---------- dedupe ---------- */

/**
 * Dedupe feed items. Two items are duplicates when they share an id, or when
 * their normalized titles are near-identical AND jurisdictions match.
 * First occurrence wins (feed order = trust order); drops are reported.
 * @param {Array<any>} items
 * @returns {{ unique: any[], duplicates: Array<{keptId: string, droppedId: string, reason: string}> }}
 */
export function dedupeItems(items) {
  const unique = [];
  const duplicates = [];
  /** @type {Map<string, string>} normTitle|juris -> kept id */
  const seen = new Map();
  const seenIds = new Set();
  for (const it of items ?? []) {
    const id = String(it.id ?? "");
    const juris = normalizeJurisdiction(it.jurisdiction);
    const key = `${normalizeTitle(it.title)}|${juris}`;
    if (seenIds.has(id)) {
      duplicates.push({ keptId: id, droppedId: id, reason: "duplicate id" });
      continue;
    }
    if (seen.has(key)) {
      duplicates.push({ keptId: seen.get(key), droppedId: id, reason: "same normalized title + jurisdiction" });
      continue;
    }
    seenIds.add(id);
    seen.set(key, id);
    unique.push({ ...it, jurisdiction: juris });
  }
  return { unique, duplicates };
}

/* ---------- classification ---------- */

/**
 * Classify an item's topic using the rubric's keyword taxonomy
 * (first matching topic wins; ties broken by taxonomy insertion order).
 * Always yields a topic: unmatched items fall back to "other".
 * @param {any} item
 * @param {any} rubric — must contain `topicTaxonomy: { [topic]: string[] }`
 * @returns {{ topic: string, jurisdiction: string, matchedKeywords: string[] }}
 */
export function classifyItem(item, rubric) {
  const hay = `${item.title ?? ""} ${item.summary ?? ""}`.toLowerCase();
  const taxonomy = rubric?.topicTaxonomy ?? {};
  /** @type {string[]} */ const matched = [];
  for (const [topic, keywords] of Object.entries(taxonomy)) {
    for (const kw of keywords) {
      if (hay.includes(String(kw).toLowerCase())) {
        matched.push(String(kw));
        return { topic, jurisdiction: normalizeJurisdiction(item.jurisdiction), matchedKeywords: matched };
      }
    }
  }
  return { topic: "other", jurisdiction: normalizeJurisdiction(item.jurisdiction), matchedKeywords: [] };
}

/* ---------- scoring (transparent, versioned, rules-as-data) ---------- */

/**
 * Score one item against the rubric. Returns a 0..100 score with a full
 * per-factor breakdown so every point is auditable.
 * @param {any} item
 * @param {any} rubric — see examples/input.json for the shape
 * @param {any} profile — { jurisdictions: string[], coreTopics: string[], relatedTopics: string[] }
 * @param {string} asOfIso — anchor date "YYYY-MM-DD"
 * @returns {{ score: number, band: string, breakdown: Array<{factor: string, rule: string, points: number, note: string}> }}
 */
export function scoreItem(item, rubric, profile, asOfIso) {
  const asOf = parseDate(asOfIso) ?? new Date(0);
  const cls = classifyItem(item, rubric);
  /** @type {Array<{factor: string, rule: string, points: number, note: string}>} */
  const breakdown = [];

  // Factor 1 — jurisdiction match
  const jf = rubric.factors.find((f) => f.id === "jurisdiction");
  const juris = cls.jurisdiction;
  let jPts = jf.points.other ?? 0;
  let jRule = "no profile jurisdiction match";
  if (profile.jurisdictions.includes(juris)) {
    jPts = jf.points.exact;
    jRule = "exact profile jurisdiction match";
  } else if (juris.startsWith("US-") && profile.jurisdictions.includes("US-FED")) {
    jPts = jf.points.exact; // federal rules apply nationwide
    jRule = "US state rule, but US-FED in profile (federal overlay applies nationwide)";
  } else if (juris.startsWith("EU") && profile.jurisdictions.some((j) => j.startsWith("EU"))) {
    jPts = jf.points.adjacent ?? 0;
    jRule = "adjacent EU jurisdiction";
  }
  breakdown.push({ factor: "jurisdiction", rule: jRule, points: jPts, note: juris });

  // Factor 2 — topic relevance
  const tf = rubric.factors.find((f) => f.id === "topic");
  let tPts = tf.points.other ?? 0;
  let tRule = "topic outside profile";
  if (profile.coreTopics.includes(cls.topic)) {
    tPts = tf.points.core;
    tRule = "core topic";
  } else if ((profile.relatedTopics ?? []).includes(cls.topic)) {
    tPts = tf.points.related ?? 0;
    tRule = "related topic";
  }
  breakdown.push({
    factor: "topic",
    rule: tRule,
    points: tPts,
    note: cls.matchedKeywords.length ? `topic=${cls.topic} via "${cls.matchedKeywords[0]}"` : `topic=${cls.topic}`,
  });

  // Factor 3 — proximity to effective date
  const pf = rubric.factors.find((f) => f.id === "proximity");
  const eff = parseDate(item.effectiveDate ?? null);
  const days = daysUntil(eff, asOf);
  let pPts = pf.points.other ?? 0;
  let pRule = "no parseable effective date";
  let pNote = String(item.effectiveDate ?? "none");
  if (days !== null) {
    const th = (pf.thresholds ?? []).find((t) => days <= t.withinDays);
    if (days < 0) {
      pPts = pf.points.other ?? 0;
      pRule = "already effective";
    } else if (th) {
      pPts = th.points;
      pRule = `effective in ${days}d (<= ${th.withinDays}d threshold)`;
    } else {
      pRule = `effective in ${days}d (beyond all thresholds)`;
    }
    pNote = `${item.effectiveDate} (${days >= 0 ? "+" : ""}${days}d)`;
  }
  breakdown.push({ factor: "proximity", rule: pRule, points: pPts, note: pNote });

  // Factor 4 — rulemaking status
  const sf = rubric.factors.find((f) => f.id === "status");
  const st = String(item.status ?? "").toLowerCase();
  const sPts = sf.points[st] ?? sf.points.other ?? 0;
  breakdown.push({
    factor: "status",
    rule: Object.prototype.hasOwnProperty.call(sf.points, st) ? `status="${st}"` : `unknown status "${st}"`,
    points: sPts,
    note: st,
  });

  const score = Math.min(rubric.maxScore ?? 100, breakdown.reduce((a, b) => a + b.points, 0));
  const band = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return { score, band, breakdown };
}

/* ---------- full scan ---------- */

/**
 * Run the full pipeline: dedupe → classify → score → timeline.
 * @param {Array<any>} items
 * @param {any} rubric
 * @param {any} profile
 * @param {string} asOfIso
 */
export function scanFeed(items, rubric, profile, asOfIso) {
  const { unique, duplicates } = dedupeItems(items);
  const scored = unique.map((it) => {
    const cls = classifyItem(it, rubric);
    const sc = scoreItem(it, rubric, profile, asOfIso);
    return { ...it, topic: cls.topic, jurisdiction: cls.jurisdiction, scoring: sc };
  });
  scored.sort((a, b) => b.scoring.score - a.scoring.score || String(a.title).localeCompare(String(b.title)));
  const timeline = [...scored]
    .filter((it) => it.effectiveDate)
    .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
  return { rubricVersion: rubric.version, asOf: asOfIso, generatedBy: "regulatory-horizon-scan core", items: scored, duplicates, timeline };
}

/* ---------- diffing ---------- */

const DIFF_FIELDS = ["title", "jurisdiction", "status", "effectiveDate", "publishedDate", "summary", "link"];

/**
 * Diff two feed snapshots by item id. Detects added/removed items and
 * field-level changes (this is the "diff view when a rule changes").
 * @param {Array<any>} prev
 * @param {Array<any>} curr
 * @returns {{ added: any[], removed: any[], changed: Array<{id: string, field: string, from: any, to: any}> }}
 */
export function diffFeeds(prev, curr) {
  const prevMap = new Map((prev ?? []).map((i) => [String(i.id), i]));
  const currMap = new Map((curr ?? []).map((i) => [String(i.id), i]));
  const added = [...currMap.values()].filter((i) => !prevMap.has(String(i.id)));
  const removed = [...prevMap.values()].filter((i) => !currMap.has(String(i.id)));
  /** @type {Array<{id: string, field: string, from: any, to: any}>} */
  const changed = [];
  for (const [id, c] of currMap) {
    const p = prevMap.get(id);
    if (!p) continue;
    for (const f of DIFF_FIELDS) {
      const pv = normalizeJurisdictionOrRaw(f, p[f]);
      const cv = normalizeJurisdictionOrRaw(f, c[f]);
      if (String(pv ?? "") !== String(cv ?? "")) changed.push({ id, field: f, from: pv ?? null, to: cv ?? null });
    }
  }
  return { added, removed, changed };
}

function normalizeJurisdictionOrRaw(field, v) {
  return field === "jurisdiction" ? normalizeJurisdiction(v) : v;
}

/**
 * Diff two rubric versions: weight/taxonomy changes with from/to values.
 * @param {any} prev
 * @param {any} curr
 * @returns {Array<{path: string, from: any, to: any}>}
 */
export function diffRubrics(prev, curr) {
  /** @type {Array<{path: string, from: any, to: any}>} */
  const out = [];
  if (prev.version !== curr.version) out.push({ path: "version", from: prev.version, to: curr.version });
  const pf = new Map((prev.factors ?? []).map((f) => [f.id, f]));
  for (const cf of curr.factors ?? []) {
    const p = pf.get(cf.id);
    if (!p) {
      out.push({ path: `factors.${cf.id}`, from: null, to: cf });
      continue;
    }
    out.push(...diffPoints(`factors.${cf.id}.points`, p.points ?? {}, cf.points ?? {}));
    const pt = JSON.stringify(p.thresholds ?? []);
    const ct = JSON.stringify(cf.thresholds ?? []);
    if (pt !== ct) out.push({ path: `factors.${cf.id}.thresholds`, from: p.thresholds ?? [], to: cf.thresholds ?? [] });
  }
  for (const p of prev.factors ?? []) if (!(curr.factors ?? []).some((f) => f.id === p.id)) out.push({ path: `factors.${p.id}`, from: p, to: null });
  const taxKeys = new Set([...Object.keys(prev.topicTaxonomy ?? {}), ...Object.keys(curr.topicTaxonomy ?? {})]);
  for (const k of taxKeys) {
    const a = JSON.stringify(prev.topicTaxonomy?.[k] ?? null);
    const b = JSON.stringify(curr.topicTaxonomy?.[k] ?? null);
    if (a !== b) out.push({ path: `topicTaxonomy.${k}`, from: prev.topicTaxonomy?.[k] ?? null, to: curr.topicTaxonomy?.[k] ?? null });
  }
  if ((prev.maxScore ?? 100) !== (curr.maxScore ?? 100)) out.push({ path: "maxScore", from: prev.maxScore ?? 100, to: curr.maxScore ?? 100 });
  return out;
}

function diffPoints(path, a, b) {
  const out = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) out.push({ path: `${path}.${k}`, from: a[k] ?? null, to: b[k] ?? null });
  }
  return out;
}

/* ---------- export ---------- */

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export a scan result as CSV (rank order; scoring breakdown serialized).
 * @param {any} scan — output of scanFeed
 * @returns {string}
 */
export function toCsv(scan) {
  const header = ["rank", "id", "title", "jurisdiction", "topic", "status", "effectiveDate", "score", "band", "scoringRules", "link"];
  const rows = (scan.items ?? []).map((it, i) => [
    i + 1,
    it.id,
    it.title,
    it.jurisdiction,
    it.topic,
    it.status,
    it.effectiveDate ?? "",
    it.scoring.score,
    it.scoring.band,
    it.scoring.breakdown.map((b) => `${b.factor}:${b.points} (${b.rule})`).join(" | "),
    it.link ?? "",
  ]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";
}
