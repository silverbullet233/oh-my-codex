# Versioned task context and coordination (development)

Put task context in the English brief sent to Lead. These are handoff fields, not new MCP arguments or host-enforced revision tokens. Main owns requirements/design and acceptance; Lead owns project implementation, tests, debugging and member instructions. Managed-root-only MCP targeting is enforced at that interface; it does not globally disable Codex's other tools.

Agree a small contract before execution:

- `contractVersion` and `scopeRevision`, objective, constraints and dependencies;
- declared input versions/snapshots and expected output shape/locations;
- acceptance criteria, required evidence, agreed checkpoints and decisions needing escalation;
- task owners, intended write scopes and explicitly required exclusive resources.

Lead acknowledges the current revision and passes the relevant context to members through native Team coordination. Task context changes are new Lead inputs, not silent edits of saved role/model snapshots. Keep configured, selected and last-request routes distinct; do not change provider/model/permissions merely to avoid a blocker.

## Change scope explicitly

A revision label alone invalidates nothing. Before admitting a replacement, account for the old revision's known input IDs and work. Uncertain admission must be investigated with the original identity; never create a fresh key/Team just to bypass it. Identical retries keep their content/IDs. A newly authorized revision uses a new input ID and states what it supersedes.

Inspect available input/turn/Job evidence. Explicitly withdraw a no-longer-wanted input only while its exact message is still live and pending and the host supports it. Entered work cannot be unconsumed; Lead must identify what ran, what remains and what needs cancellation, adoption or revalidation. Queued, interrupted, cold or unknown work needs an explicit disposition within existing authority before continuation. Stop/steer/admission acknowledgement is not proof the new revision has been applied. Do not resume cold execution simply to inspect or clear a queue.

Tag handoffs and generated outputs with their run/input/revision identities. Earlier outputs remain tied to their original scope until Main determines they satisfy the current criteria; current hashes and latest text cannot silently reattribute them. Obtain matching evidence through Lead. Preserve task/input/history records rather than marking stale or failed work completed to satisfy a lifecycle guard. Ask the user only for missing intent, changed requirements or new authority.

## Coordinate resources honestly

Lead declares exact resource identity, required exclusivity/capacity, owning task/Job and release conditions before parallel work. Coordinate competing writers and exclusive resources explicitly; command substrings, process names, arbitrary PID matching or an empty Team Job list are not ownership/exclusion evidence. Native task/write-scope metadata expresses intended coordination, not a universal filesystem or resource lock.

Cooperative serialization within this Team is useful but does not fence external clients, other Teams or arbitrary processes. If the task requires stronger exclusion, use an existing authorized allocator/locking mechanism with the required guarantees or report the missing capability. Lease expiry does not stop an old holder, and a terminal Job record does not independently verify OS resource release. Do not invent a plugin lease, kill unrelated processes, self-escalate permissions or claim global safety from observed idle state.

These are behavioral contracts and reviewable checkpoints. Preserve evidence of deviations, route corrections through Lead and revalidate affected work. There is no automatic shared-context invalidation engine, global tool ban or cross-process fencing guarantee here.
