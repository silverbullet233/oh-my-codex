# Evidence and acceptance (development)

Lead supplies execution evidence; Main inspects it against the agreed criteria through authorized read-only review. Main does not take over project commands or member instructions to fill gaps. Ask Lead for missing evidence, and distinguish what Main inspected from what another agent merely reported.

Keep four statements separate:

- **Assertion:** an agent says a change works or a reviewer reports PASS. Attribute it to its author; it is not independent verification.
- **Source:** a file, commit, dataset or document supports a particular claim. Record its version and the relevant content actually inspected. A resolving URL or matching filename does not verify the content or conclusion.
- **Execution receipt:** an observed tool/CI/log record identifies the invocation, authorized working directory, target commit/input version, outcome, relevant output reference and limitations. An agent-written JSON object is still a report until its execution source is inspected. Exit zero establishes that validator's outcome, not that its checks cover every requirement.
- **Acceptance:** Main's decision against the agreed criteria within existing authority, with any unverified criteria and residual limits stated. Native turn/job termination, successful delivery and accepted business goals are different events. Escalate only missing decisions or new authority.

Lead's handoff should map each criterion to its claim, versioned source/output references, execution receipt references, and known gaps. Main records whether each item is inspected, reported-only, unavailable or stale. Keep credentials out of receipts and avoid environment dumps; sanitized/truncated material must declare its omissions. Runtime reports remain outside versioned source unless explicitly requested.

Check that receipts concern the candidate being accepted: exact commit or captured file/input identities, not a mutable branch name or today's hash of an older run's path. An ended-turn text reference preserves an agent report; it does not itself become a tool-execution receipt. Retain complete evidence through its authorized source when previews are truncated, or report verification unavailable. Never invent a missing receipt, output, timestamp, usage or cost; unknown is not zero.

Examples of incomplete acceptance evidence:

- A completed native turn/job plus reviewer PASS does not show that the requested artifact exists and satisfies its criteria.
- A validator exit zero plus an accessible citation does not prove the cited factual/business conclusion.
- A passing receipt for revision T1 cannot validate a different mutable T2 output; obtain matching evidence through Lead.

Use the project's real validators and inspect their scope. When practical, request an independent check capable of catching the original failure, not only a repetition of the implementation's assumptions. Report who performed each check and its actual outcome. These are behavioral handoff requirements, not signed receipts, a new host acceptance API or a global restriction on tools. Native `goalAccepted: null` remains honest even after Main makes a separate acceptance decision.
