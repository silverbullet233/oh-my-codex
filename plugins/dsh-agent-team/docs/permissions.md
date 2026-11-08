# Codex permissions (unreleased candidate)

**Only reliably executable filesystem rules are inherited through the experimental state/launcher channel.** Network uses the enabled product default; full Codex approval/reviewer and managed-network inheritance are not claimed. A [scoped real-model acceptance](acceptance-2026-11-08.md) passed automatic metadata → official launcher → host → Lead → model output and cleanup. It does not certify complete initiating-session permissions; merging this implementation does not close those protocol gaps or publish the candidate.

## Sources and defaults

**Network defaults to enabled product intent, not inherited Codex network policy.** The plugin adds no separate network restriction. Actual OS/process/network controls and administrator requirements remain effective; enabled intent is not proof of connectivity. The current protocol cannot reliably separate a supplied restricted network from its filesystem rules or identify whether that restriction is administrator-owned. Such a state returns `NETWORK_POLICY_SPLIT_UNAVAILABLE` before host startup/work. It is never rewritten or retried as full access.

| Offered policy/source | Supported behavior |
| --- | --- |
| Managed state with network enabled and official launcher | Preserve the complete state unchanged, inheriting filesystem rules through the whole-host sandbox. Select network enabled as product default; use native ask, with Codex approval unknown. |
| Disabled state with official launcher | Pass unchanged; native ask remains a separate product policy, not verified YOLO. |
| Managed state with restricted/missing/unknown network | Report unsupported separation and stop before startup/work. Preserve the original state; no full-access fallback or guessed projection. |
| Missing metadata/launcher or unsupported/external state, without a retained incompatible network contract | Explicit `full-access-fallback`: native danger-full-access/never, no explicit writable roots, network enabled product intent, reported capability-gap reason and inheritance unavailable. |
| Explicit profile / optional strict attestation | Preserve selected native intent and source. Invalid configuration, source conflicts or signatures fail closed; no downgrade. |

`filesystemSource: codex-request-metadata`, `networkSource: product-default`, `approvalSource: native-default`, `codexApproval: unknown` and `codexNetwork: not-inherited` distinguish the supported portions. `effectiveNetworkVerified`, `signatureVerified` and `osLimitsVerified` remain false. No environment YOLO/profile flag manufactures inheritance or user authorization. Native `never` denies still-required approval; it is not approve-all.

Fallback is limited to the enumerated inheritance capability gaps. Known restricted network, unknown network on a managed state, or an unsupported explicit network value is retained and refused even when its launcher is missing or its state type is unsupported. Capability absence never erases these constraints. Unsupported state with no network contract remains an enumerated capability gap, with no claimed filesystem or network inheritance. It does not handle an actual launcher, OS, configuration or identity refusal. Its native full-access default grants no outer OS/network privilege. Original state, source, cwd, launcher, selected native intent and network-default version enter the reuse binding. Changing network intent cannot silently reuse an older host with the same filesystem state; mismatched hosts are retained without automatic restart or upgrade.

Fresh Leads and actual Team/delegated children receive native policy before work. Restored policy is verified without rewriting. Independent native forks keep native behavior. The [historical real-model report](acceptance-2026-11-08.md) predates the current enabled-network intent and applies only to its exact recorded hashes.

## Explicit launch configuration

Create a private, current-user, non-symlink JSON file, then select its **absolute path** in user-controlled MCP launch argv:

```json
{
  "sandboxMode": "workspace-write",
  "approvalPolicy": "ask",
  "writableRoots": ["/physical/workspace"],
  "networkAccess": "unknown"
}
```

```text
node ${PLUGIN_ROOT}/src/mcp/main.mjs --permission-profile /private/profile.json
node ${PLUGIN_ROOT}/scripts/client.mjs --permission-profile /private/profile.json health
```

The profile must use native `ask` or `never`. Workspace-write needs explicit absolute roots matching the host's resolved native roots; read-only/full-access use `[]`. `networkAccess` accepts unknown/enabled/restricted. Unknown is not displayed as disabled network. An explicit restricted network without the official outer backend rejects network-capable work (`NETWORK_ENFORCEMENT_UNAVAILABLE`), including Team admission; it never claims that native DSH enforces a network setter. Invalid explicit configuration is an error, not a default fallback. Profiles only configure fresh Teams; they never rewrite or escalate retained Teams or remove outer process restrictions.

## Official sandbox-state protocol and execution

MCP initialize advertises `experimental["codex/sandbox-state"]`. Only `tools/call.params._meta` is forwarded in protocol options, detached from tool arguments. Tool schemas reject attempts to submit metadata as model arguments. The legacy `codex/sandbox-state-meta` alias is accepted; unequal aliases fail. The complete JSON state, including deny/read/temp entries and unknown fields, reaches the launcher unchanged. No reduced native tuple reconstructs it.

