# Code Review — run a3df9bf2 participant 47

Review complete. All six modules + tests read in full (on-disk files byte-match the patch); I verified test-count claim (57) by hand-count. No write/shell tools exist in this environment, so the full detail is inline below, compressed to the limit.

**VERDICT: FIX-REQUIRED** — 5 Important findings (docio ×3, persist ×2); everything else SHIP.

**docio.js — FIX-REQUIRED**
- **Important** `docio.js:296` — readXlsx returns sheet name with XML entities undecoded while writeXlsx encodes them (`:358`); `{name:'A & B'}` round-trips as `'A &amp; B'`. Fix: `decodeXml(attr(m[0],'name') ?? '')`.
- **Important** `docio.js:328` — writeXlsx never validates the sheet name; Excel forbids `: \ / ? * [ ]` and caps 31 chars → workbook triggers Excel "repair"/refusal. Fix: sanitize or throw.
- **Important** `docio.js:157` — crafted-CD `csize` past EOF is silently clamped by `subarray` → truncated STORE data returned with no error (worst failure class). Fix: bounds-check `start + csize ≤ u8.length`.
- Nit `:139-148` — zip64 (count 0xFFFF / offset 0xFFFFFFFF) → raw RangeError, not a clear "zip64 unsupported"; `:148` ignores GP bit 11 (CP437 names → mojibake; ASCII OOXML parts unaffected); `:50` hostile `&#1114113;` crashes `fromCodePoint` (wrap try/catch); no CRC verification on read.
- Verified good: data descriptors handled correctly (sizes taken from central directory, not local header); writeDocx/writeXlsx emit schema-valid minimal OOXML ([Content_Types].xml, `_rels/.rels`, workbook rels, document/sheet skeletons) — opens in Word/Excel by construction; zip output deterministic.

**persist.js — FIX-REQUIRED**
- **Important** `persist.js:85,116` — on mid-session quota degradation, reads go to the *empty* mem backend: previously persisted keys (incl. audit logs) read as null/[]; `exportJsonl` silently drops all pre-degradation entries. Fix: when degraded and mem misses `k`, read-through localStorage (reads still work after quota hits).
- **Important** `persist.js:111` — `append` is read-modify-write of one JSON blob → concurrent tabs lose appends (last-write-wins). Fix: document limitation or merge via storage events.
- Nit — `loadLog` throws on a torn final line, bricking all history; per-contract (fail loud) but consider a salvage option.

**fuzzyname.js — SHIP.** Nit: Cyrillic homoglyph token ("Ivаnov" vs "Ivanov") scores 0.83 edit → 0.92 align — consider flagging script-mixed matches in matchedVia; Nit: CORP_SUFFIXES drops 'pa'/'co' from person names (e.g. Burmese). Determinism verified (sort −score/ai/bi); threshold gates (whole≥12, compact≥10, edit≥0.75 ∧ min-3) behave exactly as tests claim.

**icsutil.js — SHIP.** Nit `:88`: invalid dtStamp + valid dtStart → `DTSTAMP:19700101T000000Z`; use `toIcalDate(ev.dtStamp) ?? start`. Folding verified correct: code points never split, fold space counts toward 75 octets, unfolds losslessly incl. content spaces; multiline TEXT escaped; buildIcs re-fold idempotent.

**hardening.js — SHIP.** Nit: `csvSafeEscape(-7)` → `'-7` (numeric columns become Excel text — deliberate per test, fleet-wide tradeoff); Nit: `String(obj)` → `[object Object]`. safeExternalUrl control-strip verified safe in both directions — output is always a re-serialized, scheme-allowlisted href.

Could not verify: actual Word/Excel open and the green test run (read-only env, no shell) — schema reasoning + implementer's 57-test claim (count confirmed) stand in.

DONE_WITH_CONCERNS