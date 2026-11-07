/**
 * client-intake demo core — deterministic simulation of the live Val Town app
 * (artifacts/client-intake). No LLM, no network: the "AI proposal" stage is a
 * rules catalog keyed by matter area (mirroring shared/catalog.ts of the real
 * app), and conflict-party extraction / urgency flags / the firm summary are
 * pure functions of the confirmed answers. All example data is fictional.
 *
 * Runs in the browser (ES module) and under node --test.
 */

// ------------------------------------------------------------- personas

/** Who is filling this out — tunes tone. Mirrors PERSONA_OPTIONS in the app. */
export const PERSONAS = [
  {
    id: "client",
    label: "I need legal help",
    blurb: "You're describing your own situation. We'll keep it plain and explain any legal terms.",
  },
  {
    id: "staff",
    label: "I'm firm staff",
    blurb: "You're taking an intake for the firm. We'll move quickly and use standard terminology.",
  },
];

// --------------------------------------------------------- matter areas

/**
 * Matter areas offered in this demo — a subset of the live app's 12
 * (family, criminal, PI, employment, immigration, estate, business, real
 * estate, landlord/tenant, IP, bankruptcy, other).
 */
export const AREAS = [
  { id: "landlord_tenant", label: "Landlord / tenant dispute", blurb: "Leases, evictions, deposits, repairs." },
  { id: "employment", label: "Employment dismissal", blurb: "Being fired, layoffs, discrimination, wages." },
  { id: "contract_breach", label: "Contract breach", blurb: "A broken agreement between people or businesses." },
  { id: "personal_injury", label: "Personal injury", blurb: "Accidents, injuries, insurance claims." },
  { id: "immigration", label: "Immigration status question", blurb: "Visas, green cards, deportation, citizenship." },
];

/** Neutral one-line description used in the firm-facing summary. */
const AREA_PHRASES = {
  landlord_tenant: "a dispute with a landlord or property manager",
  employment: "a workplace dismissal or employment dispute",
  contract_breach: "a breach-of-contract dispute",
  personal_injury: "an injury from an accident",
  immigration: "an immigration-status question",
};

export function areaLabel(area) {
  return AREAS.find((a) => a.id === area)?.label ?? "Legal matter";
}

// ------------------------------------------------------------ questions

/**
 * Field catalog — ids, labels and help text mirror INTAKE_FIELD_META in the
 * live app. `type` is the demo's simplified input type: text | choice | date.
 */
export const FIELD_META = {
  full_name: { label: "Your full name", help: "The name to open the file under.", type: "text" },
  contact_method: {
    label: "Best way to reach you",
    help: "Phone, email, or text.",
    type: "choice",
    options: ["Phone call", "Email", "Text message"],
  },
  contact_detail: { label: "Contact details", help: "The number or email address.", type: "text" },
  opposing_parties: {
    label: "Who is on the other side?",
    help: "The other people or companies involved — needed for a conflict check.",
    type: "text",
  },
  other_parties: {
    label: "Anyone else involved?",
    help: "Related people or entities (family, witnesses, insurers, co-owners).",
    type: "text",
  },
  jurisdiction: { label: "Where did this happen / where do you live?", help: "State, county, or country.", type: "text" },
  key_dates: {
    label: "Any important dates or deadlines?",
    help: "Court dates, incident date, notice dates — even approximate.",
    type: "date",
  },
  documents: { label: "What documents do you have?", help: "Contracts, notices, police reports, correspondence, filings.", type: "text" },
  desired_outcome: { label: "What outcome are you hoping for?", help: "In your own words.", type: "text" },
  urgency: {
    label: "How time-sensitive is this?",
    help: null,
    type: "choice",
    options: [
      { id: "emergency", label: "Emergency — today / this week" },
      { id: "urgent", label: "Urgent — there's a deadline soon" },
      { id: "soon", label: "Soon — within a month or so" },
      { id: "routine", label: "No rush — planning ahead" },
      { id: "unsure", label: "Not sure" },
    ],
  },
  budget: { label: "Any budget or fee expectations?", help: "Optional.", type: "text" },
  matter_detail: { label: "Anything else we should know?", help: "Details that don't fit above.", type: "text" },
};

