# DSH Agent Team

Opt-in Codex MCP client for native DSH Teams. Codex lazily starts and reuses a **dedicated ordinary DSH Web host**, then connects through the official Node Connection/Typert Gateway. The native host owns role policy, immutable member snapshots, execution, persistence, tools and approvals. The client contains manifests, a skill, native API calls and process lifecycle management.

Use Node **>=24.9.0**, exact official **DSH 0.2.2-alpha.2**, and the published **[dsh-team-roles 0.6.0](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.6.0)** archive. Older host 0.3.0 and 0.4.0 expose the old transport and are incompatible. Install the checksum-verified 0.6.0 release archive before starting this published client; normal installation does not build a source branch. No global daemon, SDK composition or private socket is used.

These instructions target the published catalog **v0.3.0** / plugin **0.4.0**. Use that fixed tag only after publication and asset verification. The catalog and plugin versions are independent; do not use a floating ref.

**Unreleased candidate (catalog 0.3.1 / plugin 0.4.1, this branch):** moves the exact runtime pin to DSH `0.2.2-alpha.3` and requires the matching **unreleased** dsh-team-roles 0.6.1 candidate build; the published 0.6.0 archive supports only `0.2.2-alpha.2`. The candidate is not tagged, has no Release assets and is not published. Validate it only from a locally built plugin in an isolated home; do not claim a release URL, digest or tag for it.

**Candidate remains Draft:** the [permission bridge](docs/permissions.md) now accepts experimental Codex sandbox-state and launches the entire native host through the official sandbox. Without metadata, ordinary installation uses native read-only + ask with explicit unknown Codex/network fields; signing is optional. Full approval/managed-network matching and real sandbox execution acceptance remain unfinished. A restricted policy can prevent host startup; it is never widened to make startup work. The authenticated URL query is `dsh_team_web_url({teamId})`.

This catalog repository is currently private. Git must already authenticate an account with repository access before marketplace registration; keep that authentication in the existing Git credential manager. A published Release does not change repository visibility, and anonymous requests may return 404. Never put tokens in repository URLs or MCP configuration.

See [getting started](docs/getting-started.md) for dedicated-home setup and Codex installation.

For Agent-guided initialization, use [docs/bootstrap.md](docs/bootstrap.md). It uses the existing setup and explicit MCP environment configuration. The guide and setup safety changes are included from catalog v0.3.0; v0.2.1 keeps its manual installation flow.

| CLI method | MCP tool | Purpose |
| --- | --- | --- |
| `health` | `dsh_team_health` | Start/reuse the owned host and verify native API/runtime/home identity |
| `web` | `dsh_team_web` | Open the authorized native Web entry; return only its clean origin |
| `web_url` | `dsh_team_web_url` | Explicit secret-bearing query: return the existing owned host authenticated homepage URL with only the managed root teamId after an explicit user request; no browser, start, adoption or Team/session permalink |
| `create` | `dsh_team_create` | Idempotent native Team creation and initial input admission |
| `send` | `dsh_team_send` | Queue/steer the same Team with a durable input ID |
| `status` | `dsh_team_status` | Native activity, member identity and configured/selected/used routes |
| `result` | `dsh_team_result` | Output, processing and whole-Team completion evidence |
| `stop` | `dsh_team_stop` | Request whole-Team interruption without rolling back files |
| `shutdown` | `dsh_team_shutdown` | Gracefully stop only the attributed idle host after a native admission fence |
| MCP only | `dsh_team_pending` | Refresh typed Lead questions and native authority events |
| MCP only | `dsh_team_answer` | Main answers Lead questions within existing user authority |
| MCP only | `dsh_team_escalate` | Mark a question for a user decision/input |
| MCP only | `dsh_team_approval` | Separate explicit one-shot approval or denial |
| MCP only | `dsh_team_wait` | Bounded native stream observation without token-by-token wakeups |

The five interaction/wait tools are included from plugin 0.4.0. See [Lead interactions](docs/interactions.md) for the main/Lead question loop, approval boundary and unsupported simultaneous Web interaction.

From the installed plugin directory, `node scripts/client.mjs health` uses the same lifecycle as MCP. `mcp.json` resolves `${PLUGIN_ROOT}` inside the self-contained plugin, independent of the working directory. The installed plugin has no npm runtime dependency; it loads the exact official Node transport from the configured DSH installation.

EOF closes only the API Peer. Native work and its host survive. Create keys and input IDs must be reused with identical content after uncertain outcomes; writes are never automatically replayed. Acceptance is separate from processing/completion. Cold or interrupted execution requires explicit continuation. Unknown usage, fees and unloaded selections remain null.

Roles and provider authentication are configured in **native Web → Settings → Team roles / Models**. New reservations use current roles; existing members retain snapshots. Empty catalogs use native model inheritance. Inputs are text-only. This plugin changes no Codex model, subscription or ordinary entrypoint.

Startup uses an OS-released SQLite transaction lock and provisional launcher/child attribution. Reuse and signaling require matching runtime, native home, nonce, PID and process start time. New instances use `--no-open --port 0` on loopback. A live or uncertain startup is retained rather than replaced. Shutdown refuses active/unknown work, uses the native five-second admission lease, and never force-kills. Persistent Session/attachment/role data is independent of process lifetime. An authenticated launch capability is held only in the private instance record for the lifetime of that host process (there is no independent short TTL); startup, health, status, create and `dsh_team_web` never return it. Only an explicitly requested `dsh_team_web_url` request returns the authenticated owned-host URL, and that response is a bearer credential that can appear in MCP/client history.

See [validation scope](docs/validation.md) for the distinction between synthetic transport fixtures and the real native integration gate.

## Activated orchestration

When explicitly activated, Codex main handles user requirements/system design, task decomposition and acceptance, progress and independent read-only review. DSH Lead owns all implementation, testing/debugging and member coordination. Main sends corrections only to Lead and escalates blockers to the user; it does not take over execution or message members directly. Member/status observations are allowed. This is behavioral skill guidance, not removal of Codex tools or a global sandbox. Native user access is unchanged. See the [orchestration contract](docs/orchestration.md) for the API boundary and release inclusion.
