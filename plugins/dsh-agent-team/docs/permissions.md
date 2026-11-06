# Codex permissions (unreleased candidate)

**Keep this candidate Draft. Full automatic matching of the initiating Codex session, including YOLO approval behavior, is unfinished.** This branch implements the experimental sandbox-state protocol and a whole-host launcher backend. It does not obtain Codex's full approval/reviewer or managed-network configuration. No real initiating-session acceptance has passed.

## Sources and defaults

| Source | Requested native policy | Execution and remaining unknowns |
| --- | --- | --- |
| `native-default` (ordinary install without metadata) | read-only, ask, no writable roots, network unknown | Existing native DSH controls; Codex sandbox/approval/network unknown. Compatible fallback, not inheritance. |
| `explicit-configuration` | Exact private profile selected in user-controlled launch argv | User configuration intent, not detected Codex runtime. Native network enforcement unverified. |
| `codex-request-metadata` | Native full-access + ask behind the opaque outer sandbox | Entire native host launched with official Codex sandbox state; approval unknown, complete managed-network rules unavailable. |
| `launcher-attested` (optional strict mode) | Exact signed native tuple | Signature authenticates an external publisher, not OS confinement. |

The native full-access projection for sandbox metadata avoids adding a second, different filesystem policy inside the official boundary. It does not disable that boundary or assert that the caller is YOLO. Managed and disabled opaque states use the same exact launcher path; `disabled` is passed unchanged, while DSH still uses ask because approval is absent from this protocol. `workspace-write + never` does not imply YOLO. No environment YOLO/profile flag changes the conservative default or manufactures a user grant.

Existing runtime/home/role setup is still required. Omitting a signing authority no longer blocks every ordinary operation. Fresh Leads and genuine native Team/delegated children receive their native profile before first work; restored policy is verified without rewriting it. Independent native forks retain their ordinary policy.

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

No PATH search, extra readable root, socket exception, disabled-network override or unsandboxed fallback is added. A bootstrap **inside** the sandbox imports the native CLI and reports its actual host PID before readiness. The existing PID/start-time/runtime/home/nonce and responding-health guards remain required; shutdown targets that attributed host, rather than confusing it with the launcher. If a launcher exits while its attributed host survives, or before bootstrap host identity is confirmed, startup attribution is retained and a second writer is refused. Launcher exit alone never proves descendant exit.

All user work originates in that sandboxed host: native filesystem operations (including direct Web file APIs), shell/terminal execution, Web/network tools, arbitrary installed tools, native Team members and background descendants. The detached runner and MCP connection remain outside it for coordination/diagnostics; they do not execute Team tasks. Detaching does not remove OS restrictions. A matching tuple is not an OS probe. `osLimitsVerified` remains false.

This placement intentionally also subjects host configuration reads, durable state writes, loopback listening and model/control-plane networking to the same policy. A typical restricted Codex policy may therefore prevent Web host startup or model requests. The plugin does not widen the state to make them work. No control-plane/user-network split or separate supervisor is implemented. These availability limits are a product gap.

`external` state cannot recreate its producer's outer boundary (the official CLI otherwise degrades it to read-only), so it is rejected. Missing launcher, future/unsupported state, conflicting aliases and invalid paths refuse startup/new work. Health returns a local limitation report without spawning; passive status/stop/withdrawal/escalation can still use an existing attributed host.

The protocol is experimental. Evidence is pinned to Codex CLI **0.164.0**, official commit `6aaac694803004a63c6f393d153c96d22521a6b9`: [metadata contract](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/codex-mcp/src/sandbox_metadata.rs), [metadata injection](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/core/src/mcp_tool_call.rs), [official executor](https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/cli/src/debug_sandbox.rs). The executor also loads local configuration. Full approval/reviewer and all managed-network/proxy policy are absent from the state; DSH ask is not Codex on-request + auto_review. These missing fields stay explicitly unknown/partial. Native Web owners retain their existing API authority inside whatever OS boundary actually applies.

## Reuse and continued work

The entire opaque state, launcher, source, cwd, backend and requested native policy enter the host binding. Retained record and responding health must match; a missing/mismatched identity or boundary refuses new work without upgrading, restarting or stopping the old host. The same tuple alone does not prove identical OS restrictions. A lost metadata channel cannot silently reuse a previously sandbox-bound host through native-default.

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


Strict attestation remains an optional external integration contract. It has no included publisher and is not needed for ordinary installation. Any configured authority/context error fails closed; there is no fallback to native-default. Native restricted network is now rejected because a signature alone does not enforce it. Strict attestation or an explicit profile combined with Codex protocol sandbox state is rejected as a conflicting configuration, rather than ignoring either source.

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

This proves only the exercised synthetic filesystem/shell/descendant boundary through the production launcher/bootstrap. It does **not** establish complete initiating Codex session inheritance, Codex approval/reviewer or YOLO behavior, managed-network/proxy policy, real Web/network behavior, or whole native-host/model/control-plane availability. Those remain **unverified**; keep the change Draft.

## Authenticated Web URL

`dsh_team_web_url({ "teamId": "<managed-root>" })` returns the owned-host authenticated homepage only after explicit user request, never a Team permalink. It never starts a host or opens a browser. The reusable bearer URL grants owner access across the host and may appear in client history; only this successful query may disclose it. Cancellation, including cleanup-phase cancellation, prevents disclosure. Its process lifetime and native browser-cookie lifetime are independent of permission-context expiry. No real bearer URL/token was read during this work.
