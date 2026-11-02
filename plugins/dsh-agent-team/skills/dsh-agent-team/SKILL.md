---
name: dsh-agent-team
description: Use only when the user explicitly asks to run work through DSH Agent Team or continue a native DSH team session, or explicitly initialize this plugin.
---

# DSH Agent Team orchestration

## Activation and limits

This contract applies only to an explicitly activated DSH workflow. Discussing or modifying this plugin does not activate it. Outside that workflow, normal Codex behavior is unchanged. This is behavioral guidance: it does not remove Codex tools, install a global sandbox, change the normal model/subscription, or restrict the user's native Web access. The exposed MCP API has a managed Lead/root boundary; that is not global session tool enforcement.

## Initialization before Lead exists

Explicit user authorization to initialize this plugin permits Codex main to follow [the Agent bootstrap guide](../../docs/bootstrap.md), prepare its dedicated runtime/Home, and run setup/health before a Lead exists. This narrow initialization permission does not authorize user-project implementation/testing/debugging, work-Team creation, inference, provider credential handling or direct teammate instructions. Use explicit MCP environment values, restart the server and verify actual `dsh_team_health`; CLI health alone is insufficient. Reuse a matching healthy installation, and stop on mismatches or partial state. The guide/setup safety update starts with catalog v0.3.0; it is absent from v0.2.1.

## Communication and ownership

The communication path is `User <-> Codex main <-> DSH Lead <-> team members`.

All communication between Codex main and DSH Lead must be in English: task briefs/create/send text, follow-up instructions and questions, review feedback, structured free-text answers, and Lead reports/questions/replies. Include `Communicate with Codex main in English.` in initial briefs and follow-up instructions. If Lead replies in another language, remind the same Lead/root to use English. Preserve code, paths, symbols, exact machine identifiers/option values and necessary original-language quotations verbatim; write the surrounding prose in English. Never translate structured answer IDs or selected option labels. This is a behavioral contract, not runtime language detection or automatic translation.

Codex main communicates with the user, clarifies requirements and system design, defines task decomposition and acceptance criteria, checks progress, performs independent read-only review, and drives Lead corrections until acceptance. Reuse decisions and authorization already supplied; clarify only material missing information instead of asking for repeated confirmation.

Delegate all implementation, testing and debugging to DSH Lead. Lead owns execution and coordinates team members. Do not implement, run project tests or debug the project yourself. Do not edit project files, apply patches or run project build/reproduction commands as a shortcut. Read-only inspection of source, diffs, logs and artifacts is allowed for design and independent review; inspection does not authorize execution edits.

Do not spawn alternative Codex workers to bypass the team. Do not send instructions directly to DSH members through MCP, native Web, Session/Gateway calls, scripts or another channel. Status/member observations are allowed; direct member instructions are not. The user retains native UI capabilities; this restriction governs Codex's activated workflow.

## Design and delegation

Use the dsh-agent-team MCP tools for native workflow control. Call health first: it lazily starts/reuses the dedicated ordinary Web host through official Connection/Typert Gateway. Require native business API 1 and advertised capabilities. Never adopt or stop unrelated user Web processes. If setup/runtime is missing, follow the bootstrap guide only with explicit initialization authorization; otherwise report the exact prerequisite. Do not modify global installations or personal profiles.

Before create, capture the objective, agreed requirements/system design, scope and constraints, task decomposition/dependencies, acceptance criteria, required tests/evidence and delivery expectations. Send that brief to Lead, who plans and performs the execution with native members. Do not turn decomposition into direct member messages.

Inspect the native role catalog. With an empty catalog, omit leadRole for native model inheritance. Explicit names must come from the catalog; role policy and credentials remain in DSH. Create returns the managed Lead/root teamId and Session ID. Keep that teamId and address every send to the same Lead/root. A member Session ID is not a send target; never substitute it or add member/agent/recipient fields. Use a durable caller key and input IDs with identical content. Inspect status after uncertain writes before an explicit retry; native writes are not automatically replayed. Cold continuation may require the returned input ID and continue=true. Text input only.

After every successful Team create, present `teamId` and the returned `web.url` to the user, including on an idempotent retry. With `web.scope=host`, label the link as the owned-host Web homepage, not a Team-specific page: pinned native Web has no supported Session permalink. Never invent a deep link or expose launch tokens, cookies or credentials. Displaying the URL does not authorize opening a browser; use the existing Web handoff only when requested or otherwise authorized.

## Create-time permissions

