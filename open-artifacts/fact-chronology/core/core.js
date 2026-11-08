/**
 * fact-chronology core — deterministic timeline construction from dated fact
 * entries. NO LLM: every merge, verification badge, significance tag,
 * conflict flag and gap is reproducible from the input.
 *
 * Plain-JavaScript port of core/chronology.ts (+ the shared textutil
 * utilities); the TypeScript sources stay authoritative for tests.
 * Dependency-free ES module; browser + Node compatible.
 *
 * Responsibilities:
 *   - normalize dates at three precisions (day / month / year) and sort
 *   - carry source anchors (document + quote + pinpoint); quotes are
 *     machine-checked when the document supplies its full text
 *   - de-duplicate near-duplicate same-topic facts (mergeThreshold, never
 *     deletes — mergedFrom preserves absorbed ids; mergeThreshold must stay
 *     strictly above accountSimilarityThreshold, enforced by a throw)
 *   - flag conflicts (date_mismatch, divergent_accounts) and gaps
 *   - tie facts to the case theory (significance 🔴/🟡/⚪, [SME VERIFY])
 *   - carry provenance ([verify] on unverified) and privilege posture
 *   - render working / sof / witness variants; diff two versions
 * @module core
 */

/* ---------- textutil (shared subset; port of core/textutil.ts) ---------- */

/** @param {string} text @returns {string[]} */
export function tokens(text) {
  return tokenizeWithSpans(text).map((t) => t.norm);
}

/** @param {string} text @returns {Array<{ norm: string, start: number, end: number }>} */
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

function multiset(xs) {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** Jaccard similarity between token multisets of two texts.
 * @param {string} a @param {string} b @returns {number} */
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

/** Whitespace-tolerant verbatim containment check on the raw strings.
 * @param {string} source @param {string} quote @returns {boolean} */
export function rawContains(source, quote) {
  const q = quote.trim();
  return q.length > 0 && source.includes(q);
}

/** Slide windows of ~quote length over the source, return the best window.
 * @param {string} source @param {string} quote @param {number} [pad]
 * @returns {{ score: number, coverage: number, start: number, end: number, verbatim: string } | null} */
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
        best = {
          score,
          coverage,
          start: S[st].start,
          end: S[st + size - 1].end,
          verbatim: source.slice(S[st].start, S[st + size - 1].end),
        };
      }
    }
  }
  return best;
}

/* ---------- chronology (port of core/chronology.ts) ---------- */

const DATE_RE = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/;
const APPROX_THRESHOLD = 0.7;
const SIGN_EMOJI = { high: "🔴", medium: "🟡", low: "⚪" };
const PROV_RANK = { document: 0, user: 1, unverified: 2 };

