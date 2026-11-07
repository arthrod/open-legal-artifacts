# privilege-log-builder

Draft privilege log builder (original idea — no closed counterpart).
Document set JSON in (author/recipients/date/type/subject) → draft log
entries with FRE 26(b)(5)-style fields, privilege-type inference from
**metadata heuristics** (attorney-client counsel↔client patterns,
work-product document types + anticipation flag), near-duplicate detection,
incomplete-entry flags, and court-ready exports (Markdown + CSV).

Every inference is tagged `metadata_heuristic` with the rule text behind
it — the tool never asserts privilege on its own authority; content review
and final calls stay with the attorney.

## Run

```bash
node --test 'core/*.test.js'   # 14 tests
node examples/run.js           # regenerates output.json + log.md + log.csv
```

Open `demo/index.html` for the interactive demo (prefilled fictional
7-document set: clean attorney-client email, an exact near-duplicate pair,
a work-product memo, a third-party break, a no-signal business email, and
an incomplete entry).

## Layout

- `spec.md` — IO contract, heuristic rules, prompt schema, rationale
- `core/core.js` — dependency-free ES module (browser + Node)
- `core/core.test.js` — node:test suite
- `examples/` — fictional document set → draft log outputs
- `demo/index.html` — standalone interactive demo (design tokens)

## Why open

Privilege logs are representations to the court. Inference rules here are
inspectable, versioned data; every entry echoes the basis for its
privilege type; near-duplicate grouping is deterministic; unknown metadata
produces flags, not guesses. Fictional data throughout.

⚠️ Draft output for attorney review only. Not legal advice; privilege
determinations require review of document content by counsel.