/** Base fields elicited for every matter, in order (mirrors BASE_FIELDS). */
const BASE_FIELDS = [
  "full_name",
  "contact_method",
  "contact_detail",
  "opposing_parties",
  "jurisdiction",
  "desired_outcome",
  "urgency",
  "matter_detail",
];

/** Area-specific fields inserted before `desired_outcome` (mirrors AREA_EXTRA). */
const AREA_EXTRA = {
  landlord_tenant: ["key_dates", "documents"],
  employment: ["key_dates", "documents"],
  contract_breach: ["other_parties", "documents", "key_dates"],
  personal_injury: ["key_dates", "other_parties", "documents"],
  immigration: ["key_dates", "documents"],
};

/** Fields the user must always answer (mirrors REQUIRED_INTAKE_FIELDS). */
const REQUIRED_FIELDS = new Set(["full_name", "contact_detail", "opposing_parties"]);

/** Generic suggestion drafts when an area pack has none (mirrors seedSuggestions). */
const GENERIC_DRAFTS = {
  full_name: "Your full legal name",
  contact_method: "Phone call",
  contact_detail: "Phone number or email address",
  opposing_parties: "The other person or company's full name",
  other_parties: "No one else so far",
  jurisdiction: "The state I live in",
  key_dates: "",
  documents: "A notice or letter I received",
  desired_outcome: "Resolve this as quickly as possible",
  urgency: "unsure",
  budget: "Not sure yet",
  matter_detail: "Nothing else for now",
};

/**
 * Area packs — the deterministic stand-in for the live app's gpt-5-nano
 * elicitation: an intro, an empathy note (client persona only; "" for staff,
 * exactly like the app), and concrete suggestion drafts grounded in a typical
 * fictional matter of that area.
 */
const AREA_PACKS = {
  landlord_tenant: {
    intro: "A few quick questions so we can open your file correctly and run the conflict check.",
    empathy_note: "Facing an eviction or a deposit dispute is stressful — let's take it one step at a time.",
    drafts: {
      opposing_parties: "Copperfield Property Management LLC",
      jurisdiction: "Franklin County, Ohio",
      key_dates: "2026-11-18",
      documents: "Lease, eviction notice, rent receipts",
      desired_outcome: "Stop the eviction and stay in my apartment",
      urgency: "urgent",
      matter_detail: "Repairs have been ignored for months; I withheld part of one rent payment",
    },
  },
  employment: {
    intro: "Let's capture the essentials of the dismissal so the firm can evaluate it quickly.",
    empathy_note: "Losing a job unexpectedly is a lot to deal with — we'll keep this short.",
    drafts: {
      opposing_parties: "Brightpath Solar LLC",
      jurisdiction: "Denmore County, Oregon",
      key_dates: "2026-12-01",
      documents: "Offer letter, termination letter, pay stubs",
      desired_outcome: "Understand my rights after being let go",
      urgency: "soon",
      matter_detail: "Dismissed two weeks after raising a safety concern",
    },
  },
  contract_breach: {
    intro: "A few questions about the agreement so we can check for conflicts and deadlines.",
    empathy_note: "",
    drafts: {
      opposing_parties: "Delgado and Sons Trucking LLC",
      other_parties: "Harbor Regional Warehouse (where the goods were stored)",
      jurisdiction: "Bay County, Michigan",
      key_dates: "2026-09-15",
      documents: "Signed contract, delivery invoices, email thread",
      desired_outcome: "Payment for the work we completed",
      urgency: "soon",
      matter_detail: "Deliveries were accepted but the final invoice was never paid",
    },
  },
  personal_injury: {
    intro: "Let's get the incident on file — dates and parties matter most here.",
    empathy_note: "I'm sorry this happened. We'll gather the facts and let the firm take it from there.",
    drafts: {
      opposing_parties: "Sable Insurance Company",
      other_parties: "Dr. Priya Natarajan (treating physician)",
      jurisdiction: "Alder County, Colorado",
      key_dates: "2026-08-14",
      documents: "Police report, medical records, photos",
      desired_outcome: "Cover my medical bills and lost wages",
      urgency: "soon",
      matter_detail: "Rear-ended at a stoplight; back injury still under treatment",
    },
  },
  immigration: {
    intro: "A few questions so the firm can see the status question clearly before your consultation.",
    empathy_note: "Immigration paperwork can feel overwhelming — plain answers are enough here.",
    drafts: {
      opposing_parties: "U.S. Citizenship and Immigration Services (USCIS)",
      jurisdiction: "Chicago, Illinois",
      key_dates: "2027-01-15",
      documents: "Visa approval notice, I-94 record, prior filings",
      desired_outcome: "Confirm my status options before my visa expires",
      urgency: "soon",
      matter_detail: "Employer-sponsored visa expiring soon; renewal filed but unanswered",
    },
  },
};

