/**
 * Worked example — employee non-compete enforceability, 51 jurisdictions
 * (US states + DC) × 5 questions = 255 cells, generated deterministically
 * from a compact seed table so the demo ships a full-scale matrix in a few
 * KB. Classic script (not ESM) so the single-file build inlines it raw.
 * ALL data is fictional: statutes are "…-analog", URLs use the reserved
 * domain fictional.example, and the verification-date spread (verified /
 * stale / unverified) is derived from a stable hash of (jurisdiction,
 * question) — no clock, no randomness, identical output on every load.
 */
const AS_OF = "2026-11-07";

// [code, name, enforceable y|n|c, maxMonths, bluePencil y|n, consideration y|n, wageFloorK]
const J = [
  ["US-AL", "Alabama", "y", 24, "y", "n", 0], ["US-AK", "Alaska", "c", 12, "n", "y", 0],
  ["US-AZ", "Arizona", "y", 12, "y", "n", 0], ["US-AR", "Arkansas", "y", 24, "y", "n", 0],
  ["US-CA", "California", "n", 0, "n", "n", 0], ["US-CO", "Colorado", "n", 0, "n", "n", 74],
  ["US-CT", "Connecticut", "c", 12, "y", "y", 0], ["US-DE", "Delaware", "c", 12, "y", "y", 0],
  ["US-DC", "District of Columbia", "n", 0, "n", "n", 0], ["US-FL", "Florida", "c", 12, "y", "n", 0],
  ["US-GA", "Georgia", "y", 24, "y", "n", 0], ["US-HI", "Hawaii", "c", 12, "n", "y", 0],
  ["US-ID", "Idaho", "c", 18, "y", "n", 0], ["US-IL", "Illinois", "y", 24, "y", "y", 0],
  ["US-IN", "Indiana", "c", 12, "y", "n", 0], ["US-IA", "Iowa", "c", 12, "y", "n", 0],
  ["US-KS", "Kansas", "c", 12, "y", "n", 0], ["US-KY", "Kentucky", "c", 12, "y", "n", 0],
  ["US-LA", "Louisiana", "c", 12, "y", "y", 0], ["US-ME", "Maine", "c", 24, "n", "n", 0],
  ["US-MD", "Maryland", "c", 12, "y", "y", 0], ["US-MA", "Massachusetts", "c", 12, "y", "n", 75],
  ["US-MI", "Michigan", "c", 12, "y", "n", 0], ["US-MN", "Minnesota", "c", 12, "y", "n", 40],
  ["US-MS", "Mississippi", "y", 24, "y", "n", 0], ["US-MO", "Missouri", "c", 12, "y", "n", 0],
  ["US-MT", "Montana", "c", 24, "n", "n", 0], ["US-NE", "Nebraska", "c", 12, "y", "n", 0],
  ["US-NV", "Nevada", "c", 12, "y", "n", 0], ["US-NH", "New Hampshire", "c", 12, "y", "n", 0],
  ["US-NJ", "New Jersey", "c", 12, "y", "y", 0], ["US-NM", "New Mexico", "c", 12, "y", "n", 0],
  ["US-NY", "New York", "n", 0, "n", "n", 0], ["US-NC", "North Carolina", "y", 12, "y", "n", 0],
  ["US-ND", "North Dakota", "c", 12, "y", "n", 0], ["US-OH", "Ohio", "c", 12, "y", "n", 0],
  ["US-OK", "Oklahoma", "c", 12, "y", "n", 0], ["US-OR", "Oregon", "n", 0, "n", "n", 0],
  ["US-PA", "Pennsylvania", "c", 24, "y", "y", 0], ["US-RI", "Rhode Island", "c", 12, "y", "n", 0],
  ["US-SC", "South Carolina", "y", 24, "y", "n", 0], ["US-SD", "South Dakota", "y", 24, "y", "n", 0],
  ["US-TN", "Tennessee", "c", 12, "y", "n", 0], ["US-TX", "Texas", "c", 24, "y", "n", 0],
  ["US-UT", "Utah", "c", 12, "y", "n", 0], ["US-VT", "Vermont", "c", 12, "y", "y", 0],
  ["US-VA", "Virginia", "c", 12, "y", "n", 0], ["US-WA", "Washington", "n", 0, "n", "n", 110],
  ["US-WV", "West Virginia", "c", 12, "y", "n", 0], ["US-WI", "Wisconsin", "c", 12, "y", "n", 0],
  ["US-WY", "Wyoming", "y", 24, "y", "n", 0],
];