function parseDate(raw) {
  const m = raw.trim().match(DATE_RE);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (mo !== undefined && (Number(mo) < 1 || Number(mo) > 12)) return null;
  if (d !== undefined && (Number(d) < 1 || Number(d) > 31)) return null;
  const precision = d !== undefined ? "day" : mo !== undefined ? "month" : "year";
  const iso = `${y}-${mo ?? "01"}-${d ?? "01"}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return { raw: raw.trim(), iso, precision };
}

function daysBetween(aIso, bIso) {
  return Math.round((Date.parse(`${bIso}T00:00:00Z`) - Date.parse(`${aIso}T00:00:00Z`)) / 86_400_000);
}

function datesCompatible(a, b) {
  if (a.precision === "year" || b.precision === "year") return a.iso.slice(0, 4) === b.iso.slice(0, 4);
  if (a.precision === "month" || b.precision === "month") return a.iso.slice(0, 7) === b.iso.slice(0, 7);
  return a.iso === b.iso;
}

function checkQuote(docText, quote) {
  if (rawContains(docText, quote)) return "verified";
  const w = bestWindow(docText, quote);
  if (w && w.score >= APPROX_THRESHOLD && w.coverage >= APPROX_THRESHOLD) return "approximate";
  return "unfound";
}

function keyTermScore(f, keyTerms) {
  const present = new Set(tokens(`${f.topic ?? ""} ${f.text}`));
  let score = 0;
  for (const term of keyTerms) {
    const toks = tokens(term);
    if (toks.length === 0) continue;
    const missing = toks.filter((t) => !present.has(t)).length;
    if (missing === 0) score += 1;
    else if (toks.length > 1 && missing === 1) score += 0.5; // partial only for multi-token terms
  }
  return score;
}

function significanceFor(f, theory) {
  if (f.significance) return { significance: f.significance, smeVerify: false };
  if (!theory || theory.keyTerms.length === 0) return { significance: null, smeVerify: false };
  const score = keyTermScore(f, theory.keyTerms);
  const significance = score >= 2 ? "high" : score >= 1 ? "medium" : "low";
  return { significance, smeVerify: !Number.isInteger(score) };
}

/** @param {import('./chronology.ts').ChronInput} input */
export function buildChronology(input) {
  const maxGapDays = input.settings?.maxGapDays ?? 90;
  const accountTh = input.settings?.accountSimilarityThreshold ?? 0.35;
  const mergeTh = input.settings?.mergeThreshold ?? 0.6;
  // enforced invariant: a merge must never be able to hide a divergent-accounts conflict
  if (mergeTh <= accountTh) {
    throw new Error(
      `invalid settings: mergeThreshold (${mergeTh}) must be strictly above accountSimilarityThreshold (${accountTh}) — otherwise a merge could hide a divergent-accounts conflict`,
    );
  }
  const docMap = new Map(input.documents.map((d) => [d.id, d]));

  // de-dupe: group near-duplicate facts (same topic + compatible dates + similarity)
  const reps = [];
  for (const f of input.facts) {
    const d = f.date !== undefined ? parseDate(f.date) : null;
    let target = null;
    if (f.topic && d) {
      target =
        reps.find(
          (r) =>
            r.primary.topic === f.topic &&
            r.date !== null &&
            datesCompatible(r.date, d) &&
            similarity(r.primary.text, f.text) >= mergeTh,
        ) ?? null;
    }
    if (target) target.members.push(f);
    else reps.push({ primary: f, members: [f], date: d });
  }

  const unparseableDates = [];
  for (const f of input.facts) {
    if (f.date !== undefined && !parseDate(f.date)) unparseableDates.push({ factId: f.id, raw: f.date });
  }

  const toEntry = (r) => {
    const anchors = [];
    let provRank = -1;
    for (const m of r.members) {
      const doc = docMap.get(m.source.docId);
      const p = m.source.kind ?? "document";
      provRank = Math.max(provRank, PROV_RANK[p]);
      if (!doc) continue;
      anchors.push({
        docId: doc.id,
        docName: doc.name,
        quote: m.source.quote,
        pinpoint: m.source.pinpoint ?? null,
        priv: doc.priv ?? null,
        quoteStatus: doc.text !== undefined ? checkQuote(doc.text, m.source.quote) : null,
      });
    }
    const sig = significanceFor(r.primary, input.theory ?? null);
    const provName = Object.keys(PROV_RANK).find((k) => PROV_RANK[k] === provRank) ?? "document";
    return {
      factId: r.primary.id,
      date: r.date,
      dateLabel: r.primary.dateLabel ?? null,
      topic: r.primary.topic ?? null,
      text: r.primary.text,
      anchor: anchors[0] ?? null,
      anchors,
      mergedFrom: r.members.slice(1).map((m) => m.id),
      significance: sig.significance,
      smeVerify: sig.smeVerify,
      provenance: provName,
      privFlagged: anchors.some((a) => a.priv === "flag"),
      privReview: anchors.some((a) => a.priv === "review"),
    };
  };

  const dated = [];
  const undated = [];
  for (const r of reps) {
    const entry = toEntry(r);
    if (r.date) dated.push({ entry, date: r.date });
    else undated.push(entry);
  }
  dated.sort((a, b) =>
    a.date.iso < b.date.iso ? -1 : a.date.iso > b.date.iso ? 1 : a.entry.factId < b.entry.factId ? -1 : 1,
  );
  const timeline = dated.map((d) => d.entry);

  const conflicts = [];
  const byTopic = new Map();
  for (const r of reps) {
    if (!r.primary.topic) continue;
    const list = byTopic.get(r.primary.topic) ?? [];
    list.push(r.primary);
    byTopic.set(r.primary.topic, list);
  }
  for (const [topic, facts] of byTopic) {
    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const a = facts[i];
        const b = facts[j];
        const da = a.date ? parseDate(a.date) : null;
        const db = b.date ? parseDate(b.date) : null;
        if (da && db && da.precision === "day" && db.precision === "day" && da.iso !== db.iso) {
          conflicts.push({
            topic,
            kind: "date_mismatch",
            factIds: [a.id, b.id],
            detail: `sources disagree on the date of "${topic}": ${a.id} says ${da.raw}, ${b.id} says ${db.raw}`,
          });
          continue;
        }
        const sim = similarity(a.text, b.text);
        if (sim < accountTh) {
          conflicts.push({
            topic,
            kind: "divergent_accounts",
            factIds: [a.id, b.id],
            detail: `accounts of "${topic}" diverge (similarity ${sim.toFixed(2)} < ${accountTh}): "${a.text}" vs "${b.text}"`,
          });
        }
      }
    }
  }

  const gaps = [];
  const dayPrec = dated.filter((d) => d.date.precision === "day");
  for (let i = 1; i < dayPrec.length; i++) {
    const prev = dayPrec[i - 1];
    const cur = dayPrec[i];
    const days = daysBetween(prev.date.iso, cur.date.iso);
    if (days > maxGapDays) {
      gaps.push({ fromIso: prev.date.iso, toIso: cur.date.iso, days, afterFactId: prev.entry.factId, beforeFactId: cur.entry.factId });
    }
  }

  const unfoundQuotes = [...timeline, ...undated].reduce(
    (n, e) => n + e.anchors.filter((a) => a.quoteStatus === "unfound").length,
    0,
  );

  return {
    caseName: input.caseName,
    version: input.version ?? 1,
    posture: input.posture ?? null,
    theory: input.theory ?? null,
    timeline,
    undated,
    unparseableDates,
    conflicts,
    gaps,
    summary: {
      facts: input.facts.length,
      dated: timeline.length,
      undated: undated.length,
      unparseableDates: unparseableDates.length,
      conflicts: conflicts.length,
      gaps: gaps.length,
      merged: input.facts.length - reps.length,
      unfoundQuotes,
    },
  };
}

/** Deterministic diff between two chronology versions (compare by fact id).
 * @param {import('./chronology.ts').ChronOutput} prev @param {import('./chronology.ts').ChronOutput} next */
export function diffChronology(prev, next) {
  const entriesOf = (o) => new Map([...o.timeline, ...o.undated].map((e) => [e.factId, e]));
  const pm = entriesOf(prev);
  const nm = entriesOf(next);
  // ids absorbed by a merge in `next` are not gone — they live on in mergedFrom
  const absorbedInto = new Map();
  for (const e of nm.values()) for (const id of e.mergedFrom) absorbedInto.set(id, e.factId);
  const added = [];
  const removed = [];
  const changed = [];
  for (const id of [...nm.keys()].sort()) if (!pm.has(id)) added.push(id);
  for (const id of [...pm.keys()].sort()) if (!nm.has(id)) removed.push(id);
  for (const id of [...pm.keys()].sort()) {
    if (!nm.has(id)) continue;
    const a = pm.get(id);
    const b = nm.get(id);
    const fields = [];
    if ((a.date?.iso ?? null) !== (b.date?.iso ?? null)) fields.push("date");
    if (a.text !== b.text) fields.push("text");
    if ((a.topic ?? null) !== (b.topic ?? null)) fields.push("topic");
    if (fields.length > 0) changed.push({ factId: id, fields });
  }
  const hasChanges = added.length + removed.length + changed.length > 0;
  const detail = changed.map((c) => `${c.factId}: ${c.fields.join("+")}`).join("; ");
  const label = (id) => (absorbedInto.has(id) ? `${id} (absorbed into ${absorbedInto.get(id)})` : id);
  return {
    fromVersion: prev.version,
    toVersion: hasChanges ? prev.version + 1 : prev.version,
    added,
    removed,
    changed,
    summary: `+${added.length} added (${added.join(", ") || "none"}), -${removed.length} removed (${removed.map(label).join(", ") || "none"}), ~${changed.length} changed${detail ? ` (${detail})` : ""}`,
  };
}

/* ---------- rendering ---------- */

function entryTags(e) {
  const tags = [];
  if (e.smeVerify) tags.push("[SME VERIFY]");
  if (e.provenance === "unverified") tags.push("[verify]");
  return tags.length > 0 ? ` ${tags.join(" ")}` : "";
}

function anchorBadges(a) {
  const parts = [];
  if (a.priv === "flag") parts.push("PRIVILEGE FLAG — review before external use");
  else if (a.priv === "review") parts.push("[priv: review]");
  if (a.quoteStatus === "unfound") parts.push("⚠ quote not found in source text [verify]");
  else if (a.quoteStatus === "approximate") parts.push("quote approximate — near-match only");
  return parts.length > 0 ? ` — ${parts.join(" · ")}` : "";
}

function sourceLine(a) {
  return `Source: ${a.docName}${a.pinpoint ? `, ${a.pinpoint}` : ""} — "${a.quote}"${anchorBadges(a)}`;
}

function sourceBlock(e) {
  if (e.anchors.length === 0) return [];
  const lines = [];
  if (e.anchors.length > 1) {
    lines.push(`Sources (merged from ${e.mergedFrom.join(", ")}):`);
    e.anchors.forEach((a, i) => lines.push(`${i + 1}. ${a.docName}${a.pinpoint ? `, ${a.pinpoint}` : ""} — "${a.quote}"${anchorBadges(a)}`));
  } else {
    lines.push(sourceLine(e.anchors[0]));
  }
  return lines;
}

function heading(e) {
  const d = e.date;
  const sig = e.significance ? ` ${SIGN_EMOJI[e.significance]}` : "";
  return `### ${d.raw} (${d.precision})${e.topic ? ` — ${e.topic}` : ""}${sig}`;
}