/** Ordered, de-duped field ids for a matter area (port of fieldsForArea). */
export function fieldsForArea(area) {
  const extra = AREA_EXTRA[area] ?? [];
  const out = [];
  const seen = new Set();
  const push = (id) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  const splitAt = BASE_FIELDS.indexOf("desired_outcome");
  BASE_FIELDS.slice(0, splitAt).forEach(push);
  extra.forEach(push);
  BASE_FIELDS.slice(splitAt).forEach(push);
  return out;
}

/**
 * The simulated AI proposal: the intake questions for a matter area, each with
 * a suggested answer draft. Deterministic — same area in, same proposal out.
 *
 * @param {string} area one of AREAS ids
 * @param {{contactName?: string}} [context] optional grounding: a name
 *   captured before elicitation seeds the full_name draft (the app does this
 *   with `brief.contact_name`).
 * @returns {{area: string, areaLabel: string, intro: string, empathyNote: string,
 *   questions: Array<{id: string, label: string, help: string|null,
 *   type: 'text'|'choice'|'date', options: (string|{id:string,label:string})[]|null,
 *   required: boolean, draft: string}>}}
 * @throws if the area id is unknown
 */
export function proposeQuestions(area, context) {
  const pack = AREA_PACKS[area];
  if (!pack) throw new Error(`unknown matter area "${area}"`);
  const questions = fieldsForArea(area).map((id) => {
    const meta = FIELD_META[id];
    let draft = pack.drafts[id] ?? GENERIC_DRAFTS[id] ?? "";
    if (id === "full_name" && context?.contactName) draft = context.contactName;
    return {
      id,
      label: meta.label,
      help: meta.help,
      type: meta.type,
      options: meta.options ?? null,
      required: REQUIRED_FIELDS.has(id),
      draft,
    };
  });
  return {
    area,
    areaLabel: areaLabel(area),
    intro: pack.intro,
    empathyNote: pack.empathy_note,
    questions,
  };
}

/**
 * First required question with an empty answer, or null (mirrors the app's
 * firstMissingRequired). Answers may be missing entirely.
 */
export function firstMissingRequired(questions, answers) {
  const ans = answers ?? {};
  for (const q of questions) {
    if (q.required && !(ans[q.id] ?? "").toString().trim()) return q;
  }
  return null;
}

// ------------------------------------------------- conflict-party extraction

const ENTITY_RE =
  /\b(inc|incorporated|llc|llp|ltd|limited|corp|corporation|company|co|plc|pc|pa|lp|gmbh|partners|properties|group|associates|management|holdings|apartments|housing|insurance|bank|clinic|agency|services|warehouse|logistics|uscis)\b\.?$/i;
