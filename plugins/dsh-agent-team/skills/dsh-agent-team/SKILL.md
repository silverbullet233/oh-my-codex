---
name: dsh-agent-team
description: Use only when the user explicitly asks to run work through DSH Agent Team or continue a native DSH team session.
---

# DSH Agent Team orchestration

## Activation and limits

This contract applies only to an explicitly activated DSH workflow. Discussing or modifying this plugin does not activate it. Outside that workflow, normal Codex behavior is unchanged. This is behavioral guidance: it does not remove Codex tools, install a global sandbox, change the normal model/subscription, or restrict the user's native Web access. The exposed MCP API has a managed Lead/root boundary; that is not global session tool enforcement.

## Communication and ownership

The communication path is `User <-> Codex main <-> DSH Lead <-> team members`.

Codex main communicates with the user, clarifies requirements and system design, defines task decomposition and acceptance criteria, checks progress, performs independent read-only review, and drives Lead corrections until acceptance. Reuse decisions and authorization already supplied; clarify only material missing information instead of asking for repeated confirmation.

Delegate all implementation, testing and debugging to DSH Lead. Lead owns execution and coordinates team members. Do not implement, run project tests or debug the project yourself. Do not edit project files, apply patches or run project build/reproduction commands as a shortcut. Read-only inspection of source, diffs, logs and artifacts is allowed for design and independent review; inspection does not authorize execution edits.

Do not spawn alternative Codex workers to bypass the team. Do not send instructions directly to DSH members through MCP, native Web, Session/Gateway calls, scripts or another channel. Status/member observations are allowed; direct member instructions are not. The user retains native UI capabilities; this restriction governs Codex's activated workflow.

## Design and delegation

Use the eight dsh-agent-team MCP tools for native workflow control. Call health first: it lazily starts/reuses the dedicated ordinary Web host through official Connection/Typert Gateway. Require native business API 1 and advertised capabilities. Never adopt or stop unrelated user Web processes. If setup/runtime is missing, report the exact prerequisite; do not modify global installations or personal profiles.

Before create, capture the objective, agreed requirements/system design, scope and constraints, task decomposition/dependencies, acceptance criteria, required tests/evidence and delivery expectations. Send that brief to Lead, who plans and performs the execution with native members. Do not turn decomposition into direct member messages.

Inspect the native role catalog. With an empty catalog, omit leadRole for native model inheritance. Explicit names must come from the catalog; role policy and credentials remain in DSH. Create returns the managed Lead/root teamId and Session ID. Keep that teamId and address every send to the same Lead/root. A member Session ID is not a send target; never substitute it or add member/agent/recipient fields. Use a durable caller key and input IDs with identical content. Inspect status after uncertain writes before an explicit retry; native writes are not automatically replayed. Cold continuation may require the returned input ID and continue=true. Text input only.

## Progress, review and acceptance

Read status/result and Lead reports to track the whole Team, including read-only member observations. Ask Lead for implementation, test and debugging evidence; do not run those project commands yourself. Independently inspect the resulting changes and evidence against the design and acceptance criteria. Send concrete findings and correction requests only to Lead, require Lead to retest, and repeat review until acceptance. Distinguish tests reported by Lead from evidence personally inspected; do not claim a rerun that main did not perform.

Acceptance is separate from admitted input, processing, Lead completion and process exit. Require whole-Team completion evidence, expected artifacts and satisfactory independent review. Configured, selected and last-request model routes differ; unknown usage/fees and unloaded selections remain unknown.

If Lead cannot proceed, preserve task identity, collect the exact blocker and admission/outcome evidence, and escalate to the user for a decision. Do not silently take over implementation or route work around Lead. Existing authority covers routine authorized corrections; ask only for genuinely missing decisions or access.

## Native Web and lifetime

Codex uses native Web for observation and user approval handoff, not member instructions or execution that bypasses Lead. Never approve on the user's behalf or invent provider endpoints. dsh_team_web returns a clean origin; never expose launch tokens or API cookies.

MCP EOF closes only the API Peer; native work continues. Stop addresses the whole Team without rolling back files or clearing inboxes; cancellation acceptance and observed quiescence differ. Use dsh_team_shutdown only when ending the owned instance is requested or appropriate: it refuses active/unknown work and gracefully signals only the attributed host. Retained startup/uncertain shutdown must not produce a second writer. See the getting-started and orchestration guides for the API boundary and version scope.
