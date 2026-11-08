/**
 * Typed question templates for the demo. Mirrors templates/ma-diligence.json
 * exactly (kept in sync by a core test — `demo templates mirror`); edit both
 * or regenerate together. IDs match the worked example so a template re-types
 * the same documents × questions grid.
 */
export default [
  { "id": "Q1", "question": "What is the term / subscription length?", "type": "duration", "bounds": { "min": 1, "max": 120, "unit": "months" } },
  { "id": "Q2", "question": "What notice is required to terminate for convenience?", "type": "duration", "bounds": { "min": 1, "max": 365, "unit": "days" } },
  { "id": "Q3", "question": "What is the liability cap?", "type": "currency", "bounds": { "min": 1, "max": 10000000, "unit": "USD" } },
  { "id": "Q4", "question": "Is assignment permitted?", "type": "classify", "options": ["yes", "no", "consent required"] },
  { "id": "Q5", "question": "What law governs the agreement?", "type": "classify", "options": ["Delaware", "New York", "England and Wales", "California"] }
];
