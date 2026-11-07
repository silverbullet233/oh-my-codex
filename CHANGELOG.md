# Changelog

Versions here describe the repository catalog. Each plugin has its own version.

## 0.3.1

Publication pending: this catalog/plugin candidate is **not tagged**, has **no GitHub Release assets** and is **not published**. The latest published installation pins remain catalog **v0.3.0** / plugin **0.4.0**.

- Candidate runtime pin moves to exact DSH `0.2.2-alpha.3` with the corresponding Cordis-layer `*.alpha.2` sub-line (`@deepseek-ai/cordis@4.0.6-alpha.2`). Published catalog v0.3.0 / plugin 0.4.0 remains on DSH `0.2.2-alpha.2`.
- DSH Agent Team 0.4.1 candidate requires the matching **unreleased dsh-team-roles 0.6.1 candidate build**; the published dsh-team-roles 0.6.0 archive supports only DSH `0.2.2-alpha.2`. A compatible host release must be published and verified before this candidate can be released.
- DSH Agent Team 0.4.1 candidate adds the explicit `dsh_team_web_url` MCP query: after a required `acknowledge: "reveal-bearer-credential"` opt-in it returns the existing owned host authenticated homepage URL verbatim for an existing managed Lead/root Team. It never opens a browser, starts/adopts/restarts a host, creates a Team or resumes cold work; owned-entry and managed-root identity are validated, and startup/health/status/create remain token-free. The URL is a reusable host-process-scoped bearer credential (no Team permalink, no logout API; restart invalidates; cookies use an absolute ~30-day default), and the tool/skill/docs state that it can appear in MCP/client history. This content is still identified as unreleased catalog 0.3.1 / plugin 0.4.1 because neither has been published; publication remains pending.
- No live provider inference is claimed. Validation is synthetic/no-model only; a new catalog tag/release is a separate maintainer decision.

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
