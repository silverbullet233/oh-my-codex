# Codex permission handoff (unreleased candidate)

The client now requires a trusted launch-context handoff before starting a host or admitting work. Omit `permissionPreset` to inherit that context. It carries the sandbox mode, approval policy, explicit writable roots and network access. No Codex environment variable, YOLO flag, ordinary config file or preset name establishes actual effective permissions. This repository has no official Codex effective-permission discovery API integration; without a trusted external launcher, startup/create/send/answer/approval fail closed rather than assuming full access. Published releases retain their documented behavior.

## Blocking implementation gap

**Automatic inheritance is unfinished, including YOLO. Keep this candidate Draft.** The shipped `mcp.json` starts the MCP entrypoint without a permission authority or a publisher. A default installation therefore returns `PERMISSION_CONTEXT_REQUIRED` for health/startup and work. The signed protocol below is an admission contract for an external launcher, not a working Codex integration or evidence of OS confinement. There is no included trusted supervisor implementation or production enrollment procedure.

The investigation used local Codex CLI **0.164.0**, its generated experimental App Server JSON schemas, and the official [MCP documentation](https://developers.openai.com/codex/mcp), [App Server protocol](https://developers.openai.com/codex/app-server), and [permission boundaries](https://developers.openai.com/codex/permissions). App Server start/resume responses expose permission settings to their caller; `thread/read` does not expose those fields. No supported bridge was established from this ordinary MCP process to the initiating session's live effective filesystem/approval/network restrictions, or from those responses to confinement of this MCP process and detached host descendants. Starting a different App Server or reading configuration would not establish that relationship. MCP processes use separate controls from sandboxed shell execution.

Completion requires a platform integration that both obtains trusted current-session effective restrictions (including protected paths and network rules, beyond the reduced tuple here) and enforces them on all descendants before launch. Signatures or arbitrary configuration cannot fill that gap. Until such an integration is available and exercised, real Codex acquisition, OS/network enforcement and host reuse within that enforced boundary remain unverified. The isolated tests use temporary synthetic statements only.

## Establish trust outside the worker

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
    "networkAccess": "restricted"
  },
  "overrides": []
}
```

Use current millisecond timestamps; validity is at most 24 hours. The audience prevents reuse in another MCP process. A signed payload with `basis: "declared-configuration"` is still unverified and rejected, including one requesting full access. Missing/unknown fields, signatures from another key, stale contexts, relative/NUL roots and unsupported policy values are rejected. The supervisor must refuse false effective-runtime statements; a signature cannot make a false statement true.

`boundaryId` must identify the complete effective boundary, including network allowlists, denied filesystem subpaths, temporary-directory rules and all outer limits not represented by the small permission tuple. Change it whenever any of those restrictions changes. Use canonical physical root paths. A YOLO/full-access tuple is accepted only from this trusted effective-runtime channel; `danger-full-access` plus `never` alone does not prove unrestricted network or OS privilege.

## Native mapping and limits

Only Codex `on-request` and `never` map to DSH `ask` and `never`. Other approval policies (including `untrusted` and `on-failure`) are rejected rather than approximated. `never` denies actions that require approval. Native file modes map exactly. Read-only/full-access contexts use `writableRoots: []`; workspace-write requires the complete explicit root list.

The host's resolved native workspace root plus `additionalWritableRoots` must exactly match the signed explicit writable roots. DSH's extra roots are host-scoped, so mismatches require a separately configured owned home; the client never rewrites shared policy or silently grants the session cwd. Native platform temp exceptions and filesystem exclusions are additionally bounded by the supervisor's inherited OS boundary. Equality of a native projection is not proof that every tool implements confinement.

Pinned DSH has no equivalent network-policy setter. `networkAccess` is carried in the intent and reuse identity; enforcement must come from the supervisor's outer boundary. The plugin cannot install a new network sandbox or remove an inherited restriction. All process identity guards remain intact; an unverifiable PID/start time still blocks reuse and signaling.

A fresh Lead receives and verifies native mode/approval before its first task. New managed members inherit that exact profile before queued work, including `ask` (upstream normally seeds `never`). Durable member markers and restored Lead snapshots are verified without rewriting existing work. Old Teams without a profile are observable but cannot receive new work through the new client. Direct native owners retain native API behavior; this client contract is not a global restriction on Web or every upstream channel.

`send`, question answers and all approval replies require a matching Team profile and a fresh native root permission snapshot. Admission follows Gateway readiness/reconnection and rechecks the context's expiry, contents and retained/responding host binding immediately before native submission. Continued answers enqueue a new native input; even a continued denial can resume execution and requires this check. A failed preflight leaves the interaction pending for a fresh authorized retry. Stop, exact pending-input withdrawal, escalation and passive observations retain the existing-host-only path; they cannot start a host or enqueue continuation.

## User-authorized overrides and reuse

To select a different preset, the supervisor must first record an actual explicit user decision and include an `overrides` entry with `id`, exact catalog `preset`, and a full `permissions` tuple in the signed payload. Codex then passes both `permissionPreset` and `permissionAuthorization` (that exact grant ID). A model-written explanation is not a grant. Missing/mismatched grants fail before startup; the host also checks that the selected preset resolves to the authorized native mode/approval. Overrides change native DSH policy knobs within the already inherited outer limits; they cannot change the retained network boundary or remove parent OS restrictions. A broader native file mode on a restricted parent is not verified full OS access. This API changes only fresh Teams. It never escalates or rewrites an existing Team.

The launch record and responding host must both match the current signed boundary fingerprint (authority key, boundaryId and effective permission tuple). Older/unknown records, a different authority or narrower/broader/different limits refuse reuse. A live host does not inherit changes in a new Codex session. No automatic restart, adoption, kill or process-guard bypass occurs. A new signed session can reuse an existing host only when the supervisor guarantees the same enforced boundary and the native policy checks match. A signature-bound launch record is evidence of the supervisor's launch guarantee, not live OS inspection.

Read-only Team observations and stop can attach only to an already attributed host without a context; they never start one. The authenticated URL query also remains a read of an existing managed root, with all original identity and disclosure guards. Shutdown retains its separate activity/identity guards. These operations cannot broaden permissions.

## Authenticated Web URL

After an explicit user request, call `dsh_team_web_url({ "teamId": "<managed-root>" })`. There is no acknowledgement-string argument. This returns the owned-host authenticated homepage, not a Team permalink, and never opens a browser or starts a host. The URL is a reusable bearer credential granting owner access to every Team on that host, and may appear in client history. Only this successful query may disclose it; errors and routine responses remain sanitized. Its token lasts for that host process and a restart invalidates it. Upstream has no separate short TTL or logout API; browser cookies default to an absolute 30-day lifetime (configurable, not read by this query). Permission-context expiry is unrelated to Web token/cookie lifetime.
