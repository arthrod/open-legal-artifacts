/**
 * playbook-deviation-board core — deterministic clause classification against
 * a company playbook. NO LLM: same playbook + contract always yields the same
 * board.
 *
 * Plain-JavaScript port of core/board.ts + core/yaml.ts (+ the shared
 * textutil subset); the TypeScript sources stay authoritative for tests.
 * Dependency-free ES module; browser + Node compatible.
 *
 * Classification (evaluated per clause, in order):
 *   deal_breaker — clause triggers an `avoid` rule (contains-match, or
 *                  similarity-match at the rule's threshold)
 *   compliant    — clause matches the preferred standard (best-window
 *                  similarity ≥ preferred threshold, and at least as strong as
 *                  the best fallback match)
 *   deviates     — clause matches a fallback tier (reported as that tier), or
 *                  matches nothing in the rule ("beyond playbook")
 *   unclassified — no playbook rule could be assigned (heading doesn't match
 *                  any rule topic and no explicit ruleId)
 * @module core
 */

/* ---------- textutil (shared subset; port of core/textutil.ts) ---------- */

/** @param {string} text */
export function tokenizeWithSpans(text) {
  const toks = [];
  const re = /[^A-Za-z0-9.]+/g;
  let last = 0;
  let m;
  const push = (start, end) => {
    let ls = start;
    let le = end;
    while (ls < le && text[ls] === ".") ls++;
    while (le > ls && text[le - 1] === ".") le--;
    if (le > ls) toks.push({ norm: text.slice(ls, le).toLowerCase(), start: ls, end: le });
  };
  while ((m = re.exec(text)) !== null) {
    push(last, m.index);
    last = m.index + m[0].length;
  }
  push(last, text.length);
  return toks;
}

/** @param {string} text @returns {string[]} */
export function tokens(text) {
  return tokenizeWithSpans(text).map((t) => t.norm);
}

function multiset(xs) {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** @param {string} source @param {string} quote @param {number} [pad] */
export function bestWindow(source, quote, pad = 6) {
  const S = tokenizeWithSpans(source);
  const q = tokens(quote);
  if (S.length === 0 || q.length === 0) return null;
  const qSet = multiset(q);
  let best = null;
  for (let size = Math.max(1, q.length - 2); size <= q.length + pad; size++) {
    for (let st = 0; st + size <= S.length; st++) {
      let inter = 0;
      const wSet = multiset(S.slice(st, st + size).map((t) => t.norm));
      for (const [tok, c] of qSet) inter += Math.min(c, wSet.get(tok) ?? 0);
      const union = q.length + size - inter;
      const score = union === 0 ? 1 : inter / union;
      const coverage = inter / q.length;
      if (best === null || score > best.score || (score === best.score && coverage > best.coverage)) {
        best = { score, coverage, start: S[st].start, end: S[st + size - 1].end, verbatim: source.slice(S[st].start, S[st + size - 1].end) };
      }
    }
  }
  return best;
}

/** @param {string} a @param {string} b @returns {number} */
export function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 && tb.length === 0) return 1;
  if (ta.length === 0 || tb.length === 0) return 0;
  const ma = multiset(ta);
  const mb = multiset(tb);
  let inter = 0;
  for (const [t, c] of ma) inter += Math.min(c, mb.get(t) ?? 0);
  return inter / (ta.length + tb.length - inter);
}

/* ---------- yaml (port of core/yaml.ts) ---------- */

/**
 * Strict YAML subset parser — dependency-free.
 *
 * Supports exactly what structured playbooks need:
 *   - mappings (nested by indentation)
 *   - lists ("- " items, scalars or mappings whose first key sits on the
 *     dash line, continuation keys aligned under it)
 *   - scalars: "double-quoted", 'single-quoted', numbers, true/false, null
 *   - blank lines and full-line # comments
 * Not supported (documented): inline comments, anchors, multi-line blocks,
 * flow collections, "- " items at irregular indentation.
 * @param {string} src
 * @returns {any} YNode
 */