const Q = [
  { id: "enforce", text: "Are employee non-compete covenants enforceable?" },
  { id: "term", text: "Longest presumptively reasonable duration?" },
  { id: "scope", text: "May a court narrow (blue-pencil) an overbroad covenant?" },
  { id: "consideration", text: "Is independent consideration required at signing?" },
  { id: "wagefloor", text: "Annual wage floor below which covenants are void?" },
];

const BY = ["R. Castellan", "M. Delacroix", "A. Fern", "H. Whitlock", "L. Andrade"];

function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0; return h; }
function isoMinusDays(iso, d) { return new Date(Date.parse(iso) - d * 86400000).toISOString().slice(0, 10); }

function content(j, q, h) {
  const [code, name, enf, months, blue, cons, wage] = j;
  const sec = 1000 + (h % 900);
  const cite = `Fictional ${name} statutes-analog § ${sec}`;
  const url = `https://fictional.example/${code.toLowerCase()}/noncompete/${q}`;
  let answer, quote;
  if (q === "enforce") {
    answer = enf === "y" ? "Generally enforceable when reasonable in time and scope (fictionalized)."
      : enf === "n" ? "Void for most workers under the fictionalized statute-analog."
      : "Enforceable only with adequate consideration and reasonable scope (fictionalized).";
    quote = `Fictional ${name} statutes-analog § ${sec}: a covenant not to compete is ${enf === "y" ? "enforceable if it is reasonable" : enf === "n" ? "void, with limited exceptions" : "enforceable only to the extent reasonable and supported by consideration"}.`;
  } else if (q === "term") {
    answer = enf === "n" ? "Duration is moot — covenants are void for most workers (fictionalized)."
      : `Up to ${months} months presumptively reasonable (fictionalized).`;
    quote = `Fictional ${name} statutes-analog § ${sec}: no covenant shall exceed ${months} months in duration.`;
  } else if (q === "scope") {
    answer = blue === "y" ? "Yes — courts may blue-pencil overbroad terms (fictionalized)."
      : "No — overbroad covenants are void without reformation (fictionalized).";
    quote = `Fictional ${name} statutes-analog § ${sec}: courts ${blue === "y" ? "may reform" : "shall not reform"} an otherwise unreasonable covenant.`;
  } else if (q === "consideration") {
    answer = cons === "y" ? "Yes — independent consideration required at signing (fictionalized)."
      : "Continued employment suffices; no independent consideration required (fictionalized).";
    quote = `Fictional ${name} statutes-analog § ${sec}: a covenant is supported by ${cons === "y" ? "independent consideration provided at signing" : "continued employment"}.`;
  } else {
    answer = wage > 0 ? `Void below an annual wage of $${wage},000 for the worker (fictionalized).`
      : "No statutory wage floor in the fictionalized statute-analog.";
    quote = wage > 0
      ? `Fictional ${name} statutes-analog § ${sec}: no covenant shall be enforceable against a worker earning less than $${wage},000 annually.`
      : `Fictional ${name} statutes-analog § ${sec}: the chapter applies regardless of the worker's earnings.`;
  }
  return { answer, citation: cite, sourceUrl: url, quotedText: quote };
}

const cells = [];
for (const j of J) {
  for (const q of Q) {
    const h = hash(`${j[0]}:${q.id}`);
    const c = { jurisdiction: j[0], question: q.id, ...content(j, q.id, h) };
    const b = h % 10;
    if (b >= 9) { c.answer = ""; c.citation = ""; c.sourceUrl = ""; c.quotedText = ""; c.verifiedDate = null; } // never guessed
    else if (b === 8) { delete c.citation; delete c.sourceUrl; c.verifiedDate = isoMinusDays(AS_OF, 30 + (h % 60)); } // answer, no source → unverified
    else if (b >= 6) { c.verifiedDate = isoMinusDays(AS_OF, 200 + (h % 150)); c.verifiedBy = BY[h % 5]; } // stale
    else { c.verifiedDate = isoMinusDays(AS_OF, 10 + (h % 150)); c.verifiedBy = BY[h % 5]; } // verified
    cells.push(c);
  }
}

const EXAMPLE = {
  asOf: AS_OF,
  survey: {
    topic: "Employee non-compete enforceability — 51 jurisdictions × 5 questions (fictionalized survey for Meridian Fabrication Co.)",
    policy: { maxAgeDays: 180 },
    jurisdictions: J.map((j) => j[0]),
    questions: Q,
    cells,
  },
};
