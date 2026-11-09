/**
 * regulatory-horizon-scan — bulletin/notice extraction schema for POST /api/extract
 * (Wave W7). Implements the spec's "LLM prompt schema (extraction step, optional)"
 * near-verbatim: feed items with verbatim titles, never-invented dates (omit rather
 * than guess), and the pinned rule that the LLM never scores, never ranks, never
 * decides impact — items land as unverified feed entries the rubric can be re-run
 * against. Registered by the coordinator after the wave (validate.ts EXTRACT_SCHEMAS).
 */
import type { ExtractSchema, Valid } from "../validate.ts";

export interface FeedItem {
  id: string;
  title: string;
  jurisdiction: string;
  status: "proposed" | "final" | "effective" | "rumored";
  itemType: "rule" | "NPRM" | "ANPR" | "RFI";
  effectiveDate: string | null;
  commentDeadline: string | null;
  publishedDate: string | null;
  summary: string;
  source: string;
  provenance: "primary" | "secondary" | "manual" | "unknown";
  link: string | null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function exactKeys(v: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(v).length === keys.length && keys.every((k) => k in v);
}

/** String field of length [min,max] after trim; null otherwise. */
function str(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= min && s.length <= max ? s : null;
}

/** Strict real YYYY-MM-DD (rejects rollover like 2026-11-32). */
function isoDay(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return !Number.isNaN(d.getTime()) && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

const STATUSES = ["proposed", "final", "effective", "rumored"];
const ITEM_TYPES = ["rule", "NPRM", "ANPR", "RFI"];
const PROVENANCE = ["primary", "secondary", "manual", "unknown"];

/** Validated regulator-bulletin feed extraction — exact keys, pinned enums,
 *  real-or-null ISO dates, non-empty title. null = unusable → INVALID. */
export function validateFeedItems(v: unknown): Valid<{ items: FeedItem[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["items"])) return null;
  if (!Array.isArray(v.items) || v.items.length > 100) return null;
  const out: FeedItem[] = [];
  for (const it of v.items) {
    if (!isPlainObject(it) || !exactKeys(it, ["id", "title", "jurisdiction", "status", "itemType", "effectiveDate", "commentDeadline", "publishedDate", "summary", "source", "provenance", "link"])) return null;
    const id = str(it.id, 1, 80);
    if (!id) return null;
    const title = str(it.title, 1, 300);
    if (!title) return null;
    const jurisdiction = str(it.jurisdiction, 1, 48);
    if (!jurisdiction) return null;
    if (typeof it.status !== "string" || !STATUSES.includes(it.status)) return null;
    if (typeof it.itemType !== "string" || !ITEM_TYPES.includes(it.itemType)) return null;
    for (const k of ["effectiveDate", "commentDeadline", "publishedDate"] as const) {
      if (it[k] !== null && !isoDay(it[k])) return null; // never invent dates; omit rather than guess
    }
    const summary = str(it.summary, 0, 400);
    if (summary === null) return null;
    const source = str(it.source, 0, 120);
    if (source === null) return null;
    if (typeof it.provenance !== "string" || !PROVENANCE.includes(it.provenance)) return null;
    if (it.link !== null && str(it.link, 1, 300) === null) return null; // scheme safety is downstream (demo shows non-http as text)
    out.push({
      id,
      title,
      jurisdiction,
      status: it.status as FeedItem["status"],
      itemType: it.itemType as FeedItem["itemType"],
      effectiveDate: (it.effectiveDate as string | null)?.trim() ?? null,
      commentDeadline: (it.commentDeadline as string | null)?.trim() ?? null,
      publishedDate: (it.publishedDate as string | null)?.trim() ?? null,
      summary,
      source,
      provenance: it.provenance as FeedItem["provenance"],
      link: it.link === null ? null : (it.link as string).trim(),
    });
  }
  return { ok: true, value: { items: out } };
}

export const schema: ExtractSchema = {
  fields: ["items"],
  system: [
    "You extract regulatory feed items from an imported regulator bulletin or notice for the regulatory-horizon-scan demo. Extraction only — the LLM never scores, never ranks, never decides impact; if it feeds the scan, its output is data the rubric can be re-run against.",
    'Each item is {"id", "title", "jurisdiction", "status", "itemType", "effectiveDate", "commentDeadline", "publishedDate", "summary", "source", "provenance", "link"}.',
    "Never invent dates; omit rather than guess — dates are YYYY-MM-DD or null.",
    "Quote titles verbatim where possible.",
    "status is one of proposed|final|effective|rumored; itemType is one of rule|NPRM|ANPR|RFI (use rule when the document does not distinguish).",
    "provenance is primary when the document is the regulator's own publication, else secondary; jurisdiction is the document's own jurisdiction label (e.g. US-FED, US-CA, EU, Washington).",
    "summary is at most 60 words with no legal conclusions; source names the publishing body as printed; link is the document's own URL or null.",
    "ids are stable-kebab-case, derived from the document's own docket or title (e.g. fpc-breach-nprm).",
    'Set confidence.items to "low" when any date, title, or status was uncertain.',
    'Reply with ONLY a JSON object: {"data": {"items": [{"id": "…", "title": "…", "jurisdiction": "…", "status": "…", "itemType": "…", "effectiveDate": "2027-01-01"|null, "commentDeadline": "2027-01-15"|null, "publishedDate": "2026-11-01"|null, "summary": "…", "source": "…", "provenance": "primary", "link": "https://…"|null}]}, "confidence": {"items": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Regulator bulletin / notice text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateFeedItems,
};