const PERSON_RE = /^[A-Z][\p{L}'’.-]*(?:\s+(?:[A-Z]\.?|[A-Z][\p{L}'’-]*))+$/u;
const STOP_NAMES = new Set([
  "not sure", "not sure yet", "none", "none yet", "no one", "no one else", "n/a", "na",
  "unknown", "tbd", "my landlord", "my employer", "the other driver",
]);

/** Case-insensitive name key for de-duping (mirrors nameKey in the app). */
function nameKey(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Classify one segment as a person / entity name, or null if it is not a name. */
export function classifyName(segment) {
  const s = segment.trim().replace(/^[-–•*\s]+/, "").replace(/\s+/g, " ");
  if (!s || STOP_NAMES.has(s.toLowerCase())) return null;
  if (ENTITY_RE.test(s) || /^the\s/i.test(s)) return "entity";
  if (PERSON_RE.test(s)) return "person";
  return null;
}

/**
 * Deterministic name-pattern extraction from a parties field. Splits on
 * newlines, semicolons and commas; splits on "and" only when BOTH halves are
 * recognizable names (so "Delgado and Sons Trucking LLC" stays whole). Notes in
 * parentheses or after an em dash are dropped; unrecognizable segments are
 * dropped rather than guessed at — the app's hard rule is "do not invent parties".
 *
 * @param {string} text the opposing_parties / other_parties free text
 * @param {'opposing'|'related'|'witness'|'other'} [role] role stamped on every
 *   extracted party; the caller knows which field the text came from.
 * @returns {Array<{name: string, kind: 'person'|'entity', role: string}>}
 */
export function extractParties(text, role = "opposing") {
  const raw = String(text ?? "");
  const out = [];
  const seen = new Set();
  const push = (segment) => {
    const kind = classifyName(segment);
    if (!kind) return;
    const name = segment.trim().replace(/^[-–•*\s]+/, "").replace(/\s+/g, " ");
    const key = nameKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, kind, role });
  };
  for (const chunk of raw.split(/[\n;]|,\s+/)) {
    let seg = chunk
      .trim()
      .replace(/^[-–•*\s]+/, "")
      .replace(/\s*\([^)]*\)/g, "")
      .replace(/\s+[—–]\s+.*$/, "")
      .trim();
    if (!seg) continue;
    const m = seg.match(/\s+and\s+/i);
    if (m) {
      const a = seg.slice(0, m.index);
      const b = seg.slice(m.index + m[0].length);
      if (classifyName(a) && classifyName(b)) {
        push(a);
        push(b);
        continue;
      }
    }
    push(seg);
  }
  return out;
}

// ----------------------------------------------------------- urgency flags

const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;
const DAY_MS = 86400000;

/** Whole-day difference a→b (positive = b is after a). NaN for invalid dates. */
function dayDiff(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY_MS);
}

/**
 * Deterministic urgency flags over the answers (key_dates + matter_detail are
 * scanned). Rules:
 *   - a date within 30 days after `asOf`  → urgent ("deadline in N days")
 *   - a date within 30 days before `asOf` → urgent (recently passed deadline)
 *   - a court date / hearing / trial mentioned → urgent
 *
 * @param {Record<string,string>} answers confirmed answers
 * @param {string} asOf ISO date the simulation runs from, e.g. "2026-11-07"
 * @returns {Array<{rule: string, level: 'urgent', escalate: true, reason: string, date: string|null}>}
 */
