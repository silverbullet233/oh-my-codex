# Changelog

Versions here describe the repository catalog. Each plugin has its own version.

## 0.3.1

Published 2026-11-08: catalog **v0.3.1** / plugin **0.4.3** at `7c70e4aeec07fb55b59a28ccdb92c92ac7f3a837`. The official tag workflow, assets/checksums and fixed-tag clean actual-MCP installation passed verification. Requires published **dsh-team-roles 0.6.1** and exact official **DSH / Team Profile 0.2.2-alpha.3**.

- Bind MCP runtime/Home through standard manifest `env` and persistent `${PLUGIN_DATA}` expansion. Existing and isolated Codex home installation guides now discover these resolved paths before setup; terminal DSH exports are unnecessary for MCP. Preserve existing configuration with backups and explicit conflict/recovery checks.
- Verify installed MCP protocol, identity and all 18 exact named tools, with negative regression controls. The English [installation runbook](docs/dsh-agent-team-install.md) uses fixed catalog/host versions and the actual host release digest.
- Default Teams to native full access (`danger-full-access` / `never`, network enabled intent), with direct native CLI startup. Remove automatic Codex metadata inheritance and launcher/fallback logic; explicit profiles and independent interaction/URL safeguards remain. Outer OS/process/admin restrictions still apply.
- Add explicit `dsh_team_web_url` for a user-requested authenticated owned-host homepage URL of an existing managed Lead/root Team. This is a reusable host-scoped bearer credential that can appear in client history; the query never opens a browser, creates/resumes work or starts/adopts/restarts a host.
- Add bounded retained root-session error history to summary observations without inferring turn attribution or goal completion.
- Remove the optional cumulative MCP call budget; stale `DSH_AGENT_TEAM_MCP_CALL_LIMIT` values are ignored. Input/output size and per-operation bounds remain. Host lifetime remains independent of MCP; no automatic Codex-session-exit stop is added.
- Complete keyless clean installation and actual Codex app-server MCP health/shutdown acceptance without model turns. [Release validation](docs/release-0.3.1-validation.md) records exact tested sources, scope and limits. Historical model acceptance covers only its recorded older implementation.

## 0.3.0

- Add an Agent-facing bootstrap guide using the existing setup and explicit MCP environment configuration.
- Guard setup workspace/ownership, reuse matching complete installations and refuse partial, incompatible or uncertain state without overwriting it.
- Correct v0.2.1 availability documentation; the new guide and setup changes are not part of that published tag.

- DSH Agent Team 0.4.0 adds the typed Lead question/approval bridge and bounded native-stream waits.
- Require English only between Codex main and Lead, preserving exact code, paths, IDs, option values and quotations.
- Return a safe owned-host Web homepage and Team ID after create/retry.
- Pin host 0.6.0 and expose explicitly selected create-time permission presets with verified pre-task policy and fail-closed retries; runtime remains 0.2.2-alpha.2.

## 0.2.1

- DSH Agent Team 0.3.2 documents existing Git authentication for this private catalog and authenticated release-asset verification. Publishing a Release does not make a private repository public.
- Keep the fixed catalog tag and public host 0.5.0 asset pins. The Lead orchestration behavior introduced in catalog 0.2.0 / plugin 0.3.1 is unchanged.

## 0.2.0

- DSH Agent Team 0.3.1 replaces private IPC with the official Node Connection/Typert Gateway.
- Lazily manage a dedicated ordinary DSH Web host, preserve native persistent data across MCP disconnects and restart, and offer native Web handoff and guarded graceful shutdown.
- Explicit activation makes Codex main responsible for requirements/design, decomposition, acceptance, progress and independent read-only review. All implementation/testing/debugging is delegated to DSH Lead; no direct member instructions or alternate Codex execution workers. Blocked Lead work escalates to the user. This is skill guidance, not a global sandbox.
- Breaking: configure a dedicated home and the exact DSH 0.2.2-alpha.2 runtime; install the published host 0.5.0 release archive first. Socket configuration is removed.

## 0.1.0

- Establish the versioned marketplace catalog with `dsh-agent-team` 0.2.0.
- Add semantic Git tag installation, upgrade and rollback instructions.
- Validate catalog snapshots and prepare draft Releases with plugin archives, version mapping and SHA-256 checksums.

Catalog tags and Releases require an explicit maintainer publication decision. The separate DSH host plugin has its own version and release assets.
