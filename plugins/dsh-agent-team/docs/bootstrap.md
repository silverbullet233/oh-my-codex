# Bootstrap instructions for an AI Agent

Use this guide only when the user explicitly authorizes plugin initialization. Codex main may prepare the plugin and check health before a DSH Lead exists. This does not authorize user-project work, direct teammate instructions, work-Team creation or inference. Do not handle provider credentials. This guide targets the published catalog **v0.3.0 / plugin 0.4.0** with exact DSH `0.2.2-alpha.2` and host `0.6.0`. The unreleased candidate on this branch (catalog 0.3.1 / plugin 0.4.3) instead requires exact DSH `0.2.2-alpha.3` and the matching unreleased dsh-team-roles 0.6.1 candidate; it is not tagged, has no Release assets and is not published. Published catalog v0.2.1 (2026-10-31) retains its manual setup; never change an existing tag or register a floating marketplace ref.

**Read step 6 before making changes:** the published MCP binding is blocked; the candidate uses manifest-bound plugin-data paths. Do not perform a partial published installation unless the user accepts that limitation.

1. **Inspect and reuse first.** Locate the installed plugin, authorized launch workspace and existing per-MCP `DSH_AGENT_TEAM_RUNTIME` / `DSH_AGENT_TEAM_HOME` values. Check Node **>=24.9.0** and npm. Do not install/upgrade global Node or DSH. Missing Node/npm requires the user's existing Node manager or a supported executable. Never print secrets or copy personal profiles/configuration.

2. **Validate any existing installation.** For the published plugin, require exact `@deepseek-ai/dsh@0.2.2-alpha.2`, Team Profile `0.2.2-alpha.2` and host `0.6.0`. For the unreleased candidate plugin, require exact `@deepseek-ai/dsh@0.2.2-alpha.3`, Team Profile `0.2.2-alpha.3` and the matching locally verified unreleased dsh-team-roles 0.6.1 candidate host. Check the private Home's `.codex-dsh-owner.json` (`version: 1`, `owner: oh-my-codex/dsh-agent-team`) and matching canonical workspace, and the installed Web profile/package versions. Call actual MCP `dsh_team_health` when available: require native API 1, required capabilities and the attributed owned Home/runtime. Reuse an already matching healthy installation. A version, ownership, workspace or configuration mismatch is a stop condition; do not upgrade or repurpose it automatically.

3. **Prepare only new private directories when needed.** For the candidate, first discover the manifest-bound runtime/Home paths as described in step 6; do not choose different paths. For published CLI-only validation, choose absolute runtime, Home and download paths in the authorized location. Verify each is new/empty and private to the current user; do not overwrite an existing runtime or unrelated directory. In an isolated installation environment with private npm config/cache and no provider secrets:

   ```sh
   npm install --prefix /absolute/new-private-runtime @deepseek-ai/dsh@0.2.2-alpha.2 --save-exact --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
   ```

   Use `@deepseek-ai/dsh@0.2.2-alpha.3` instead only for the unreleased candidate plugin. Validate the installed package name/version before continuing. Do not substitute another version, a source checkout or latest. Existing authorized Git credentials remain in their credential manager; no Git/marketplace registration changes are needed after plugin installation.

4. **Download and verify the fixed host.** Use a new private download directory. Download only the built release archive and its manifest. The URLs below are for the published plugin + published host 0.6.0 (DSH `0.2.2-alpha.2`). For the unreleased candidate, do **not** substitute the published 0.6.0 archive: use only the locally built and verified dsh-team-roles 0.6.1 candidate archive, which has no published URL, release asset or checksum claim:

   ```sh
   curl -fL --max-time 60 https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.0/dsh-team-roles-0.6.0.tgz -o /absolute/new-download/dsh-team-roles-0.6.0.tgz
   curl -fL --max-time 60 https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.0/SHA256SUMS -o /absolute/new-download/SHA256SUMS
   cd /absolute/new-download
   shasum -a 256 -c SHA256SUMS
   printf '%s  %s\n' '5538a263d3d2e4f05e843153e524e1501f1564324951a9f21ed6470de5ade67e' 'dsh-team-roles-0.6.0.tgz' | shasum -a 256 -c -
   ```

   Both checks must pass. Network/checksum failures stop initialization; never fall back to a different asset, latest or unverified bytes.