The capability-probed local stdio envelope supplies an absolute `codex/sandbox-launcher.codexExecutable`. The exact invocation is:

```text
<absolute-codex> sandbox --sandbox-state-json <complete-opaque-state> -- <node> <bootstrap> <native-host-args>
```

No PATH search, extra readable root, socket exception or network override is added to a selected supported sandbox. Actual executor/OS failure never triggers an unsandboxed retry. A bootstrap **inside** the sandbox imports the native CLI and reports its actual host PID before readiness. The existing PID/start-time/runtime/home/nonce and responding-health guards remain required; shutdown targets that attributed host, rather than confusing it with the launcher. If a launcher exits while its attributed host survives, or before bootstrap host identity is confirmed, startup attribution is retained and a second writer is refused. Launcher exit alone never proves descendant exit.

For a supported state, all user work originates in that sandboxed host: native filesystem operations (including direct Web file APIs), shell/terminal execution, Web/network tools, arbitrary installed tools, native Team members and background descendants. The detached runner and MCP connection remain outside it for coordination/diagnostics; they do not execute Team tasks. Detaching does not remove OS restrictions. A matching tuple is not an OS probe. `osLimitsVerified` remains false.

This placement intentionally also subjects host configuration reads, durable state writes, loopback listening and model/control-plane networking to the same policy. A typical restricted Codex policy may therefore prevent Web host startup or model requests. The plugin does not widen the state to make them work. No control-plane/user-network split or separate supervisor is implemented. These availability limits remain a product gap; an actual refusal never selects fallback.

`external` state cannot recreate its producer's outer boundary (the official CLI otherwise degrades it to read-only). It and future state types therefore use an explicitly reported full-access fallback, as does a missing supported launcher. Invalid metadata, conflicting aliases and invalid launcher paths refuse startup/new work. Native restricted-network configuration still returns a local health limitation without spawning; passive status/stop/withdrawal/escalation can use an existing attributed host.

The protocol is experimental. Evidence is pinned to Codex CLI **0.164.0**, official commit `6aaac694803004a63c6f393d153c96d22521a6b9`: [metadata contract](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/codex-mcp/src/sandbox_metadata.rs), [metadata injection](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/mcp_tool_call.rs), [official executor](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/cli/src/debug_sandbox.rs). The executor also loads local configuration. Full approval/reviewer and all managed-network/proxy configuration are absent from the state; DSH ask is not Codex on-request + auto_review. These missing fields stay explicitly unknown/partial. Native Web owners retain their existing API authority inside whatever OS boundary actually applies.

## Reuse and continued work

The entire opaque state, launcher, source, cwd, backend and requested native policy enter the host binding. Retained record and responding health must match; a missing/mismatched identity or boundary refuses new work without upgrading, restarting or stopping the old host. The same tuple alone does not prove identical OS restrictions. A lost metadata channel selects a different full-access-fallback binding and cannot reuse a previously sandbox-bound host. Old read-only native-default hosts also mismatch; the plugin never upgrades or replaces them automatically.

Create/send/question answers/all approval replies recheck context after Gateway readiness/reconnection and immediately before native submission. Current native root policy must still match saved Team intent. Continued answers, including continued denials that enqueue work, use the same guard. Failed preflight leaves delivery pending for a legitimate retry. Passive observation, exact withdrawal, escalation and guarded shutdown retain their existing attribution/control paths.

Per-Team `permissionPreset` overrides remain available only with an exact signed external user grant. Model-written explanations are not grants. Ordinary/explicit/metadata sources do not synthesize them. This is not a general mechanism to change an existing Codex session's permissions.

## Optional strict attestation

A user or deployment administrator must pin an Ed25519 **public** key in the MCP launch arguments, using `--permission-authority /protected/authority.json`. That private, current-UID, non-symlink JSON file contains `{ "version": 1, "publicKey": "<PEM public key>" }`. The path, key and launch configuration must be outside the agent's writable control. File ownership/mode checks alone do not establish that trust. There is no authority-key environment variable and the plugin never generates, enrolls or replaces production keys. The signing private key belongs to an external trusted supervisor, inaccessible to Codex, DSH and project code. An arbitrary key nominated by the worker is not a trusted publisher.

