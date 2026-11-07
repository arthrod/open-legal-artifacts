# matter-board — open artifact spec

Open reimplementation of Anthropic's "Matter board" artifact (catalog §2.7):
*"turns engagement letters, emails, or spreadsheets into one board of open
matters, showing the owner, next step, and next deadline."*

The catalog's own critique (fynk, S3): *"a board built from emails ages from
day one."* So this core inverts the emphasis: the board is a view, **change
detection is the product** — diff two matter snapshots and every field change
is flagged with a timestamp, severity, and the timestamp's provenance.

## What it does

1. **Snapshot diffing** — added/removed matters plus per-field changes
   (`name, client, owner, stage, nextStep, nextDeadline, status, notes`),
   each change carrying `changedAt` = the matter's `updatedAt` when present,
   else the snapshot's `capturedAt` (provenance stated explicitly).
2. **Severity classification** — rules-as-data field severity (deadline
   changes are `critical`, owner/stage `major`, …; configurable).
3. **Board view** — stage columns, deadline-sorted, with overdue / due-soon
   flags anchored to caller-supplied `asOf`.
4. **Export JSON + CSV** — diff exports suitable for commit-to-git review or
   pasting into status memos.

## IO contract

```js
import { diffSnapshots, buildBoard, diffToCsv, diffToJson } from "./core/core.js";

const diff = diffSnapshots(previousSnapshot, currentSnapshot, fieldSeverity?);
//   => { prevCapturedAt, currCapturedAt, added[], removed[], changed[{id,name,field,from,to,severity,changedAt,source}], counts }
const board = buildBoard(currentSnapshot, asOfIso, { soonDays: 14, stageOrder? });
diffToCsv(diff); diffToJson(diff);
```

- snapshot: `{ capturedAt: ISO, source?: string, matters: [{ id, name, client, owner, stage, nextStep, nextDeadline?, status?, notes?, updatedAt? }] }`
- `asOf` supplied by caller; no hidden clocks, reproducible diffs.

## Deterministic vs LLM-assisted

| Layer | Who |
|---|---|
| Diffing, severity, timestamps, deadline flags, board, exports | **code** |
| Turning emails/engagement letters/spreadsheets into snapshot JSON | optional LLM (extraction) |
| Choosing stage vocabularies + severity policy | **firm** (rules-as-data) |

### LLM prompt schema (extraction step, optional)

```json
{
  "task": "Extract matters from the provided email/thread/document into the snapshot schema.",
  "output_schema": { "id": "stable id from source system or kebab name", "name": "…", "client": "…", "owner": "initials or handle", "stage": "one of firm's stage vocabulary", "nextStep": "…", "nextDeadline": "YYYY-MM-DD or null", "updatedAt": "ISO when the source carries a time" },
  "rules": ["Never invent deadlines; omit when the source does not state one.", "Owner unknown → null, never guessed.", "Keep verbatim matter names."]
}
```

## What's better than the closed counterpart

- **Change detection as the core object.** The closed artifact shows a board
  (which rots); this core's primary output is the timestamped, field-level
  diff between snapshots — an auditable record of what moved and when.
- **Timestamp provenance.** Each change says whether its timestamp came from
  the matter itself or the snapshot capture — matters for trust when
  reconciling with a system of record.
- **Configurable severity** — firms can treat e.g. `owner` changes as
  critical for conflicts purposes by editing one data object.
- **Reproducible exports** — JSON diff stable for version control; CSV for
  status meetings; no platform lock-in.

## Disclaimer

Stage vocabulary, severity policy, and soon-window are rules-as-data with
sensible defaults. All example data fictional. Not legal advice.