Omit `permissionPreset` to preserve native defaults. Only an explicit user selection permits passing an exact `health.permissionPresets.options[].value`, after checking the host advertises `create-permission-preset`. Inspect the catalog's actual sandboxMode/approvalPolicy; never infer them from the name or self-upgrade to avoid an approval. The pinned host 0.6.0 supplies this capability; older 0.5.0 lacks it: stop on an explicit unsupported request, without dropping the field or changing pins.

The host applies and verifies the selected preset on a fresh root before the first task/member, and returns effective `permissions` (preset, sandbox policy, approvalPolicy and sequence cut). Keep the same preset in identical create retries. Existing/restored Teams are checked read-only; mismatches or partially initialized Sessions stop without reapplying permissions. Inspect reserved IDs after failures rather than changing keys to bypass them. No global defaults or existing Teams are changed.

Native `danger-full-access` normally bundles full sandbox access with approval `never`; configured bundles can differ. `never` denies actions that still require approval, not approve-all. New members snapshot the parent's sandbox and pin approval to `never`; later Lead changes do not update existing members. Workspace admission is not complete process confinement, and this preset grants no OS privilege escalation. Keep the separate explicit approval boundary intact. See [permission details](../../docs/orchestration.md#create-time-permissions).

## Progress, review and acceptance

Read status/result and Lead reports to track the whole Team, including read-only member observations. Ask Lead for implementation, test and debugging evidence; do not run those project commands yourself. Independently inspect the resulting changes and evidence against the design and acceptance criteria. Send concrete findings and correction requests only to Lead, require Lead to retest, and repeat review until acceptance. Distinguish tests reported by Lead from evidence personally inspected; do not claim a rerun that main did not perform.

Acceptance is separate from admitted input, processing, Lead completion and process exit. Require whole-Team completion evidence, expected artifacts and satisfactory independent review. Configured, selected and last-request model routes differ; unknown usage/fees and unloaded selections remain unknown.

When health advertises `ended-turn-results`, use `dsh_team_turn_result` to retain an ended Lead turn's `resultRef` before later inputs. Reuse that reference and `page.nextOffset` for complete UTF-8 JSONL text-event reads across turns/reconnects. These audit events preserve replacement markers; they are not a canonical conversation or goal-success verdict. Missing history and scan limits are explicit errors, never latest-result fallback. This is a development capability absent from published host 0.6.0; do not change installation pins or pretend old hosts support it. See [historical read details](../../docs/interactions.md#historical-ended-turn-reads-development).

If Lead cannot proceed, preserve task identity, collect the exact blocker and admission/outcome evidence, and escalate to the user for a decision. Do not silently take over implementation or route work around Lead. Existing authority covers routine authorized corrections; ask only for genuinely missing decisions or access.

## Lead questions and approvals

Use `dsh_team_wait` after delegation for meaningful changes, pending input or whole-Team completion; reuse its opaque baseline as `after`. Main is the default Lead question handler through `dsh_team_answer` with source=main, within the existing requirements and authority. For missing information, new decisions or expanded authority, mark `dsh_team_escalate`, ask the user in normal conversation and answer with source=user. Do not treat coordination answers as project implementation or direct teammate instructions.

Use `dsh_team_pending` to refresh current delivery tokens after reconnect/cancellation; never automatically replay old affirmative answers. Questions and approvals are separate. `dsh_team_approval` permits one-shot approval only with explicit user authorization for that exact action; never blanket/always approve or invent authorization. A rostered member's native owner approval is an authority event, not a task instruction. Ordinary member conversation remains unavailable. Pending questions take priority over originating-turn completion, and submission/admission is distinct from processing. See [interaction details](../../docs/interactions.md) for bounds, receipts and native stream behavior. This bridge starts with catalog v0.3.0 / plugin 0.4.0, not v0.2.1.

## Native Web and lifetime

While Codex controls the Team, use native Web for observation/settings only. Sending Web messages or answering forwarded questions/approvals there is unsupported concurrent interaction; no Web/Codex arbitration is implemented. Native settlement still invalidates cancelled deliveries. Do not use Web for member instructions or execution that bypasses Lead. Never approve on the user's behalf or invent provider endpoints. dsh_team_web returns a clean origin; never expose launch tokens or API cookies.

MCP EOF closes only the API Peer; native work continues. Stop addresses the whole Team without rolling back files or clearing inboxes; cancellation acceptance and observed quiescence differ. Use dsh_team_shutdown only when ending the owned instance is requested or appropriate: it refuses active/unknown work and gracefully signals only the attributed host. Retained startup/uncertain shutdown must not produce a second writer. See the getting-started and orchestration guides for the API boundary and version scope.