That supervisor must obtain the **actual effective Codex session restrictions from its runtime authority**, and launch the MCP process and its descendants inside that same enforced boundary. It must account for narrower macOS, container, filesystem, network and parent-process limits. Reading defaults, environment flags or user claims is insufficient. If the supervisor cannot establish effective limits or cannot ensure descendant confinement, it must not issue `basis: "effective-runtime"`. In particular, an MCP launched outside Codex's enforced boundary cannot claim inheritance merely because Codex invokes it.

The plugin verifies the publisher's signature, not the publisher's observations or OS enforcement. Responses say `source: "launcher-attested"`, `signatureVerified: true`, **`osLimitsVerified: false`**. These mean authenticated supervisor evidence, not independent verification of Codex or macOS policy. This is a defined integration contract, not an included Codex supervisor or an OS attestation service.

## Per-process protocol

1. Configure `DSH_AGENT_TEAM_PERMISSION_CONTEXT` with the path of a private context JSON file. This environment value is only a transport locator; it conveys no authority.
2. Start `src/mcp/main.mjs --permission-authority /protected/authority.json`. It emits a public `dsh-permission-challenge` JSON line on stderr with a random `audience` unique to that MCP process. The CLI also emits the challenge and waits up to five seconds for the handoff.
3. The trusted supervisor observes this challenge on its own launch channel, establishes current effective restrictions and atomically writes the signed context. Do this before forwarding MCP requests. Do not ask the model to invent or sign context. Do not route signing requests from project code to an unrestricted signing oracle.
4. Every request requiring startup or work reads and verifies the context again. Create/send check freshness again after startup/preflight. A changed, expired or unsupported context stops admission. Expiry does not terminate work already running.

The envelope is `{ "payload": "<exact UTF-8 JSON string>", "signature": "<base64 Ed25519 signature over those exact bytes>" }`. The signed payload has precisely these fields (timestamps below are placeholders):

```json
{
  "version": 1,
  "audience": "<current MCP challenge>",
  "basis": "effective-runtime",
  "sessionId": "<actual Codex session identity>",
  "issuedAt": 0,
  "expiresAt": 0,
  "boundaryId": "<supervisor identity of the complete enforced boundary>",
  "permissions": {
    "sandboxMode": "workspace-write",
    "approvalPolicy": "on-request",
    "writableRoots": ["/physical/workspace"],
    "networkAccess": "enabled"
  },
  "overrides": []
}
```

Use current millisecond timestamps; validity is at most 24 hours. The audience prevents reuse in another MCP process. A signed payload with `basis: "declared-configuration"` is still unverified and rejected, including one requesting full access. Missing/unknown fields, signatures from another key, stale contexts, relative/NUL roots and unsupported policy values are rejected. The supervisor must refuse false effective-runtime statements; a signature cannot make a false statement true.

`boundaryId` must identify the complete effective boundary, including network allowlists, denied filesystem subpaths, temporary-directory rules and all outer limits not represented by the small permission tuple. Change it whenever any of those restrictions changes. Use canonical physical root paths. This strict channel authenticates publisher statements; `danger-full-access` plus `never` alone does not prove unrestricted network or OS privilege.


Strict attestation remains an optional external integration contract. It has no included publisher and is not needed for ordinary installation. Any configured authority/context error fails closed; there is no fallback to full access. Native restricted network is now rejected because a signature alone does not enforce it. Strict attestation or an explicit profile combined with Codex protocol sandbox state is rejected as a conflicting configuration, rather than ignoring either source.

## Validation boundaries

Protocol/admission tests exercise actual production modules with synthetic metadata. Native data-service tests exercise first-input/member/restored policy, including unknown network, plus independent-fork and disposal regressions. The CI synthetic launcher lifecycle test checks bootstrap, actual host PID, Gateway health/binding, continuation and guarded shutdown; its launcher deliberately provides no OS sandbox.

The opt-in `scripts/test-codex-boundary.mjs /absolute/codex /absolute/host/repo` uses the real launcher, actual pinned DSH FileSystem and synthetic shell/background descendants without sockets or credentials. It emits each check's `passed`/`failed`/`not-run` status, rejection phase and evidence layer. Native application refusals without an OS error cause are identified separately from `EPERM`/`EACCES`. Unexpected I/O errors, missing reports, launcher failures, unexecuted checks and cleanup failures cannot produce the final `boundary-passed` record. Both context disposal (`ctx.fiber.dispose()`) and temporary-directory cleanup run on failure; cleanup errors remain visible without replacing the primary error. Nineteen no-process fixture regressions cover these paths and run in the isolated gate.

