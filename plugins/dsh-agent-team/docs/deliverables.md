# Run inputs and generated deliverables (development)

This Main/Lead handoff convention uses existing project tools. It adds no storage service and cannot constrain arbitrary shell writes. Native permissions remain authoritative; use only authorized task data and task-owned directories, never provider/auth credentials. Keep snapshots, manifests and execution receipts outside versioned source unless repository artifacts were requested.

Before execution, agree a durable `runId`, the create/send `inputId`, input versions, expected outputs and acceptance checks. Retain those IDs after uncertain admission; do not start another run to bypass uncertainty. Lead coordinates writers and tells members exactly which snapshot/version to read. For source changes, record the starting commit plus relevant dirty/untracked inputs; a branch name or commit alone may omit actual inputs. Deliver source changes through Git commits/diffs; the publication recipe below concerns generated files.

Capture declared data inputs while their producer is quiescent, before execution. Write private snapshots with exclusive creation, hash the captured bytes and pass the snapshot paths to execution. A current hash of a mutable original cannot establish what an earlier run used. If stable capture cannot be established, stop and report that limitation. Do not expose a snapshot until preparation and its manifest are complete; interrupted preparation is not automatically reusable.

## Publish once

Give generated outputs run-specific names. Each staged file has one writer in a task-owned directory; finish and close it before publication. Prefer the project's existing atomic no-replace mechanism. On a filesystem supporting hard links, the following minimal Node mechanism publishes a complete staged file at a new name:

```js
import { link, unlink } from 'node:fs/promises';

export async function publishClosedFile(stagedFile, finalFile) {
  await link(stagedFile, finalFile);
  let stagingCleanupConfirmed = true;
  try { await unlink(stagedFile); } catch { stagingCleanupConfirmed = false; }
  return { published: true, stagingCleanupConfirmed };
}
```

Both paths must be on the same filesystem, with exclusively controlled staging and stable authorized parent directories. `EEXIST` is a conflict: preserve the existing output and inspect run identity/content before deciding what to do. Do not replace it, claim success, or silently retry under a different name. Unsupported links or `EXDEV` require a deliberate publication design; do not fall back to overwriting rename or a consumer-visible partial copy. Cleanup failure after linking does not undo publication; retain its receipt and avoid duplicate publication. Sync file/directory state when crash durability is required.

Atomic no-replace applies at publication, not permanent immutability. Never modify the final file or another link to its inode afterward. Other same-user tools can still alter it; this convention does not enforce all filesystem writes or resist hostile path changes. Do not delete unknown paths during recovery.

## Handoff

Return a manifest associating the run with captured input and output identities:

```json
{
  "runId": "agreed-run-id",
  "teamId": "managed-root-id",
  "inputId": "original-admission-id",
  "inputs": [{"snapshot": "declared-input.snapshot", "sha256": "captured-byte-digest"}],
  "outputs": [{"path": "run-specific-output", "sha256": "published-byte-digest"}],
  "leadTurn": {"turn": 1, "resultRef": null}
}
```

Record preparation/publication receipts and validation evidence separately from assertions. Use an actual ended-turn reference only when supported; otherwise state it is unavailable. Hashes identify bytes, and a manifest records an association; neither proves execution read those inputs or that the business result is correct. Main inspects the outputs and available execution/validation evidence against the agreed acceptance criteria before accepting delivery. Missing evidence remains unknown.
