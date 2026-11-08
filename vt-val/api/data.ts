/**
 * Data snapshots for the AI routes — the val cannot import from
 * open-artifacts/, so the grounding data is vendored here with sync notes.
 * Change the source of truth first, then mirror it here:
 *   - ASK_LEGAL   ← open-artifacts/ask-legal/demo/example.js
 *   - FRONT_DOOR  ← open-artifacts/access-to-justice-front-door/core/core.js (TAXONOMY/DISCLAIMER)
 */
import type { KbEntry } from "./grounding.ts";

export interface AskLegalConfig {
  asOf: string;
  thresholds: { high: number; medium: number; freshnessDays: number };
  routing: Record<string, string>;
  knowledgeBase: KbEntry[];
}

export const ASK_LEGAL: AskLegalConfig = {
  asOf: "2026-11-07",
  thresholds: { high: 9, medium: 5, freshnessDays: 365 },
  routing: {
    privacy: "privacy-counsel",
    employment: "people-legal",
    contracts: "commercial-legal",
    expenses: "finance-ops",
    default: "legal-intake",
  },
  knowledgeBase: [
    {
      id: "kb-001",
      question: "Which NDA template should I use for a prospective vendor?",
      answer: "Use the Mutual NDA (Form L-102) for all prospective vendors; do not sign the vendor's own paper. Exceptions (shorter term, no residuals clause) route to Commercial Legal.",
      tags: ["nda", "vendor", "contracts"],
      jurisdiction: "US",
      updated: "2026-09-15",
      approvedBy: "A. Fern, Deputy GC (fictional)",
    },
    {
      id: "kb-002",
      question: "Which NDA template should I use for an individual consultant?",
      answer: "Use the Consultant NDA (Form L-104) with the IP assignment rider attached. Independent-contractor status must be confirmed by People Legal before signature.",
      tags: ["nda", "consultant", "contracts", "employment"],
      jurisdiction: "US",
      updated: "2026-09-20",
      approvedBy: "A. Fern, Deputy GC (fictional)",
    },
    {
      id: "kb-003",
      question: "Can I expense client entertainment over $500?",
      answer: "Entertainment above $500 requires pre-approval from Finance and the responsible partner, logged in the matter file before the event, not after.",
      tags: ["expenses", "finance"],
      jurisdiction: "US",
      updated: "2026-06-02",
      approvedBy: "Finance Committee (fictional)",
    },
    {
      id: "kb-004",
      question: "How do I report a suspected data privacy incident?",
      answer: "Email security-incidents@example.test within 1 hour of discovery and do not discuss externally. Privacy Counsel decides on regulator notification under the incident runbook.",
      tags: ["privacy", "security", "incident"],
      jurisdiction: "US",
      updated: "2026-10-30",
      approvedBy: "R. Castellan, Privacy Counsel (fictional)",
    },
    {
      id: "kb-005",
      question: "How long do we retain website visitor data?",
      answer: "26 months per the 2024 retention schedule, then anonymize or delete (Privacy Policy §9).",
      tags: ["privacy", "data-retention"],
      jurisdiction: "US",
      updated: "2024-03-01",
      approvedBy: "Privacy Team (fictional)",
    },
  ],
};

/* ---------- front-door taxonomy snapshot ---------- */

export interface TaxonomyGuidance {
  point: string;
  source: { name: string; url: string };
}

export interface TaxonomyIssue {
  label: string;
  keywords: Array<{ k: string; w: number }>;
  guidance: TaxonomyGuidance[];
  referral: {
    legalAidCategory: string;
    serviceDescription: string;
    whereToGo: string;
  };
}

export type Taxonomy = Record<string, TaxonomyIssue>;