/** Markdown chronology — deterministic rendering in three variants.
 * @param {import('./chronology.ts').ChronOutput} out
 * @param {{ format?: 'working' | 'sof' | 'witness' }} [opts] */
export function renderChronology(out, opts = {}) {
  const format = opts.format ?? "working";
  const lines = [];
  const s = out.summary;
  const meta = [`v${out.version}`];
  if (out.posture) meta.push(`Posture ${out.posture}`);

  if (format === "sof") {
    const visible = out.timeline.filter((e) => !e.privFlagged);
    const flagged = out.timeline.length - visible.length;
    lines.push(`# Statement of facts — ${out.caseName}`);
    lines.push("");
    const excluded = [];
    if (flagged > 0) excluded.push(`${flagged} privileged-flagged`);
    if (out.undated.length > 0) excluded.push(`${out.undated.length} undated/unparseable`);
    lines.push(`_From working chronology ${meta.join(" · ")}${excluded.length > 0 ? `; excluded ${excluded.join(", ")} entries` : ""}._`);
    lines.push("");
    for (const e of visible) {
      lines.push(heading(e));
      lines.push("");
      lines.push(`${e.text}${entryTags(e)}`);
      const sb = sourceBlock(e);
      if (sb.length > 0) {
        lines.push("");
        lines.push(...sb);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  if (format === "witness") {
    const visible = [...out.timeline, ...out.undated].filter((e) => !e.privFlagged);
    const flagged = out.timeline.length + out.undated.length - visible.length;
    lines.push(`# Witness preparation timeline — ${out.caseName}`);
    lines.push("");
    lines.push(`_From working chronology ${meta.join(" · ")}${flagged > 0 ? `; excluded ${flagged} privileged-flagged entries` : ""}. Quotes shown verbatim for refresh._`);
    lines.push("");
    for (const e of visible) {
      const when = e.date ? `${e.date.raw} (${e.date.precision})` : e.dateLabel ?? "undated";
      const sig = e.significance ? ` ${SIGN_EMOJI[e.significance]}` : "";
      lines.push(`### ${when}${e.topic ? ` — ${e.topic}` : ""}${sig}`);
      lines.push("");
      lines.push(`${e.text}${entryTags(e)}`);
      for (const a of e.anchors) {
        lines.push("");
        lines.push(`> "${a.quote}" — ${a.docName}${a.pinpoint ? `, ${a.pinpoint}` : ""}${anchorBadges(a)}`);
      }
      lines.push("");
    }
    if (out.conflicts.length > 0) {
      lines.push("## Impeachment flags (potential conflicts — attorney review)");
      lines.push("");
      for (const c of out.conflicts) {
        lines.push(`- **${c.kind}** (${c.topic}): ${c.detail}. Facts: ${c.factIds.join(" vs ")}. [computed from: ${c.factIds.join(", ")}]`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  lines.push(`# Fact chronology — ${out.caseName}`);
  lines.push("");
  if (out.theory) {
    lines.push(`Case theory: ${out.theory.name} · significance 🔴 key / 🟡 supporting / ⚪ background`);
  }
  const summaryBits = [
    `**${s.facts} facts:** ${s.dated} dated`,
    s.merged > 0 ? `${s.merged} merged` : "",
    `${s.undated} undated/unparseable`,
    `${s.conflicts} conflict(s)`,
    `${s.gaps} gap(s)`,
    s.unfoundQuotes > 0 ? `${s.unfoundQuotes} unfound quote(s)` : "",
  ].filter(Boolean);
  lines.push(summaryBits.join(" · "));
  lines.push(`Version ${meta.join(" · ")}`);
  lines.push("");
  lines.push("## Timeline");
  lines.push("");
  for (const e of out.timeline) {
    lines.push(heading(e));
    lines.push("");
    lines.push(`${e.text}${entryTags(e)}`);
    const sb = sourceBlock(e);
    if (sb.length > 0) {
      lines.push("");
      lines.push(...sb);
    }
    lines.push("");
  }
  if (out.undated.length > 0) {
    lines.push("## Undated / unparseable entries");
    lines.push("");
    for (const e of out.undated) {
      const src = e.anchors.length > 0 ? ` — ${sourceLine(e.anchors[0])}` : "";
      lines.push(`- **${e.factId}**${e.dateLabel ? ` (${e.dateLabel})` : ""}: ${e.text}${entryTags(e)}${src}`);
    }
    lines.push("");
  }
  if (out.conflicts.length > 0) {
    lines.push("## Conflicts");
    lines.push("");
    for (const c of out.conflicts) {
      lines.push(`- **${c.kind}** (${c.topic}): ${c.detail}. Facts: ${c.factIds.join(" vs ")}. [computed from: ${c.factIds.join(", ")}]`);
    }
    lines.push("");
  }
  if (out.gaps.length > 0) {
    lines.push("## Gaps");
    lines.push("");
    for (const g of out.gaps) {
      lines.push(`- ${g.days} days between ${g.fromIso} (after ${g.afterFactId}) and ${g.toIso} (before ${g.beforeFactId}). [computed from: ${g.afterFactId}, ${g.beforeFactId}]`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
