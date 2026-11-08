# DSH Team permissions (unreleased candidate)

## Default: full access

Ordinary startup uses DSH native **full access**, with `source: "full-access-default"`:

| Setting | Default and meaning |
| --- | --- |
| Filesystem | `danger-full-access`, `writableRoots: []`. DSH adds no project-directory write restriction. Code, shell commands and installed tools can modify files accessible to the host process, including files outside the project. |
| Approval | `never`. DSH does not prompt for native tool approval; a still-required approval is denied rather than automatically approved. This is not a blanket user approval for independent interactions. |
| Network | `enabled` requested intent. The plugin adds no network restriction and does not verify actual connectivity. |
| Execution | Direct native DSH CLI, using the process's existing environment and outer limits. No Codex sandbox launcher or opaque state adapter is used. |

The plugin **does not automatically inherit Codex sandbox, approval or network policy**. It does not advertise the experimental sandbox-state capability, read/rewrite opaque state, reconstruct policy, or select a fallback based on metadata availability. Old or unsolicited metadata does not change the default, cwd, host binding or explicit launch configuration. `inheritance: "not-requested"` and `codexSandbox`/`codexApproval`/`codexNetwork: "not-inherited"` report that decision. `osLimitsVerified` and `effectiveNetworkVerified` remain false.

Full access is DSH product policy, not elevated OS privilege. Existing parent-process confinement, filesystem permissions, containers, OS sandboxing, network proxies/allowlists and administrator restrictions still apply. Detachment does not remove those restrictions. An MCP started outside Codex's sandbox does not acquire that sandbox merely because Codex calls it. Actual refusal is returned with redacted startup diagnostics where available; no alternate launcher, added writable root or broader retry is attempted.

Fresh Leads and actual Team members/delegated children receive the selected native policy before work. Restored Teams verify saved policy without rewriting. Independent native forks retain native behavior. Native API calls without a companion-selected profile retain the host's existing behavior; installing the roles plugin alone does not change every native Session's default.

## Explicit launch configuration

Existing explicit profiles remain supported. Create a private, current-user, non-symlink JSON file and select its absolute path in user-controlled launch argv:

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

The source is `explicit-configuration`. Choose `read-only`, `workspace-write` or `danger-full-access`, and native `ask` or `never`. Workspace-write requires absolute roots matching the host's resolved native roots; read-only/full-access require `[]`. This selects native policy rather than proving confinement of every external tool. Network accepts `enabled`, `unknown` or `restricted`; unknown is reported honestly. Native DSH cannot enforce a restricted user-tool network, so explicit `restricted` returns `NETWORK_ENFORCEMENT_UNAVAILABLE` before startup/work, including Team admission. It is never changed to enabled. Missing/invalid files, invalid roots and incompatible settings are errors; none selects the full-access default. Automatic metadata does not override an explicit selection.

Profiles apply to fresh Teams. To change a launch policy, initialize a separate dedicated home or explicitly coordinate shutdown of the previous host after its work settles. Do not change global security/network/credential configuration to make startup succeed.

## Reuse and continued work

Source, cwd, backend and selected native policy enter the host binding. Retained metadata and responding health must match binding and captured execution; PID/start-time, nonce, dedicated home and runtime checks remain required. A matching binding is not an OS-policy probe. Older inherited, fallback, restricted or unknown-boundary hosts are **not** automatically reused, upgraded, restarted or stopped by the new default, even if their native policy tuple happens to match. Uncertain legacy startup attribution is retained; launcher exit alone is not proof of descendant exit.

Create/send/question answers/all approval replies recheck configuration after Gateway readiness/reconnection and immediately before submission. Current root policy must match saved Team intent. Continued replies, including denials that enqueue continuation, use the same guards. Failed preflight leaves delivery pending for a legitimate retry. Observation, withdrawal, escalation and guarded shutdown keep their existing attributed-host control paths.

Per-Team `permissionPreset` overrides still require an exact user grant from the optional signed external authority. Model-written acknowledgements are not grants. Full-access defaults do not remove user-question escalation or one-shot approval authorization.

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


Strict attestation remains an optional external integration contract. It has no included publisher and is not needed for ordinary installation. Any configured authority/context error fails closed; there is no fallback to full access. Native restricted network is now rejected because a signature alone does not enforce it. Automatic Codex protocol metadata is ignored. Selecting both strict attestation and an explicit profile is a configuration conflict and stops admission.

## Validation scope and history

Current automated coverage checks metadata-independent defaults, direct CLI argv/child execution, first-input/native member/delegation policy, cold restoration, explicit restrictions, admission rechecks, old-host rejection and single-attempt errors. Isolated tests use synthetic contexts and native data services; full CI additionally exercises listeners, attributed child lifecycle, Gateway and package installation. These establish the exercised code paths, not actual unrestricted access on every OS or provider/network availability.

The [2026-11-08 real-model acceptance](acceptance-2026-11-08.md) is historical: client `b92be5a89829de83cbfe484a045d69c33469e945`, host `5dbea78dd347751cc5730cc8a3ef1f9f44644bd4`, Codex `0.167.0-alpha.3.2`, DSH `0.2.2-alpha.3`. It exercised the former metadata/launcher path, not this full-access default. Earlier boundary probes and read-only startup refusals are recorded in [historical validation](validation.md#historical-validation-through-pr-26). The old launcher/bootstrap and boundary-probe scripts have been removed with the automatic inheritance implementation. No new paid provider call or real bearer URL is required for this iteration, and no such acceptance is claimed. Candidates remain unreleased; merging does not publish a release, tag or npm package.

## Authenticated Web URL

`dsh_team_web_url({ "teamId": "<managed-root>" })` returns the existing owned-host authenticated homepage only after explicit user request, never a Team permalink. It never starts a host or opens a browser. The reusable bearer URL grants owner access across the host and may appear in client history; only this successful query may disclose it. Cancellation, including cleanup-phase cancellation, prevents disclosure. Process and native browser-cookie lifetimes remain separate from any optional context expiry. Ordinary create/health output stays token-free.