export function urgencyFlags(answers, asOf) {
  const ans = answers ?? {};
  const flags = [];
  const dateText = [ans.key_dates, ans.matter_detail].filter(Boolean).join("\n");
  const seen = new Set();
  for (const d of dateText.match(ISO_DATE) ?? []) {
    if (seen.has(d)) continue;
    seen.add(d);
    const n = dayDiff(asOf, d);
    if (n >= 0 && n <= 30) {
      flags.push({
        rule: "deadline-within-30-days",
        level: "urgent",
        escalate: true,
        reason: `deadline ${d} is ${n} day${n === 1 ? "" : "s"} away (within 30)`,
        date: d,
      });
    } else if (n < 0 && n >= -30) {
      flags.push({
        rule: "deadline-recently-passed",
        level: "urgent",
        escalate: true,
        reason: `deadline ${d} passed ${-n} day${n === -1 ? "" : "s"} ago`,
        date: d,
      });
    }
  }
  if (/\b(court|hearing|trial|judge|magistrate)\b/i.test(dateText)) {
    flags.push({
      rule: "court-date-mentioned",
      level: "urgent",
      escalate: true,
      reason: "a court date or hearing is mentioned in the answers",
      date: null,
    });
  }
  return flags;
}

// ---------------------------------------------------------- firm summary

const ESCALATING = new Set(["emergency", "urgent"]);
const URGENCY_LABELS = {
  emergency: "Emergency — today / this week",
  urgent: "Urgent — there's a deadline soon",
  soon: "Soon — within a month or so",
  routine: "No rush — planning ahead",
  unsure: "Not sure",
};

/**
 * Build the firm-facing output from the confirmed answers — the deterministic
 * stand-in for the app's /api/finalize-intake: a neutral summary paragraph, a
 * conflict-check party list (client + extracted parties, de-duped), urgency
 * (self-reported level combined with the flag rules), and "what happens next".
 *
 * `answers` may carry `matter_area` and `persona`; defaults are "other"-style
 * labeling and the client persona, matching the app's fallbacks.
 *
 * @param {Record<string,string>} answers
 * @param {string} [asOf] ISO date for the urgency rules; defaults to "2026-11-07"
 */
export function buildFirmSummary(answers, asOf = "2026-11-07") {
  const ans = answers ?? {};
  const area = ans.matter_area && AREA_PACKS[ans.matter_area] ? ans.matter_area : null;
  const label = areaLabel(ans.matter_area);
  const persona = ans.persona === "staff" ? "staff" : "client";
  const name = (ans.full_name ?? "").trim();

  const flags = urgencyFlags(ans, asOf);
  const selfLevel = URGENCY_LABELS[ans.urgency] ? ans.urgency : "unsure";
  const escalate = ESCALATING.has(selfLevel) || flags.some((f) => f.escalate);
  const level = escalate ? (selfLevel === "emergency" ? "emergency" : "urgent") : selfLevel;
  const deadlineNote = flags.find((f) => f.date)?.date ?? "";

  // Conflict parties: client first (client role always wins, as in the app),
  // then opposing / related extracted from the parties fields.
  const byName = new Map();
  const addParty = (p) => {
    const key = nameKey(p.name);
    if (!key) return;
    if (!byName.has(key)) byName.set(key, p);
  };
  if (name) addParty({ name, kind: classifyName(name) ?? "person", role: "client" });
  for (const p of extractParties(ans.opposing_parties, "opposing")) addParty(p);
  for (const p of extractParties(ans.other_parties, "related")) addParty(p);
  const conflict_parties = [...byName.values()];

  const jurisdiction = (ans.jurisdiction ?? "").trim();
  const where = jurisdiction || "an unstated jurisdiction";
  // answers are free text — drop a trailing period so the composed summary
  // never reads ".." when a detail sentence was punctuated
  const clip = (s) => s.trim().replace(/\.+$/, "");
  const detail = clip(ans.matter_detail ?? "");
  const desired = clip(ans.desired_outcome ?? "");
  const summary =
    `${label} matter. ${name || "The caller"} reports ` +
    `${AREA_PHRASES[area ?? "other"] ?? "a legal issue"} in ${where}` +
    `${detail ? ` — ${detail}` : ""}.` +
    `${desired ? ` Stated desired outcome: ${desired}.` : ""}`;

  const next_steps = nextSteps(persona, escalate, conflict_parties.length, label);

  return {
    summary,
    jurisdiction,
    conflict_parties,
    urgency: {
      level,
      label: URGENCY_LABELS[level],
      escalate,
      reason: flags.map((f) => f.reason).join("; ") || `self-reported: ${URGENCY_LABELS[selfLevel]}`,
      deadline_note: deadlineNote,
      flags,
    },
    next_steps,
    contact_method: (ans.contact_method ?? "").trim(),
    contact_detail: (ans.contact_detail ?? "").trim(),
  };
}