export const FRONT_DOOR_TAXONOMY: Taxonomy = {
  "housing-eviction": {
    label: "Eviction / loss of housing",
    keywords: [{ k: "evict", w: 3 }, { k: "eviction", w: 3 }, { k: "notice to quit", w: 3 }, { k: "landlord", w: 2 }, { k: "court papers", w: 2 }, { k: "behind on rent", w: 3 }, { k: "lockout", w: 3 }, { k: "kicked out", w: 3 }, { k: "thrown out", w: 3 }, { k: "threw me out", w: 3 }, { k: "being put out", w: 3 }],
    guidance: [
      { point: "Bring every notice, summons, or letter you have received to your first appointment; deadlines printed on court papers are time-sensitive.", source: { name: "LawHelp.org — legal aid finder", url: "https://www.lawhelp.org" } },
      { point: "Court self-help centers can explain what each paper means at no cost; intake staff can point you to the nearest one.", source: { name: "LawHelp.org — legal aid finder", url: "https://www.lawhelp.org" } },
    ],
    referral: {
      legalAidCategory: "legal-aid-housing",
      serviceDescription: "Eviction defense and housing stability help through your local legal aid housing unit.",
      whereToGo: "Your nearest legal aid office or court self-help center; bring any court papers you received.",
    },
  },
  "housing-conditions": {
    label: "Repairs / unhealthy housing conditions",
    keywords: [{ k: "mold", w: 2 }, { k: "no heat", w: 3 }, { k: "repairs", w: 2 }, { k: "infestation", w: 2 }, { k: "habitability", w: 3 }, { k: "slumlord", w: 2 }, { k: "no hot water", w: 3 }, { k: "roaches", w: 3 }, { k: "rats", w: 3 }],
    guidance: [
      { point: "Take photos of the problem and keep copies of repair requests; bring both to your appointment.", source: { name: "LawHelp.org — legal aid finder", url: "https://www.lawhelp.org" } },
      { point: "Many localities have a housing code enforcement office that inspects on request; intake staff can identify yours.", source: { name: "U.S. HUD — housing resources", url: "https://www.hud.gov" } },
    ],
    referral: {
      legalAidCategory: "legal-aid-housing",
      serviceDescription: "Housing conditions enforcement help through your local legal aid housing unit.",
      whereToGo: "Your nearest legal aid office; bring photos, repair requests, and correspondence with the landlord.",
    },
  },
  "benefits-denial": {
    label: "Public benefits denied or cut off",
    keywords: [{ k: "food stamps", w: 3 }, { k: "snap", w: 3 }, { k: "benefits", w: 2 }, { k: "denied", w: 2 }, { k: "medicaid", w: 3 }, { k: "welfare", w: 2 }, { k: "overpayment", w: 2 }, { k: "cash assistance", w: 3 }, { k: "ebt", w: 3 }],
    guidance: [
      { point: "Appeal deadlines are printed on the denial or overpayment notice; bring the notice to intake staff right away.", source: { name: "USA.gov — benefits page", url: "https://www.usa.gov/benefits" } },
      { point: "A fair hearing can often be requested by phone or mail; the notice itself explains how.", source: { name: "USA.gov — benefits page", url: "https://www.usa.gov/benefits" } },
    ],
    referral: {
      legalAidCategory: "legal-aid-benefits",
      serviceDescription: "Benefits appeals help (fair hearings) through your local legal aid public benefits unit.",
      whereToGo: "Your nearest legal aid office; bring the denial or overpayment notice and any deadlines listed on it.",
    },
  },
  "family-custody": {
    label: "Custody / visitation / child support",
    keywords: [{ k: "custody", w: 3 }, { k: "visitation", w: 3 }, { k: "child support", w: 3 }, { k: "my kids", w: 2 }, { k: "guardianship", w: 2 }, { k: "who gets the kids", w: 3 }],
    guidance: [
      { point: "Bring existing court orders and any caseworker correspondence to your first appointment.", source: { name: "LawHelp.org — legal aid finder", url: "https://www.lawhelp.org" } },
      { point: "Family court self-help centers can explain which forms start a custody or support case.", source: { name: "LawHelp.org — legal aid finder", url: "https://www.lawhelp.org" } },
    ],
    referral: {
      legalAidCategory: "legal-aid-family",
      serviceDescription: "Family law help (custody, visitation, support) through your local legal aid family unit.",
      whereToGo: "Your nearest legal aid office or family court self-help center; bring existing court orders.",
    },
  },
  "domestic-violence": {
    label: "Domestic violence / safety",
    keywords: [{ k: "abuse", w: 3 }, { k: "protective order", w: 3 }, { k: "restraining order", w: 3 }, { k: "unsafe at home", w: 3 }, { k: "hit me", w: 3 }, { k: "threatening", w: 2 }, { k: "beats me", w: 3 }, { k: "hits me", w: 3 }, { k: "choked me", w: 3 }, { k: "scared of my partner", w: 3 }, { k: "afraid of my partner", w: 3 }],
    guidance: [
      { point: "If you are in immediate danger, call emergency services before anything else.", source: { name: "National Domestic Violence Hotline", url: "https://www.thehotline.org" } },
      { point: "Safety planning with a trained advocate is free and confidential; advocates also help with protective-order paperwork.", source: { name: "National Domestic Violence Hotline", url: "https://www.thehotline.org" } },
    ],
    referral: {
      legalAidCategory: "legal-aid-dv",
      serviceDescription: "Safety planning and protective-order help through a domestic violence advocacy program.",
      whereToGo: "A DV advocacy hotline or legal aid DV unit; if you are in immediate danger call emergency services first.",
    },
  },
  "consumer-debt": {
    label: "Debt collection / credit",
    keywords: [{ k: "debt collector", w: 3 }, { k: "sued for", w: 2 }, { k: "collection", w: 2 }, { k: "credit report", w: 2 }, { k: "garnish", w: 3 }, { k: "wage garnishment", w: 3 }, { k: "garnished", w: 3 }, { k: "garnishment", w: 3 }, { k: "collection agency", w: 3 }],
    guidance: [
      { point: "Bring all collection letters, voicemails, and court papers to your appointment.", source: { name: "Consumer Financial Protection Bureau", url: "https://www.consumerfinance.gov" } },
      { point: "Summons papers include a response deadline; bring them to intake staff the same week they arrive.", source: { name: "Consumer Financial Protection Bureau", url: "https://www.consumerfinance.gov" } },
    ],
    referral: {
      legalAidCategory: "legal-aid-consumer",
      serviceDescription: "Consumer debt defense help through your local legal aid consumer unit.",
      whereToGo: "Your nearest legal aid office; bring the collection letters or lawsuit papers.",
    },
  },
  "employment-wage": {
    label: "Wage theft / job problems",
    keywords: [{ k: "not paid", w: 3 }, { k: "wages", w: 2 }, { k: "overtime", w: 2 }, { k: "fired", w: 2 }, { k: "unemployment", w: 2 }, { k: "paycheck", w: 2 }, { k: "boss owes me", w: 3 }, { k: "off the clock", w: 3 }, { k: "unpaid", w: 2 }],
    guidance: [
      { point: "Bring pay stubs, schedules, and any messages about hours or pay.", source: { name: "LawHelp.org — legal aid finder", url: "https://www.lawhelp.org" } },
      { point: "Wage claims are handled by a state or federal labor agency; intake staff can identify the right office for your situation.", source: { name: "U.S. DOL Wage and Hour Division", url: "https://www.dol.gov/agencies/whd" } },
    ],
    referral: {
      legalAidCategory: "legal-aid-employment",
      serviceDescription: "Wage claim and employment help through your local legal aid workers’ rights unit.",
      whereToGo: "Your nearest legal aid office; bring pay stubs, schedules, and any termination notice.",
    },
  },
  "record-clearance": {
    label: "Record sealing / expungement",
    keywords: [{ k: "expunge", w: 3 }, { k: "criminal record", w: 3 }, { k: "seal", w: 2 }, { k: "background check", w: 2 }, { k: "clean up my record", w: 3 }, { k: "clear my record", w: 3 }],
    guidance: [
      { point: "Bring your RAP sheet if you have one; if not, intake staff can explain how to request a copy.", source: { name: "LawHelp.org — legal aid finder", url: "https://www.lawhelp.org" } },
      { point: "Eligibility for sealing depends on the case outcome and the state; a screener goes through it with you.", source: { name: "LawHelp.org — legal aid finder", url: "https://www.lawhelp.org" } },
    ],
    referral: {
      legalAidCategory: "legal-aid-record-clearance",
      serviceDescription: "Record sealing/expungement screening through a legal aid reentry clinic.",
      whereToGo: "Your nearest legal aid reentry clinic; bring your RAP sheet if you have one.",
    },
  },
};

export const FRONT_DOOR_DISCLAIMER =
  "This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.";

export const FRONT_DOOR_ESCALATE_MESSAGE =
  "We could not confidently classify this description. A staff member will review it and follow up — no automated categorization was applied.";

/** Confidence gate for the AI triage — same 0.4 the deterministic core uses. */
export const TRIAGE_MIN_CONFIDENCE = 0.4;