Development evidence on 2026-11-06, using `/opt/homebrew/bin/codex` (0.164.0): the original execution within the outer restricted runtime failed at `sandbox_apply` before bootstrap. A later formally approved single execution reached bootstrap but exposed the probe's incorrect `ctx.dispose()` call, which obscured the primary error. Neither attempt established boundary acceptance. After correcting the lifecycle API and placing path resolution inside rejection assertions, **one new native Codex `require_escalated` request was approved and executed**. The corrected probe and official launcher both exited 0 with these results:

| Check | Result | Observed evidence |
| --- | --- | --- |
| Native allowed write | passed | Actual DSH FileSystem write and content readback |
| Native blocked write | passed | `FS_PERMISSION_DENIED` caused by OS `EPERM` on staging-directory `mkdir` |
| Native restricted read | passed | OS `EPERM` during `resolve`/`realpath`; `readText` did not execute |
| Protected Node write | passed | OS `EPERM` on `open` |
| Allowed shell write | passed | Shell exit 0 and content readback |
| Background descendant write | passed | Shell `& wait`, exit 0 and content readback |
| Denied shell write | passed | Shell exit 1, `Operation not permitted` |

Context disposal, unchanged protected/private content, absence of blocked output files and temporary-root removal all passed. The request added no reusable approval prefix or persistent policy change. The inner state retained root-read, the one synthetic writable directory, its read-only protected file, its denied private file, restricted network and opaque future fields; no extra roots or sandbox flags were added.

This proves only the exercised synthetic filesystem/shell/descendant boundary through the production launcher/bootstrap. It does **not** establish complete initiating Codex session inheritance, Codex approval/reviewer or YOLO behavior, managed-network/proxy policy, real Web/network behavior, or whole native-host/model/control-plane availability. Those were **unverified** in that boundary probe. The later [scoped real-model acceptance](acceptance-2026-11-08.md) demonstrates one working host/model configuration; complete permission inheritance remains unverified.

## Real-model observations and current fallback validation

The earlier real Codex CLI tools/call observation automatically injected `codex/sandbox-state`, its legacy alias and the local launcher identity, without model-supplied metadata. A separate candidate host attempt reached official DSH 0.2.2-alpha.3 `runCli`, then failed with OS `EPERM` at `prepareProfile` writing `profiles/web/cordis.yml` under a genuinely read-only state. It did not reach model inference. This is a host runtime-state availability failure, not missing inheritable information, and must not trigger fallback or added writable exceptions. Startup errors now explain these runtime/configuration, loopback and control-plane needs and retain the private redacted diagnostics path.

Current regressions check the fallback tuple/reasons, invalid-input refusal, available opaque-state priority, single-attempt startup failure, source/state/cwd/launcher reuse fencing, first Lead/member policy, recursive spawn/fork delegation and cold restoration without rewriting saved policy. These are synthetic protocol and real native data-service tests. They do not certify real YOLO approval/reviewer inheritance or managed-network policy. Separately, the [2026-11-08 scoped acceptance](acceptance-2026-11-08.md) passed the current candidate host/model path with network enabled. It did not test fallback with a real provider, restricted networking or authenticated-browser UI.

## Authenticated Web URL

`dsh_team_web_url({ "teamId": "<managed-root>" })` returns the owned-host authenticated homepage only after explicit user request, never a Team permalink. It never starts a host or opens a browser. The reusable bearer URL grants owner access across the host and may appear in client history; only this successful query may disclose it. Cancellation, including cleanup-phase cancellation, prevents disclosure. Its process lifetime and native browser-cookie lifetime are independent of permission-context expiry. No real bearer URL/token was read during this work.

## Network separation limitation

On official Codex `0.167.0-alpha.3.2` ([fixed source](https://github.com/openai/codex/blob/c40729ea5cf8e947481b130c59807273eda2f8e9/codex-rs/cli/src/lib.rs#L26-L84)), state JSON has only additional-readable-root and disable-network options, no independent enable-network option. The [executor](https://github.com/openai/codex/blob/c40729ea5cf8e947481b130c59807273eda2f8e9/codex-rs/cli/src/debug_sandbox.rs#L190-L323) selects the supplied profile rather than intersecting it again with a config-selected profile. The [opaque-state contract](https://github.com/openai/codex/blob/c40729ea5cf8e947481b130c59807273eda2f8e9/codex-rs/codex-mcp/src/sandbox_metadata.rs#L23-L44) requires unchanged forwarding. A version check alone cannot establish that a restricted field is not an administrator requirement. Consequently this implementation never rewrites that field, reconstructs filesystem grants, or uses a profile that omits management requirements to make network open. Restricted-state separation is a concrete unsupported case, not a passing test.

The optional synthetic filesystem-boundary script now builds network-enabled state to match the current product policy. The older network-restricted probe recorded above belongs to its historical implementation; this change has not rerun it or made a new real network/provider call.
