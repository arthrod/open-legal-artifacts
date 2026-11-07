import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import type { IntakeRecord, IntakeRow, IntakeSummary } from "../shared/types.ts";

// Bump the suffix on any schema change — Val Town SQLite has limited ALTER, so we
// create a fresh table rather than migrate columns.
const TABLE = "intakes_v1";

let migrated = false;

export async function migrate(): Promise<void> {
  if (migrated) return;
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reference TEXT NOT NULL,
      persona TEXT,
      matter_area TEXT,
      jurisdiction TEXT,
      urgency_level TEXT,
      conflict_count INTEGER,
      contact_name TEXT,
      payload TEXT NOT NULL
    )
  `);
  migrated = true;
}

export interface SaveIntakeResult {
  id: number;
  reference: string;
}

/**
 * Persist a reviewed intake. Honors `record.discard_narrative` (privacy opt-out):
 * when true, the stored payload has `narrative` blanked to "" — the raw narrative
 * is never written in that case. The summary columns are denormalized from the
 * record for the firm's list view; the full record lives in `payload`.
 */
export async function saveIntake(record: IntakeRecord): Promise<SaveIntakeResult> {
  await migrate();

  const payload: IntakeRecord = record.discard_narrative
    ? { ...record, narrative: "" }
    : record;

  const result = await sqlite.execute({
    sql: `INSERT INTO ${TABLE}
      (reference, persona, matter_area, jurisdiction, urgency_level,
       conflict_count, contact_name, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.reference,
      record.persona,
      record.matter_area,
      record.jurisdiction || null,
      record.urgency?.level ?? null,
      record.conflict_parties.length,
      record.contact_name || null,
      JSON.stringify(payload),
    ],
  });
  return { id: Number(result.lastInsertRowid ?? 0), reference: record.reference };
}

function strOrEmpty(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

const SUMMARY_COLS =
  "id, reference, created_at, persona, matter_area, jurisdiction, urgency_level, conflict_count, contact_name";

// Row is an ArrayLike (not a real Array) on Val Town SQLite — index positionally.
function mapSummary(r: ArrayLike<unknown>): IntakeSummary {
  return {
    id: Number(r[0]),
    reference: String(r[1]),
    created_at: String(r[2]),
    persona: strOrEmpty(r[3]),
    matter_area: strOrEmpty(r[4]),
    jurisdiction: strOrEmpty(r[5]),
    urgency_level: strOrEmpty(r[6]),
    conflict_count: Number(r[7] ?? 0),
    contact_name: strOrEmpty(r[8]),
  };
}

/** Firm list view: newest intakes first (no payload). */
export async function listIntakes(limit = 200): Promise<IntakeSummary[]> {
  await migrate();
  const result = await sqlite.execute({
    sql: `SELECT ${SUMMARY_COLS} FROM ${TABLE} ORDER BY id DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows.map(mapSummary);
}

/** Full stored intake by id, or null if none. */
export async function getIntake(id: number): Promise<IntakeRow | null> {
  await migrate();
  const result = await sqlite.execute({
    sql: `SELECT ${SUMMARY_COLS}, payload FROM ${TABLE} WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const r = result.rows[0];
  if (!r) return null;
  return {
    ...mapSummary(r),
    payload: JSON.parse(String(r[9])) as IntakeRecord,
  };
}
