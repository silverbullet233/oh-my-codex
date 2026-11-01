# DSH Agent Team

Opt-in Codex MCP client for native DSH Teams. Codex lazily starts and reuses a **dedicated ordinary DSH Web host**, then connects through the official Node Connection/Typert Gateway. The native host owns role policy, immutable member snapshots, execution, persistence, tools and approvals. The client contains manifests, a skill, native API calls and process lifecycle management.

Use Node **>=24.9.0**, exact official **DSH 0.2.2-alpha.2**, and **[dsh-team-roles 0.5.0](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.5.0)**. Older host 0.3.0 and 0.4.0 expose the old transport and are incompatible. Install the checksum-verified 0.5.0 release archive before starting this client; normal installation does not build a source branch. No global daemon, SDK composition or private socket is used.

Catalog **v0.2.1** / plugin **0.3.2** was published on **2026-10-31** and passed GitHub Actions release validation. The catalog and plugin versions are independent. Register the marketplace with that exact tag; do not use a floating ref.

This catalog repository is currently private. Git must already authenticate an account with repository access before marketplace registration; keep that authentication in the existing Git credential manager. A published Release does not change repository visibility, and anonymous requests may return 404. Never put tokens in repository URLs or MCP configuration.

See [getting started](docs/getting-started.md) for dedicated-home setup and Codex installation.

The new `node scripts/bootstrap.mjs /absolute/authorized/workspace` entry is an **unreleased local change**, absent from the published v0.2.1 snapshot. It installs a pinned private runtime and checksum-verified host through the existing setup/lifecycle code, then checks health. Its default private installation is discovered by MCP after restart, without terminal exports or global configuration edits. See the guide for isolation, reruns, custom-root configuration and the v0.2.1 manual path.

| CLI method | MCP tool | Purpose |
| --- | --- | --- |
| `health` | `dsh_team_health` | Start/reuse the owned host and verify native API/runtime/home identity |
| `web` | `dsh_team_web` | Open the authorized native Web entry; return only its clean origin |
| `create` | `dsh_team_create` | Idempotent native Team creation and initial input admission |
| `send` | `dsh_team_send` | Queue/steer the same Team with a durable input ID |
| `status` | `dsh_team_status` | Native activity, member identity and configured/selected/used routes |
| `result` | `dsh_team_result` | Output, processing and whole-Team completion evidence |
| `stop` | `dsh_team_stop` | Request whole-Team interruption without rolling back files |
| `shutdown` | `dsh_team_shutdown` | Gracefully stop only the attributed idle host after a native admission fence |

From the installed plugin directory, `node scripts/client.mjs health` uses the same lifecycle as MCP. `mcp.json` resolves `${PLUGIN_ROOT}` inside the self-contained plugin, independent of the working directory. The installed plugin has no npm runtime dependency; it loads the exact official Node transport from the configured DSH installation.

EOF closes only the API Peer. Native work and its host survive. Create keys and input IDs must be reused with identical content after uncertain outcomes; writes are never automatically replayed. Acceptance is separate from processing/completion. Cold or interrupted execution requires explicit continuation. Unknown usage, fees and unloaded selections remain null.

Roles and provider authentication are configured in **native Web → Settings → Team roles / Models**. New reservations use current roles; existing members retain snapshots. Empty catalogs use native model inheritance. Inputs are text-only. This plugin changes no Codex model, subscription or ordinary entrypoint.

Startup uses an OS-released SQLite transaction lock and provisional launcher/child attribution. Reuse and signaling require matching runtime, native home, nonce, PID and process start time. New instances use `--no-open --port 0` on loopback. A live or uncertain startup is retained rather than replaced. Shutdown refuses active/unknown work, uses the native five-second admission lease, and never force-kills. Persistent Session/attachment/role data is independent of process lifetime. The short-lived launch capability is held only in a private instance record while its process exists; it is never printed or returned by MCP.

See [validation scope](docs/validation.md) for the distinction between synthetic transport fixtures and the real native integration gate.

## Activated orchestration

When explicitly activated, Codex main handles user requirements/system design, task decomposition and acceptance, progress and independent read-only review. DSH Lead owns all implementation, testing/debugging and member coordination. Main sends corrections only to Lead and escalates blockers to the user; it does not take over execution or message members directly. Member/status observations are allowed. This is behavioral skill guidance, not removal of Codex tools or a global sandbox. Native user access is unchanged. See the [orchestration contract](docs/orchestration.md) for the API boundary and release inclusion.
