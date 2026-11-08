# Catalog 0.3.1 / plugin 0.4.3 validation — 2026-11-08

[Catalog v0.3.1 / plugin 0.4.3 is published](https://github.com/silverbullet233/oh-my-codex/releases/tag/v0.3.1) at **`7c70e4aeec07fb55b59a28ccdb92c92ac7f3a837`**, paired with exact official DSH / Team Profile **0.2.2-alpha.3** and built [Host v0.6.1](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.6.1) at `db0492f47e430042b22caf754fbe4da604b09ccc`. Both remote releases are public and non-draft. The new fixed-tag clean actual-MCP installation passed after publication.

The immutable tagged plugin docs and attached release-notes.md were authored during release preparation. Their publication guards are satisfied by the tag/workflow/asset verification recorded here. This follow-up updates repository-level release status/evidence without modifying the published plugin snapshot, moving tags or replacing assets.

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

## Final repository and publication gates

Both source repositories passed full tests, builds and package inspections: **249 Host** and **259 catalog/client** test executions, with zero failures, cancellations or skips. Catalog installation/refresh/upgrade/same-version replacement/rollback and real Codex app-server environment-forwarding positive/negative controls also passed locally.

- [Host documentation PR #19](https://github.com/silverbullet233/dsh-team-roles/pull/19), final head `5d8594ca09123c8a684942001b57e33efd17a89b`, passed [CI](https://github.com/silverbullet233/dsh-team-roles/actions/runs/42476799416) and final Codex review with no findings; merged as `1a57f7eb7a75cf9792d9eb5e75cc4197375434a4`.
- [Catalog release PR #33](https://github.com/silverbullet233/oh-my-codex/pull/33), final head `c33b65d7315e2f68c79a8d7266dbff9b043cfa4a`, passed [Ubuntu/macOS CI](https://github.com/silverbullet233/oh-my-codex/actions/runs/42477125155) and final Codex review with no findings; merged as the exact catalog tag commit `7c70e4aeec07fb55b59a28ccdb92c92ac7f3a837`.
- The [catalog v0.3.1 tag workflow](https://github.com/silverbullet233/oh-my-codex/actions/runs/42477323413) passed both platform gates and official draft upload. Before publication, all four downloaded assets matched their GitHub digests and SHA256SUMS, and generated catalog.json matched the remote tag and plugin 0.4.3 mapping.
- After publication, every fixed asset URL was downloaded anonymously into a new directory. Bytes, GitHub digests and SHA256SUMS still agreed. The release body was updated to describe completed publication gates; attached assets retain their original workflow bytes.

| Catalog asset | SHA-256 |
| --- | --- |
| `catalog.json` | `ade73ff3559097bb4ff5f788fe90c7d87a5a4115b325881b86d12a45e8744a72` |
| `dsh-agent-team-0.4.3.tgz` | `2dddbd036ff3a844a5d0ddf277690b54bd5a121b24b3730aeaeb3957875f6fa7` |
| `release-notes.md` | `888ee2829fcace250b70b7d197ee96fe39fffb78f5e13eccf1ba1be7201e5327` |
| `SHA256SUMS` | `7b4a0622ddf830f0a8cc7f5d3e5a37a5482ed5cc5287210c921900df8d8a678a` |

## Fixed-tag clean installation after publication

A second entirely new isolated Codex home installed **the public Git marketplace at `--ref v0.3.1`**, not a local source fixture. The returned plugin version was 0.4.3; package and plugin manifests agreed. The runtime and DSH Home came from Codex's actual expanded MCP transport, beneath the same persistent plugin-data parent. Official DSH was freshly installed there with new private npm config/cache and scripts disabled. Setup installed official Team Profile 0.2.2-alpha.3 and the actual downloaded Host v0.6.1 release archive with SHA-256 `00f3fbf359289afa648fe8ef57b01739631c3ea70184f7f9351323dae1fcf669`.

On macOS / Node 26.0.0 / Codex 0.164.0:

1. Installed stdio initialization negotiated protocol 2025-06-18 and exactly identified plugin 0.4.3; all 18 named tools matched the independent installation oracle.
2. Through real Codex app-server and an ephemeral thread with no model turn, `mcpServer/tool/call` invoked actual **`dsh_team_health`**. API 1, all 15 Host capabilities, official runtime and serving modules, empty role catalog, `owned: true`, canonical Home/runtime/workspace, instance ID and PID matched the new installation.
3. The same real MCP route called **`dsh_team_shutdown`**; it returned `stopped: true`, the attributed Host process exited and its instance record was removed.
4. A separate direct CLI health/guarded-shutdown cycle also passed against that same isolated installation, with process exit confirmed. Direct CLI and actual MCP results are distinct checks.

All inspection artifacts remain local in the task's `published-install`, `catalog-public-verified` and `host-public-verified` directories. No personal Codex/DSH profile, provider credential, global runtime or system configuration was changed. No Host from either clean MCP acceptance remains running. Both MCP health acceptances created no Team, sent no model request and opened no browser; the separate native portable-package fixture used seven bounded synthetic requests.

No current personal desktop session, authenticated browser rendering, real-provider inference, Windows compatibility or unrestricted OS/network behavior is certified. Teams default to native full access / never with network enabled intent and do not automatically inherit Codex permissions. GitHub Release publication is separate from npm publication.