function nextSteps(persona, escalate, partyCount, label) {
  const n = partyCount === 1 ? "1 party" : `${partyCount} parties`;
  if (persona === "staff") {
    return [
      `Conflict check queued for ${n}.`,
      escalate
        ? "Escalate to the duty attorney today — a deadline or court date was flagged."
        : `Route to the ${label} team for review.`,
      "Confirm the reference number with the client for follow-up.",
    ];
  }
  return [
    escalate
      ? "Because a deadline or court date was flagged, an attorney will review this intake promptly."
      : "A member of the firm will review your intake and follow up with you.",
    "Keep every document and notice related to the matter — do not throw anything away.",
    "We will reach you using the contact details you confirmed.",
  ];
}

// --------------------------------------------------------------- record

/**
 * Deterministic intake reference, shape INT-YYMM-XXXX from UTC time + a
 * caller-supplied random in [0,1). Port of makeReference in the live app
 * (kept pure so the demo stays reproducible).
 */
export function makeReference(nowMs, rand) {
  const d = new Date(nowMs);
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const r = Math.min(Math.max(rand, 0), 0.999999);
  const suffix = Math.floor(r * 36 ** 4)
    .toString(36)
    .padStart(4, "0")
    .toUpperCase();
  return `INT-${yy}${mm}-${suffix}`;
}

/**
 * The confirm gate: assemble the persisted-shaped record only after the user
 * has confirmed. Nothing in this demo is "saved" before this call.
 *
 * @param {{persona: string, matterArea: string, narrative: string,
 *   answers: Record<string,string>, asOf: string, refRand?: number}} input
 */
export function confirmIntake(input) {
  const answers = { ...input.answers, matter_area: input.matterArea, persona: input.persona };
  const firm = buildFirmSummary(answers, input.asOf);
  const reference = makeReference(Date.parse(input.asOf + "T12:00:00Z"), input.refRand ?? 0.42);
  return {
    reference,
    persona: input.persona,
    matter_area: input.matterArea,
    matter_area_label: areaLabel(input.matterArea),
    narrative: input.narrative ?? "",
    answers: input.answers,
    ...firm,
  };
}

/** Copyable plain-text (Markdown) summary of a confirmed record. */
export function summaryText(record) {
  const lines = [
    `# Intake ${record.reference}`,
    "",
    `**Matter:** ${record.matter_area_label}`,
    `**Jurisdiction:** ${record.jurisdiction || "unknown"}`,
    `**Contact:** ${record.contact_method || "unspecified"} — ${record.contact_detail || "unspecified"}`,
    `**Urgency:** ${record.urgency.label}${record.urgency.escalate ? " (escalate)" : ""}`,
    "",
    "## Summary",
    record.summary,
    "",
    "## Conflict-check parties",
    ...record.conflict_parties.map((p) => `- ${p.name} — ${p.kind} / ${p.role}`),
    "",
    "## Urgency flags",
    ...(record.urgency.flags.length
      ? record.urgency.flags.map((f) => `- [${f.rule}] ${f.reason}`)
      : ["- none"]),
    "",
    "## What happens next",
    ...record.next_steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "_Information only — not legal advice; no attorney–client relationship until the firm accepts the matter._",
  ];
  return lines.join("\n");
}
