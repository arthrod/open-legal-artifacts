# subpoena-response

Open counterpart of PwC's Subpoena Response Tool (Claude for Legal partner
gallery). A subpoena-facts JSON goes in; a deterministic tracker comes out:

- subpoena classification (5 types incl. grand jury) with a hard
  STOP/escalation gate that cannot be prompt-forgotten;
- five tracked deadlines — response/compliance, objections (EARLIER-of
  rule), production, motion-to-quash window, meet-and-confer — with the
  earliest escalating when passed or ≤3 days out, all configurable per
  forum and exportable as an ICS calendar (no dependencies);
- responsive scope as structured fields (date range, custodians, data types)
  with overbreadth flags mapped to suggested objections, plus an objection
  application matrix (categories, custodians, deterministic strength
  ratings);
- provenance trail: every critical fact field carries a source tag;
  untagged fields warn and unverified sources are listed verify-first;
- portfolio cross-check: caption/party matching flags coordinated issuance;
- privilege/log workflow (`not_started → … → final`) with forward-only
  transitions and progress %;
- objection-grounds library (10 stable ids, jurisdiction-dependent,
  rules-as-data) and a Markdown checklist export with a compliance-plan
  section (production scope, custodians/systems, format, privilege-log
  fields).

## Run

```bash
node --test "core/*.test.js"     # 38 tests
node examples/run.js             # regenerates output.json + checklist.md
```

Demo: `demo/index.html` (standalone, shared design tokens, prefilled with
the fictional Drummond v. Halvorsen Freight matter).

## Better than the closed counterpart

Every deadline, flag, and state change is a reproducible function of the
input — no opaque precedent corpus. Forum rules (day counts, extensions,
holidays, objection grounds) are editable data, not hidden logic, and the
optional LLM step is barred from computing dates or selecting objections.
Checklists only — never legal conclusions or filed work product. Not legal
advice.
