# Catalog 0.3.1 / plugin 0.4.3 validation — 2026-11-08

Release preparation is pending: catalog v0.3.1 has not yet been tagged or published. The intended combination is plugin 0.4.3, exact official DSH / Team Profile 0.2.2-alpha.3, and the verified built [Host v0.6.1 Release](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.6.1). Do not treat this preparation report as proof that the catalog Release exists.

## Candidate acceptance

An independent macOS / Node 26.0.0 / Codex 0.164.0 installation used catalog main `3acbc422a7a657c04a388c4536bfa98efe0341f8` and Host source `db0492f47e430042b22caf754fbe4da604b09ccc`. Both checkouts were clean. Plugin registration used an isolated Codex home and local marketplace; no personal Codex/DSH profile, provider credential, global runtime or system configuration was modified.

The resolved MCP transport supplied absolute `${PLUGIN_DATA}`-derived paths inside that home. Official `@deepseek-ai/dsh@0.2.2-alpha.3` was freshly installed there with an empty environment, private npm configuration/cache, exact top-level pin, scripts disabled and official registry. Setup installed exact official Team Profile 0.2.2-alpha.3 and a locally built Host 0.6.1 archive into the matching empty Home. That local archive SHA-256 was `c8fef9c3d44d7cdb4a301fe1deb442f20ed7bf48f7f795762504a69ef0b2018e`; it is not the workflow Release digest.

- Direct installed stdio `initialize` / `tools/list`: negotiated protocol 2025-06-18, name `dsh-agent-team`, version 0.4.3, all 18 exact names, no RPC errors.
- Real Codex app-server initialized the actual installed plugin and discovered the same identity and exact tool names. An ephemeral thread was created without starting a model turn.
- App-server `mcpServer/tool/call` invoked **actual `dsh_team_health`**. It returned `owned: true`, API `dsh-team-roles` version 1 and all 15 capabilities, official runtime alpha.3 with required modules and frontend, empty role catalog, matching canonical Home/runtime/workspace and matching instance ID/PID in the ownership record.
- Health reported `full-access-default`, direct native execution and no automatic Codex filesystem/approval/network inheritance. It did not claim verified unrestricted OS/network access.
- Through that same real MCP route, `dsh_team_shutdown` returned `stopped: true`; the attributed Host exited and its instance record was removed. No Host remains running from this acceptance.

This is actual Codex MCP/Host acceptance, distinct from direct protocol tests and the environment-recording fixture. It created no Team, sent no model request, opened no browser and copied no authentication. The external verification harness initially required app-server identity to omit optional fields; it was adjusted to accept the schema's null optional metadata while still asserting exact name/version, before any health call.

## Published Host assets

The official [Host tag workflow](https://github.com/silverbullet233/dsh-team-roles/actions/runs/42476229124) passed at `db0492f47e430042b22caf754fbe4da604b09ccc`. The actual workflow archive has SHA-256 **`00f3fbf359289afa648fe8ef57b01739631c3ea70184f7f9351323dae1fcf669`**. GitHub digest, downloaded bytes and SHA256SUMS agree. Before publication, this archive passed contents validation and fresh native install/load with seven bounded synthetic requests. Both fixed public URLs were then downloaded anonymously and rechecked after publication. Those exact bytes and digest are used by the installation documentation.

## Repository gates and remaining publication gates

Both source repositories passed their full tests, builds and package inspections. The catalog also passed release preparation, isolated Codex install/refresh/upgrade/same-version replacement/rollback, and the real app-server environment-forwarding regression with a negative control. Final release-preparation PR CI and Codex review must pass on the final head before merge/tag.

After catalog publication, verify the remote tag against generated catalog.json, all downloadable asset digests/checksums and a new fixed-tag clean installation with actual MCP health and guarded shutdown. Record that result in a follow-up reviewed documentation update. Do not move the tag or replace published assets.

No current personal desktop session, authenticated browser rendering, real-provider inference, Windows compatibility or unrestricted OS/network behavior is certified. The environment fixture alone is not Host acceptance. GitHub Release publication is separate from npm publication.
