# Subpoena response checklist — Drummond v. Halvorsen Freight Co. (fictional)

- Subpoena type: **third_party_documents** (document categories present; no other type marker matched).
- [ ] Confirm service facts: served 2026-11-02 by mail (+3 extension day(s)).
- [ ] **Response deadline: 2026-11-19** (17 calendar day(s)) — status: on_track, 6 day(s) remaining.

## All deadlines (calendar all of them)

- [ ] **Response / compliance: 2026-11-19** — 17 calendar day(s) from service 2026-11-02 by mail (+3 ext.).
- [ ] **Objections: 2026-11-15** — earlier of compliance date (2026-11-19) and 10 day(s) after service (2026-11-15) → 2026-11-15.
- [ ] **Production: 2026-12-05** — 33 calendar day(s) from service 2026-11-02 (incl. 3 ext.).
- [ ] **Motion-to-quash window (outer limit): 2026-11-19** — 17 calendar day(s) from service 2026-11-02 (incl. 3 ext.).
- [ ] **Meet and confer: 2026-11-12** — 10 calendar day(s) from service 2026-11-02 (incl. 3 ext.).

Earliest: **Meet and confer 2026-11-12** (-1 day(s) from 2026-11-13).
- _Objection deadlines often run from the EARLIER of the compliance date or a fixed number of days after service — this varies by forum; research the applicable rule before relying on any date here._
- [ ] Legal hold already issued — verify scope covers new custodians.

## Responsive scope (structured)

- Date range: 2016-01-01 → 2026-11-01 (10.8 yrs).
- Custodians (10):
  - [ ] R. Okonkwo — VP Operations
  - [ ] T. Marsh — Dispatcher, Phoenix yard
  - [ ] S. Feld — Safety coordinator
  - [ ] J. Alvarado-Ruiz — Fleet maintenance lead
  - [ ] M. Pretorius — Night-shift supervisor
  - [ ] D. Whitcombe — HR business partner
  - [ ] K. Nakamura — Accounts payable clerk
  - [ ] B. Vess — Regional sales manager
  - [ ] P. Ionescu — IT administrator
  - [ ] E. Brandt — Former dispatcher (departed 2024)
- Data types:
  - [ ] email (Exchange Online) — All 10 custodians.
  - [ ] telemetry logs (FleetTrack SaaS) — GPS + speed events; volume ~2.1M rows/yr.
  - [ ] personal text messages (carrier records for 4 drivers) — Requires third-party subpoenas to carriers.
  - [ ] maintenance records (ShopFloor DB; paper files)

## Privilege / log workflow — reviewing (40%)

- [ ] not_started
- [ ] collecting
- [x] reviewing
- [ ] log_drafted
- [ ] qc
- [ ] final

## Objection grounds (jurisdiction-dependent; verify against forum rules)

- [ ] **Overbroad time period** — The requested date range exceeds any reasonable connection to the claims. (Support: Compare the range to the events at issue; propose a narrower window.)
- [ ] **Overbroad custodians** — More custodians are named than the facts plausibly implicate. (Support: Identify custodians with documented involvement; offer the core set first.)
- [ ] **Unduly burdensome / disproportionate** — Cost and effort are disproportionate to the needs of the case. (Support: Document collection estimates (hours, systems, vendor quotes).)
- [ ] **Personal / sensitive data** — Requests reach employee, patient, or customer personal data. (Support: Offer redaction or a privacy-protective production protocol.)
- [ ] **Equally available from another source** — The same material is available from a party or public source at less burden. (Support: Identify the alternative source specifically.)

## Objection application matrix (deterministic heuristics; not a legal conclusion)

- **Overbroad time period** — strength: **strong** (10.8-year range is 2.2× the 5-year threshold.)
  - applies to categories: email, telemetry logs, personal text messages, maintenance records; custodians: 10
- **Overbroad custodians** — strength: **moderate** (10 custodians is 1.3× the 8-custodian threshold.)
  - applies to categories: email, telemetry logs, personal text messages, maintenance records; custodians: 10
- **Personal / sensitive data** — strength: **moderate** (Personal/sensitive categories requested (personal text messages); strength depends on applicable privacy law.)
  - applies to categories: personal text messages; custodians: 10
- **Privileged material** — strength: **moderate** (Privilege review always runs; strength depends on counsel involvement in the implicated categories.)
  - applies to categories: email, personal text messages; custodians: 10
- **Unduly burdensome / disproportionate** — strength: **unrated** (No numeric heuristic for this ground — strength is a manual assessment.)
  - applies to categories: —; custodians: 0
- **Equally available from another source** — strength: **unrated** (No numeric heuristic for this ground — strength is a manual assessment.)
  - applies to categories: —; custodians: 0

## Compliance plan (if responding)

- Scope of likely production: email; telemetry logs; personal text messages; maintenance records.
- Date range: 2016-01-01 → 2026-11-01.
- Custodians to search: R. Okonkwo, T. Marsh, S. Feld, J. Alvarado-Ruiz, M. Pretorius, D. Whitcombe, K. Nakamura, B. Vess, P. Ionescu, E. Brandt.
- Systems: Exchange Online; FleetTrack SaaS; carrier records for 4 drivers; ShopFloor DB; paper files.
- Production format: TIFF + load file, per negotiated protocol draft (fictional).
- Review protocol: two-pass: outside counsel privilege review, then contract reviewer QC (fictional).
- Privilege log fields: date, author, recipients, subject/matter, privilege_basis, withheld_in_part.

## Verify first (unverified sources)

- ⚠ subpoena.service_method — source: process server voicemail summary (fictional fixture) [verify]

## Warnings

- ⚠ overbroad_time: Date range spans 10.8 years (> 5-year threshold).
- ⚠ overbroad_custodians: 10 custodians named (> 8 threshold).
- ⚠ pii_privacy: Personal-device/message data types requested: personal text messages.
- ⚠ EARLIEST DEADLINE PASSED: Meet and confer was 2026-11-12 (1 day(s) ago) — escalate immediately.

---

_Deterministic output of the open subpoena-response tracker. FRCP-style defaults are configurable rules-as-data, not legal advice; deadlines vary by forum — verify with counsel._