export function parseYaml(src) {
  function scalar(raw) {
    const s = raw.trim();
    if (s === "" || s === "null" || s === "~") return null;
    if (s.startsWith('"') && s.endsWith('"')) {
      try {
        return JSON.parse(s);
      } catch {
        return s.slice(1, -1);
      }
    }
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
    if (s === "true") return true;
    if (s === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }

  const KEY_RE = /^([^:#]+?):\s*(.*)$/;

  const lines = [];
  for (const raw of src.split("\n")) {
    const t = raw.replace(/\r$/, "").replace(/\t/g, "  ");
    if (t.trim() === "" || t.trim().startsWith("#")) continue;
    lines.push(t);
  }
  let i = 0;
  const indentOf = (l) => l.match(/^ */)[0].length;

  function parseMap(ind) {
    const obj = {};
    while (i < lines.length) {
      const l = lines[i];
      const li = indentOf(l);
      if (li !== ind || l.trimStart().startsWith("- ")) break;
      const m = l.slice(li).match(KEY_RE);
      if (!m) throw new Error(`yaml: expected "key: value" at line ${i + 1}: "${l.trim()}"`);
      const key = m[1].trim();
      const val = m[2];
      i++;
      if (val.trim() !== "") {
        obj[key] = scalar(val);
      } else if (i < lines.length && indentOf(lines[i]) > ind) {
        obj[key] = parseBlock(indentOf(lines[i]));
      } else if (i < lines.length && indentOf(lines[i]) === ind && lines[i].trimStart().startsWith("- ")) {
        obj[key] = parseList(ind);
      } else {
        obj[key] = null;
      }
    }
    return obj;
  }

  function parseList(ind) {
    const out = [];
    while (i < lines.length) {
      const l = lines[i];
      const li = indentOf(l);
      if (li !== ind || !l.trimStart().startsWith("- ")) break;
      const rest = l.trimStart().slice(2);
      if (rest.trim() === "") {
        i++;
        if (i < lines.length && indentOf(lines[i]) > ind) out.push(parseBlock(indentOf(lines[i])));
        else out.push(null);
        continue;
      }
      if (KEY_RE.test(rest)) {
        // rewrite "- key: value" as "  key: value" at child indent, then parse a mapping
        lines[i] = " ".repeat(li + 2) + rest;
        out.push(parseMap(li + 2));
      } else {
        i++;
        out.push(scalar(rest));
      }
    }
    return out;
  }

  function parseBlock(ind) {
    if (lines[i].trimStart().startsWith("- ")) return parseList(ind);
    return parseMap(ind);
  }

  if (lines.length === 0) return {};
  const root = parseBlock(indentOf(lines[0]));
  if (i !== lines.length) throw new Error(`yaml: unexpected content at line ${i + 1}: "${lines[i].trim()}"`);
  return root;
}

/* ---------- board (port of core/board.ts) ---------- */

function normContains(haystack, needle) {
  const h = haystack.toLowerCase().replace(/\s+/g, " ");
  const n = needle.toLowerCase().replace(/\s+/g, " ").trim();
  return n.length > 0 && h.includes(n);
}

function numericTokens(text) {
  return text
    .toLowerCase()
    .split(/[^0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => /^[0-9]+(\.[0-9]+)?$/.test(t))
    .sort();
}

function sameMultiset(a, b) {
  return a.length === b.length && a.every((x, idx) => x === b[idx]);
}

function scoreStandard(clauseText, std, tier) {
  const w = bestWindow(clauseText, std.text);
  const stdNums = numericTokens(std.text);
  const winNums = w ? numericTokens(w.verbatim) : [];
  const numericMatch = stdNums.length === 0 || sameMultiset(stdNums, winNums);
  const numericDetail =
    stdNums.length === 0 || numericMatch ? null : `standard requires [${stdNums.join(", ")}] but matched span has [${winNums.join(", ")}]`;
  return {
    tier,
    label: std.label ?? null,
    text: std.text,
    score: w?.score ?? 0,
    numericMatch,
    numericDetail,
    span: w ? { text: w.verbatim, charStart: w.start, charEnd: w.end } : null,
  };
}

/**
 * Classify one clause against one playbook rule.
 * @param {any} clause @param {any} rule @param {{ preferred: number, fallback: number }} th
 * @returns {{ row: any }}
 */
export function classifyClause(clause, rule, th) {
  const approverFor = () => rule.escalation?.approver ?? "__DEFAULT__";

  // 1. avoid rules first — a deal-breaker is a deal-breaker regardless of other matches
  for (const av of rule.avoid) {
    const hit =
      av.mode === "contains"
        ? normContains(clause.text, av.text)
        : similarity(clause.text, av.text) >= (av.threshold ?? 0.8);
    if (hit) {
      return {
        row: {
          clauseId: clause.id,
          ruleId: rule.id,
          classification: "deal_breaker",
          matchedTier: null,
          matchedLabel: null,
          similarity: 1,
          clauseQuote: { text: clause.text, charStart: 0, charEnd: clause.text.length },
          clauseText: clause.text,
          reason: `matches avoid rule${av.id ? ` "${av.id}"` : ""}: ${av.mode === "contains" ? "contains" : "similar to"} "${av.text}"`,
          routedTo: approverFor() === "__DEFAULT__" ? null : approverFor(),
        },
      };
    }
  }

  // 2. score preferred and all fallbacks
  const preferred = scoreStandard(clause.text, rule.preferred, "preferred");
  const fallbacks = rule.fallbacks
    .map((f) => scoreStandard(clause.text, f, f.tier))
    .sort((a, b) => b.score - a.score || Number(a.tier) - Number(b.tier)); // best score, then lowest tier
  const bestFb = fallbacks[0] ?? null;

  if (preferred.score >= th.preferred && preferred.numericMatch && (!bestFb || preferred.score >= bestFb.score)) {
    return {
      row: {
        clauseId: clause.id,
        ruleId: rule.id,
        classification: "compliant",
        matchedTier: "preferred",
        matchedLabel: preferred.label,
        similarity: preferred.score,
        clauseQuote: preferred.span,
        clauseText: clause.text,
        reason: `matches preferred standard${preferred.label ? ` (${preferred.label})` : ""}`,
        routedTo: null,
      },
    };
  }

  const matchedFb = fallbacks.find((f) => f.score >= th.fallback && f.numericMatch) ?? null;
  if (matchedFb) {
    const minTier = rule.escalation?.minFallbackTier ?? Infinity;
    const needsEscalation = rule.escalation !== undefined && Number(matchedFb.tier) >= minTier;
    return {
      row: {
        clauseId: clause.id,
        ruleId: rule.id,
        classification: "deviates",
        matchedTier: matchedFb.tier,
        matchedLabel: matchedFb.label,
        similarity: matchedFb.score,
        clauseQuote: matchedFb.span,
        clauseText: clause.text,
        reason: `matches fallback tier ${matchedFb.tier}${matchedFb.label ? ` (${matchedFb.label})` : ""}, not the preferred standard`,
        routedTo: needsEscalation ? rule.escalation.approver : "__DEFAULT__",
      },
    };
  }

  // 3. beyond playbook — includes skeleton matches whose numbers differ
  const numericNote =
    preferred.score >= th.preferred && !preferred.numericMatch
      ? ` ${preferred.numericDetail}`
      : fallbacks.some((f) => f.score >= th.fallback && !f.numericMatch)
        ? ` ${fallbacks.find((f) => f.score >= th.fallback && !f.numericMatch).numericDetail}`
        : "";
  return {
    row: {
      clauseId: clause.id,
      ruleId: rule.id,
      classification: "deviates",
      matchedTier: null,
      matchedLabel: null,
      similarity: Math.max(preferred.score, bestFb?.score ?? 0),
      clauseQuote: null,
      clauseText: clause.text,
      reason: `no playbook tier matched: clause is beyond the playbook (neither preferred nor any fallback).${numericNote}`,
      routedTo: rule.escalation?.approver ?? "__DEFAULT__",
    },
  };
}

function assignRule(clause, rules, topicTh) {
  if (clause.ruleId !== undefined) {
    const r = rules.find((x) => x.id === clause.ruleId) ?? null;
    return r ? { rule: r, how: "explicit ruleId" } : { rule: null, how: `ruleId "${clause.ruleId}" not found in playbook` };
  }
  if (!clause.heading) return { rule: null, how: "no heading and no ruleId — cannot assign a playbook rule deterministically" };
  let best = null;
  for (const r of rules) {
    const s = similarity(clause.heading, r.topic);
    if (!best || s > best.score) best = { rule: r, score: s };
  }
  if (best && best.score >= topicTh) return { rule: best.rule, how: `heading "${clause.heading}" matched topic "${best.rule.topic}" (similarity ${best.score.toFixed(2)})` };
  return { rule: null, how: `no rule topic matches heading "${clause.heading}" (best similarity ${best ? best.score.toFixed(2) : "n/a"} < ${topicTh})` };
}

/**
 * Build the deviation board for a contract against a playbook.
 * @param {{ playbook: any, contract: { name: string, clauses: any[] }, thresholds?: { preferred?: number, fallback?: number, topic?: number } }} input
 * @returns {any} BoardOutput
 */
export function buildBoard(input) {
  const th = {
    preferred: input.thresholds?.preferred ?? 0.7,
    fallback: input.thresholds?.fallback ?? 0.7,
    topic: input.thresholds?.topic ?? 0.3,
  };
  const rows = input.contract.clauses.map((clause) => {
    const { rule, how } = assignRule(clause, input.playbook.rules, th.topic);
    if (!rule) {
      return {
        clauseId: clause.id,
        heading: clause.heading ?? null,
        ruleId: null,
        classification: "unclassified",
        matchedTier: null,
        matchedLabel: null,
        similarity: 0,
        clauseQuote: null,
        clauseText: clause.text,
        reason: how,
        routedTo: input.playbook.defaultApprover,
      };
    }
    const { row } = classifyClause(clause, rule, th);
    return {
      ...row,
      heading: clause.heading ?? null,
      routedTo: row.routedTo === "__DEFAULT__" ? input.playbook.defaultApprover : row.routedTo,
    };
  });

  const count = (c) => rows.filter((r) => r.classification === c).length;
  return {
    contractName: input.contract.name,
    playbookId: input.playbook.playbookId,
    summary: { compliant: count("compliant"), deviates: count("deviates"), dealBreaker: count("deal_breaker"), unclassified: count("unclassified") },
    rows,
  };
}

/** Markdown board — deterministic rendering.
 * @param {any} board @returns {string} */
export function renderBoard(board) {
  const lines = [];
  lines.push(`# Playbook deviation board — ${board.contractName}`);
  lines.push("");
  lines.push(`Playbook: ${board.playbookId}`);
  lines.push("");
  const s = board.summary;
  lines.push(`**${board.rows.length} clauses:** ${s.compliant} compliant · ${s.deviates} deviate · ${s.dealBreaker} deal-breaker · ${s.unclassified} unclassified`);
  lines.push("");
  lines.push("| Clause | Rule | Classification | Matched tier | Similarity | Routed to |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of board.rows) {
    lines.push(
      `| ${r.clauseId}${r.heading ? ` (${r.heading})` : ""} | ${r.ruleId ?? "—"} | ${r.classification} | ${r.matchedTier ?? "—"} | ${r.similarity.toFixed(2)} | ${r.routedTo ?? "—"} |`,
    );
  }
  lines.push("");
  for (const r of board.rows) {
    if (r.classification === "compliant") continue;
    lines.push(`## ${r.clauseId} — ${r.classification}${r.matchedTier !== null ? ` (tier ${r.matchedTier})` : ""}`);
    lines.push("");
    lines.push(`> ${r.clauseQuote ? r.clauseQuote.text.replace(/\n/g, " ") : r.clauseText.replace(/\n/g, " ")}`);
    lines.push("");
    lines.push(r.reason + ".");
    if (r.routedTo) lines.push(`Routed to: **${r.routedTo}**.`);
    lines.push("");
  }
  return lines.join("\n");
}
