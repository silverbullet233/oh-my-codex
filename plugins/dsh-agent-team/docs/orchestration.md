# Activated orchestration contract

**Release inclusion:** catalog **v0.2.1** / plugin **0.3.2** was published on 2026-10-31. Its activated main/Lead ownership contract is unchanged here. The Agent initialization guide and [interaction bridge](interactions.md) in this source branch are unreleased and are not present in that immutable tag.

Activation is explicit: ask Codex to use DSH Agent Team for the work. Merely discussing/updating the plugin does not activate it, and other Codex workflows remain unchanged.

Before a Lead exists, explicit plugin-initialization authorization permits main to follow [the bootstrap guide](bootstrap.md) and run setup/health only. It does not authorize user-project execution, Team creation/inference, provider credential handling or teammate bypass. This initialization clarification is unreleased.

The communication path is `User <-> Codex main <-> DSH Lead <-> team members`.

Codex main and DSH Lead must communicate in English, including task briefs, follow-up questions/instructions, review feedback, free-text answers and Lead replies. Main includes `Communicate with Codex main in English.` in initial briefs and follow-up instructions. Keep code, paths, symbols, exact IDs/option values and necessary original-language quotations unchanged. This unreleased language contract is behavioral guidance; the runtime does not detect or translate language.

After each successful create, main presents `teamId` and `web.url`. `web.scope=host` identifies the owned-host homepage; it is not a Team-specific link. Native 0.2.2-alpha.2 persists Session selection in [workspace navigation state](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-alpha.2/packages/client/ui-workspace/src/client/navigation.ts), without a supported Session permalink. Find the returned root ID in Web. The URL contains no launch capability or cookies, and displaying it does not auto-open a browser. Authentication, when needed, uses the existing authorized `dsh_team_web` handoff. This create response/convention is unreleased.

| Owner | Responsibility |
| --- | --- |
| User and Codex main | Requirements, system design and material scope decisions |
| Codex main | Task decomposition, acceptance criteria, progress, independent read-only review and driving Lead corrections |
| DSH Lead | All implementation, test execution, reproduction/debugging and coordination of native team members |
| Team members | Work delegated by Lead; reports go through Lead |

Codex main may read source, diffs, logs, status and artifacts for design/review. It must not edit project files, implement fixes, execute project tests/builds/debugging, spawn alternative Codex execution workers, or send instructions directly to members. A read-only member observation is allowed and is not a member instruction. Design decomposition and acceptance criteria are sent to Lead; Lead decides native member coordination. If Lead is blocked, main reports the exact blocker to the user instead of taking over execution.

Main follows progress and reviews the changes/evidence independently. Findings go to the same Lead, which makes corrections and reruns tests. Main repeats review until acceptance, and distinguishes Lead-reported tests from evidence it inspected. A Lead being idle, admitted input or a process exiting does not establish whole-Team completion.

## What the boundary enforces

The MCP surface exposes health, Web handoff, create, send, status, result, stop and shutdown, plus the unreleased typed pending/answer/escalate/approval/wait tools. Create prepares the managed root Session as Lead and returns its durable teamId/sessionId. Send addresses that managed Lead/root; member targeting fields and alternate member-message tools are not exposed. The host's managed-Team admission rejects a child Session ID as UNKNOWN_TEAM. Status/result may include member observations.

The actual official-CLI acceptance gate checks that the returned root is the native Lead and that a send using a real native child ID is rejected. MCP regressions check allowed fields/tools and that create/send preserve the root identity. These checks establish this plugin API boundary, not a restriction on every possible upstream/native channel.

This skill is behavioral guidance. It does not remove Codex's other tools, create a global sandbox or install a Codex session tool whitelist. Native role creation guards control DSH role execution, not Codex main. The ordinary authenticated native Web/Gateway may offer broader capabilities to users; their access is unchanged. Codex must not use Web, direct Session calls, scripts or another tool to bypass the Lead-only workflow. While Codex controls the Team, Web observation/settings are supported; Web messages or answering forwarded prompts/approvals are unsupported concurrent interaction. No client arbitration is added; users retain native controls. A rostered member authority event may be decided through the separate explicit approval tool; it does not expose member task instructions.

Host dsh-team-roles 0.5.0 already supplies the managed root API boundary, but does not install or globally enforce this Codex behavior. The installed 0.3.2 skill supplies the opt-in contract. Future releases must preserve the distinction between behavioral guidance, exposed API validation and any separately verified tool enforcement.

## Create-time permissions (unreleased)

Optional `dsh_team_create.permissionPreset` requires the companion host's `create-permission-preset` capability, absent from published host 0.5.0. Version pins remain unchanged; this source change does not make the feature available in existing tags. Omission keeps native defaults. After explicit user selection, use an exact `health.permissionPresets.options[].value` and inspect its resolved `sandboxMode` and `approvalPolicy`. Never select a broader preset merely to avoid approval, or silently omit a rejected selection.

The host validates the catalog, creates a blank root, applies the preset through the native service, flushes and verifies effective permissions before submitting any task. Create returns `permissions: { preset, sandbox, approvalPolicy, asOfSeq }`; sandbox includes the effective workspace root and any additional writable roots. Permission intent participates in the create digest. Identical retries verify existing/restored Sessions without setters; different intent, drift or partial initialization fails closed, including subsequent sends. Inspect reserved IDs on failure; do not switch keys to bypass an incomplete Session.

The native default `danger-full-access` bundle is sandbox `danger-full-access` plus approval `never`, but configuration can redefine it. `never` denies actions still needing approval rather than granting every request. Newly created members snapshot the parent's sandbox and pin approval to `never`; later Lead changes do not update existing members. Allowed workspace admission is not complete process confinement, and selecting a preset does not grant OS privileges. No global defaults, personal profiles, credentials or existing Teams are changed; one-shot approval remains separately authorized.