5. **Run the existing setup, then CLI health.** In the setup process, set both nonsecret values explicitly:

   ```sh
   export DSH_AGENT_TEAM_RUNTIME=/absolute/new-private-runtime/node_modules/@deepseek-ai/dsh
   export DSH_AGENT_TEAM_HOME=/absolute/new-private-dsh-home
   node /absolute/installed-plugin/scripts/setup.mjs /absolute/new-download/dsh-team-roles-0.6.0.tgz /absolute/authorized/workspace
   node /absolute/installed-plugin/scripts/client.mjs health
   ```

   Setup claims an empty dedicated Home and installs the pinned Team Profile/verified host with scripts disabled. Updated setup skips a complete matching installation without reinstalling; it refuses partial/mismatched installations and live/uncertain mutation. It does not install the runtime or download the host archive for you, stage/rollback an installation or repair interrupted state. On failure, inspect the dedicated Home/process attribution; do not blindly retry installation, delete unknown directories, force-stop processes or migrate personal data. Choose a fresh Home only deliberately after identifying any surviving installer. DSH may create its normal private browser/API grant; initialization does not provision provider credentials.

6. **Verify the actual MCP process.** There is no auto-discovery of an independently installed runtime. For published plugin 0.4.0, stop and report the MCP binding blocker: Codex filters ambient DSH environment variables and that published manifest does not forward them. Terminal exports are not a working alternative. Do not invent per-plugin TOML overrides, register a duplicate server, or edit the installed manifest.

   The unpublished candidate 0.4.3 instead supplies both paths through its manifest's standard `env` and `${PLUGIN_DATA}` expansion. Before steps 3 and 5, discover its resolved paths from `CODEX_HOME=/absolute/authorized-codex-home codex mcp list --json`, privately selecting only the installed plugin's entry. Strip the exact `/node_modules/@deepseek-ai/dsh` suffix from the resolved runtime path and use the remaining `runtime` directory as npm's `--prefix`; use the resolved DSH Home for setup. These paths, not arbitrary example paths, must match the manifest. Require explicit authorization for that plugin-data directory, validate its canonical paths/ownership and do not overwrite existing data. Restart the client using the same Codex home and a supported Node on PATH. No terminal DSH exports are required for the candidate MCP process. See the [complete existing/isolated profile installation guide](https://github.com/silverbullet233/oh-my-codex/blob/main/docs/dsh-agent-team-install.md) for candidate source-build prerequisites, backup/conflict handling and validation. Published and candidate versions must not be mixed. Never add provider keys, Git tokens, launch tokens or cookies to MCP configuration.

   Call that server's **actual `dsh_team_health`** after restart. CLI-only health is insufficient proof of MCP connectivity. If MCP remains unavailable, report the exact outstanding environment/restart blocker and the CLI result separately; do not claim setup is fully connected. Do not create a work Team or make a paid inference request as a test. Any later project execution still goes through DSH Lead under the orchestration contract. Initialization never calls `dsh_team_web_url`: it requires an existing managed Lead/root Team and an explicit user request, is secret-bearing, and never starts, adopts or restarts a host.

## Candidate permission default

DSH Team now uses native full access by default: `danger-full-access`, approval `never`, network enabled intent. It does not automatically inherit Codex sandbox, approval or network settings, and does not invoke a Codex launcher. This can allow writes outside the project wherever the process has access. Existing outer OS/process/admin restrictions remain effective; network intent does not guarantee connectivity. Explicit profiles/strict attestation remain available, with configuration errors stopping admission. Older or differently bound owned hosts are retained without automatic restart or upgrade; use a separate dedicated home or coordinate guarded shutdown explicitly. See [Team permissions](permissions.md).
