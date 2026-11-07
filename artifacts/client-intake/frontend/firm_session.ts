// Firm-dashboard API callers (browser-only; no JSX). Read-only: the firm view
// never writes. Pure list/sort/format logic lives in ../shared/firm.ts
// (unit-tested); this module only wires it to fetch.
import type { IntakeRow, IntakeSummary } from "../shared/types.ts";

/** GET /api/intakes → summaries, newest first (the firm list). */
async function fetchIntakes(token: string): Promise<IntakeSummary[]> {
  const r = await fetch("/api/intakes", { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(r.status === 401 ? "Access denied (401). Check the admin token and try again." : `Unable to load intakes (${r.status}).`);
  const json = (await r.json()) as { intakes: IntakeSummary[] };
  return Array.isArray(json.intakes) ? json.intakes : [];
}

/** GET /api/intakes/:id → the full stored intake (summary + payload). */
async function fetchIntake(id: number, token: string): Promise<IntakeRow> {
  const r = await fetch(`/api/intakes/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(r.status === 401 ? "Access denied (401). Check the admin token and try again." : `Unable to load the intake (${r.status}).`);
  const json = (await r.json()) as { intake: IntakeRow };
  return json.intake;
}

export { fetchIntake, fetchIntakes };
