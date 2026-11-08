# DSH Agent Team: Installation Guide for Agents

Users can give this file to an agent with an instruction such as: "Install DSH Agent Team using this guide. The workspace is ..., and the installation root is ...." The agent should complete checks, installation, and verification within the authorized scope. If permissions, dependencies, authentication, or a required client restart block progress, preserve the current state and report the exact blocker. The published version currently has an actual Codex MCP environment-forwarding blocker (section 5); explain it before installation, and never promise fully working one-click integration. This document is an executable partial-installation procedure; **there is no separate `install.sh`, bootstrap command, or automatic MCP discovery feature**.

## Repository ownership and pinned versions

DSH Agent Team is `plugins/dsh-agent-team` in [silverbullet233/oh-my-codex](https://github.com/silverbullet233/oh-my-codex). The separate [dsh-team-roles](https://github.com/silverbullet233/dsh-team-roles) repository provides the native DSH host and roles; it is not a Codex marketplace. Do not modify Codex installation tests in that repository or install the Codex plugin from it.

The combinations below were verified on 2026-11-08. Recheck both repositories' releases, tags, and manifests before proceeding. Stop if the publication status or contents differ; do not automatically select the latest version.

| Purpose | Catalog / Codex plugin | Official DSH / Team Profile | dsh-team-roles host |
| --- | --- | --- | --- |
| Normal installation, published | **v0.3.0 / 0.4.0** | **0.2.2-alpha.2** | Built Release `.tgz` for **0.6.0** |
| Development candidate, unpublished | 0.3.1 / 0.4.3 | 0.2.2-alpha.3 | Matching unpublished 0.6.1 candidate build |

The published [catalog v0.3.0](https://github.com/silverbullet233/oh-my-codex/releases/tag/v0.3.0) comes from source commit `2bb302f9ab75f7bccb9274f9cacedcfbe18d904c` and pairs with [host v0.6.0](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.6.0). The candidate **has no v0.3.1 tag, Release assets, or npm publication**. Never invent candidate download URLs or use `main`, a feature branch, `latest`, or a GitHub source archive for normal installation. Candidate validation requires separate authorization, an isolated location before any explicitly authorized existing-profile installation, an explicit commit, and a matching locally built host, with its source and digest reported. Do not substitute host 0.6.0. This guide does not authorize publishing, tagging, or changing marketplace publication status.

## 1. Authorization, targets, and prerequisites

- Confirm the authorized absolute path of the existing project, installation root, Codex profile, and whether network downloads are allowed. For the published partial-installation route, use a **new, separate installation root** for the runtime and DSH Home. The candidate exception in section 5 instead uses the explicitly authorized Codex plugin-data directory for those two components, with a separate new download/cache root. Choose the Codex target explicitly: **existing profile** to make the plugin available in the user's normal Codex, or **isolated profile** for evaluation. If the target is unspecified, ask; do not silently install into an unused isolated profile and call it integrated. Modifying an existing profile requires explicit prior authorization. Both routes keep personal `~/.dsh` and system configuration unchanged.
- Use existing installations of Git, Node **>=24.9.0**, npm, a Codex CLI supporting `codex plugin`, curl, and shasum. CLI **0.164.0** was verified for the original guide; the profile-preservation fixture also passes on **0.167.0-alpha.4**. This is a tested-version statement, not a request to upgrade. Check `node --version`, `npm --version`, and `git --version`; check `codex --version` and `codex plugin marketplace add --help` / `codex plugin add --help` under a temporary `CODEX_HOME`. Report missing commands or incompatible versions. **Do not run brew, sudo, global npm installs, npx automatic downloads, or system upgrades**.
- Check canonical paths, ownership by the current user, permissions, symlinks, and writable boundaries. The installation root must not be inside an existing runtime, DSH Home, project source tree, or another application's state directory. Do not repair unknown directories with recursive chmod/chown.
- Public repositories normally need no GitHub authentication (both repositories were public on 2026-11-08). Private mirrors must already be accessible through an existing Git credential manager. Verify Git and `gh` authentication separately. Stop on authentication failure; do not create tokens, initiate a new login flow, or put credentials in URLs, command arguments, MCP configuration, reports, or the temporary profile. Do not print the environment, npm configuration, personal configuration, or secrets, and do not copy personal DSH/provider configuration.
- Installation authorization covers initialization and health checks without inference, not working Teams, paid model requests, provider credential configuration, automatic browser opening, or expanded persistent permissions. On first startup, DSH may generate local browser/API authorization state through its native flow. If the user prohibits any such state creation, stop after static validation and report that health checks were not run. The agent must not generate or collect credentials itself.

## 2. Check idempotency and conflicts first

For an existing installation, first check the explicitly configured `DSH_AGENT_TEAM_RUNTIME` / `DSH_AGENT_TEAM_HOME` and the target profile's `codex plugin marketplace list --json` and `codex plugin list --json`. Do not paste private configuration into reports. Check the marketplace URL, pinned ref, plugin version, and `installedPath`. Stop if a marketplace with the same name uses a different URL/ref or a different plugin version is installed; do not automatically remove or upgrade it.

A matching runtime must have the correct package name and exact version. The dedicated Home's `.codex-dsh-owner.json` must have `version: 1`, `owner: oh-my-codex/dsh-agent-team`, and a `cwd` matching the same canonical project path. The Web profile must be inside that Home, with the exact Team Profile and host versions above installed and enabled. Reuse an existing installation directly when it matches and its actual MCP health check passes; do not download or install it again. Stop on mismatches, partial installations, unknown processes, a different workspace, symlink escapes, or uncertain liveness. Do not create a new Home to bypass an unverified existing writer.

### Choose the Codex target before writing

Here, “profile” means a **Codex home directory**, not a named TOML profile selected with `codex --profile`. `--profile` does not create an independent plugin registry. Determine the home used by the intended client from its actual launch configuration: an explicit `CODEX_HOME`, otherwise normally `$HOME/.codex`. Do not assume a terminal and the desktop app use the same home. Never read authentication files to determine this.

- **Existing profile:** Get authorization for plugin registration in that exact canonical home. Keep its existing model/provider/login configuration, other marketplaces, plugins, and MCP servers. Do not copy authentication, create a replacement `config.toml`, run `codex mcp add` for this already plugin-provided server, or edit the installed manifest. Inspect existing server names for conflicts without printing their values. Stop if an independent `dsh-agent-team` server or an uncertain duplicate exists.
- **Isolated profile:** Select a new home under the installation root. The plugin will only be available to clients explicitly launched with this home. This does **not** integrate with an already running personal Codex client, and authentication is not copied.

Before modifying an existing profile, close or pause competing plugin/configuration writers with the user's permission. Make a private backup of its `config.toml` if present and record the existing marketplace/plugin inventory. The configuration backup may contain secrets: keep it local, mode 600, and never print, upload, or commit it. Inventory is not a complete profile backup. If another registry/cache path would be replaced, stop and obtain an approved backup plan for that path first. The fresh-add route below must not replace an existing marketplace or plugin. Compare the final config with the backup locally and verify that only the intended plugin registration changed; do not paste the diff into reports.

The following command blocks are only for a **confirmed fresh DSH installation**, in either a new or an authorized existing Codex home. They are not an upgrade/recovery procedure. Replace the absolute paths first and run the commands in the same shell. Shell variables and JSON contain only non-secret paths; do not enable `set -x`.

## 3. Install the published Codex plugin and dedicated runtime

```sh
set -eu
umask 077
dsh_workspace='/absolute/existing/authorized-project'
dsh_install_root='/absolute/authorized-parent/new-dsh-install'
test -d "$dsh_workspace"
test ! -e "$dsh_install_root"
test ! -L "$dsh_install_root"
mkdir -m 700 "$dsh_install_root"
mkdir -m 700 "$dsh_install_root/downloads" "$dsh_install_root/npm-cache" "$dsh_install_root/process-home"
: > "$dsh_install_root/npmrc-user"
: > "$dsh_install_root/npmrc-global"

# Choose EXACTLY ONE route before continuing:
# Existing profile (replace with the verified, authorized home):
dsh_codex_home='/absolute/existing/authorized-codex-home'
test -d "$dsh_codex_home"
# Isolated alternative: replace the preceding two lines with:
# dsh_codex_home="$dsh_install_root/codex-profile"
# mkdir -m 700 "$dsh_codex_home"

# Canonicalize after the ownership/symlink checks in section 1.
dsh_codex_home="$(cd "$dsh_codex_home" && pwd -P)"
mkdir -m 700 "$dsh_install_root/profile-backup"
if test -f "$dsh_codex_home/config.toml"; then
  cp -p "$dsh_codex_home/config.toml" "$dsh_install_root/profile-backup/config.toml"
  chmod 600 "$dsh_install_root/profile-backup/config.toml"
fi
CODEX_HOME="$dsh_codex_home" codex plugin marketplace list --json > "$dsh_install_root/profile-backup/marketplaces.json"
CODEX_HOME="$dsh_codex_home" codex plugin list --json > "$dsh_install_root/profile-backup/plugins.json"
# Inspect those inventories locally and STOP on the conflicts in section 2.
# Verify v0.3.0 resolves to the pinned source commit BEFORE adding it:
git ls-remote https://github.com/silverbullet233/oh-my-codex.git 'refs/tags/v0.3.0' 'refs/tags/v0.3.0^{}'
# For an annotated tag use the peeled ^{} commit, otherwise use the tag SHA.
# Continue only if it is 2bb302f9ab75f7bccb9274f9cacedcfbe18d904c.
CODEX_HOME="$dsh_codex_home" codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.3.0 --json
CODEX_HOME="$dsh_codex_home" codex plugin add dsh-agent-team@oh-my-codex --json > "$dsh_install_root/plugin-install.json"
dsh_plugin_root="$(node --input-type=module -e 'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(p.version!=="0.4.0" || typeof p.installedPath!=="string") process.exit(1); process.stdout.write(p.installedPath)' "$dsh_install_root/plugin-install.json")"
```

Confirm that the canonical `installedPath` is inside the selected `CODEX_HOME`, that both `plugin.json` and `package.json` identify `dsh-agent-team` / `0.4.0`, and that the MCP entrypoint is `src/mcp/main.mjs` inside that installation. Do not guess Codex's internal cache paths. Install the marketplace through its pinned Git tag; a Release `.tgz` **cannot** be passed to `codex plugin add`. The pre-install remote-tag check must have resolved to the source commit above. Do not change the remote tag.

The following process uses an empty environment and private npm configuration/cache to avoid passing provider/token configuration to package installation. Node must resolve through the currently verified PATH. If an additional proxy or CA setting is genuinely required, pass only the necessary approved settings. Do not bypass TLS or network failures by disabling verification or switching sources.

```sh
env -i PATH="$PATH" HOME="$dsh_install_root/process-home" \
  npm_config_userconfig="$dsh_install_root/npmrc-user" npm_config_globalconfig="$dsh_install_root/npmrc-global" \
  npm_config_cache="$dsh_install_root/npm-cache" \
  npm install --prefix "$dsh_install_root/runtime" @deepseek-ai/dsh@0.2.2-alpha.2 \
  --save-exact --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
export DSH_AGENT_TEAM_RUNTIME="$dsh_install_root/runtime/node_modules/@deepseek-ai/dsh"
export DSH_AGENT_TEAM_HOME="$dsh_install_root/dsh-home"
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const p=JSON.parse(fs.readFileSync(path.join(process.argv[1],"package.json"))); if(p.name!=="@deepseek-ai/dsh" || p.version!=="0.2.2-alpha.2") process.exit(1)' "$DSH_AGENT_TEAM_RUNTIME"
```

Do not install DSH globally. The subsequent setup invokes this runtime's native CLI directly. Keep the lockfile for auditing; pinning only the top-level DSH version does not guarantee byte-for-byte identical transitive dependencies in future installs.

## 4. Verify the host assets and run the existing setup

```sh
curl -fL --max-time 60 https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.0/dsh-team-roles-0.6.0.tgz -o "$dsh_install_root/downloads/dsh-team-roles-0.6.0.tgz"
curl -fL --max-time 60 https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.0/SHA256SUMS -o "$dsh_install_root/downloads/SHA256SUMS"
(cd "$dsh_install_root/downloads" && shasum -a 256 -c SHA256SUMS)
printf '%s  %s\n' '5538a263d3d2e4f05e843153e524e1501f1564324951a9f21ed6470de5ade67e' "$dsh_install_root/downloads/dsh-team-roles-0.6.0.tgz" | shasum -a 256 -c -
env -i PATH="$PATH" HOME="$dsh_install_root/process-home" \
  npm_config_userconfig="$dsh_install_root/npmrc-user" npm_config_globalconfig="$dsh_install_root/npmrc-global" \
  npm_config_cache="$dsh_install_root/npm-cache" \
  DSH_AGENT_TEAM_RUNTIME="$DSH_AGENT_TEAM_RUNTIME" DSH_AGENT_TEAM_HOME="$DSH_AGENT_TEAM_HOME" \
  node "$dsh_plugin_root/scripts/setup.mjs" "$dsh_install_root/downloads/dsh-team-roles-0.6.0.tgz" "$dsh_workspace"
```

Both digest checks must pass. Do not install GitHub's automatically generated source archive: it lacks the built Web assets. Setup installs the pinned official Team Profile and host into an empty dedicated Home using `--ignore-scripts --save-exact`; it does not install the runtime or download assets. A fully matching installation can be reused read-only. Partial failures are not automatically rolled back.

If a network proxy returns 504 for the pinned public URL, stop that step and use an **already available and authorized** GitHub CLI to download the same Release into another new download directory: `gh release download v0.6.0 --repo silverbullet233/dsh-team-roles --pattern dsh-team-roles-0.6.0.tgz --pattern SHA256SUMS --dir /absolute/new-empty-download-directory`. Do not initiate a new login or change the assets or versions. Both digest checks above still must pass; then point setup's archive argument to the verified file. This command and the downloaded bytes were verified on 2026-11-08; the digest matched the pinned value above.

## 5. Layered validation and MCP connection

1. **Static package and stdio checks**: Use the verified Node executable to run the installed MCP entrypoint and send two JSON-RPC requests: `initialize` (protocol `2025-06-18`) and `tools/list`. Check response IDs, absence of RPC errors, `serverInfo={name: "dsh-agent-team", version: "0.4.0"}`, the protocol, and tool names. The published version has **13** tools: `web, shutdown, health, create, send, status, result, stop, pending, answer, escalate, approval, wait` (all prefixed with `dsh_team_`). The current candidate has **18**, additionally including `web_url, jobs, input, withdraw_input, turn_result`. Counts are no substitute for checking exact names and identity. This step does not invoke the host or create a Team.
2. **CLI health**: Only if local native authorization state and loopback listening are allowed, run `node "$dsh_plugin_root/scripts/client.mjs" health` with the empty environment from the previous step and the same runtime/Home. This lazily starts the dedicated regular Web host. Require `owned: true`, native business API 1, compatible capabilities (including `create-permission-preset` for the published version), and the correct role catalog/bindings. Check the canonical Home/runtime/workspace in the dedicated ownership record. Do not treat a health check as real model acceptance testing.
3. **Actual MCP connection: published-version blocker.** Plugin registration in the chosen home and direct Node/CLI health checks do **not** establish an actual Codex MCP connection to the selected runtime/Home. Codex 0.164.0 filters stdio server environment variables to its default allowlist plus names declared by the server. The published plugin's `mcp.json` has neither `env` nor `env_vars`; the two DSH paths are not in Codex's default allowlist. Merely exporting them or launching `CODEX_HOME="$dsh_codex_home" DSH_AGENT_TEAM_RUNTIME=... DSH_AGENT_TEAM_HOME=... codex` is therefore **not a supported solution**. See the [pinned Codex stdio implementation](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/rmcp-client/src/utils.rs).

   **Stop here for this published combination and report “plugin registered; CLI health passed (if run); actual MCP integration blocked by missing environment forwarding.”** This applies to both existing and isolated homes. If full working MCP integration is a requirement, explain this blocker before making changes and do not proceed with a partial installation unless the user accepts it. Do not register a duplicate standalone MCP server, edit installed/released manifests, invent TOML transport overrides, or change global shell/desktop settings to conceal the blocker. Exports in another terminal also do not update an already running desktop client.

   The unpublished candidate now uses the supported `${PLUGIN_DATA}` mechanism described below. Any supported plugin/client combination must explicitly forward `DSH_AGENT_TEAM_RUNTIME` and `DSH_AGENT_TEAM_HOME`, use the verified Node executable and installed entrypoint, and pass this server's **actual `dsh_team_health`** after restart with the selected paths and identity/capabilities checked. Publishing the candidate requires separate release authorization; this guide does not authorize it. No working desktop-specific override is claimed here. Until an end-to-end route is verified, do not describe registration or a direct stdio test as one-click integration.

### Candidate-only path: persistent plugin data, no shell environment dependency

The candidate manifest sets `DSH_AGENT_TEAM_RUNTIME` to `${PLUGIN_DATA}/runtime/node_modules/@deepseek-ai/dsh` and `DSH_AGENT_TEAM_HOME` to `${PLUGIN_DATA}/dsh-home`. Codex expands these into explicit server environment values. This uses Agent Plugins v1 `env`, **not `env_vars`**, which that schema does not accept. Do not backport this by editing a cached published plugin.

This route is only for a separately authorized, validated candidate checkout at an explicit commit and the matching locally built host 0.6.1. It is not a published download recipe. Validate in a temporary profile first. An existing-profile candidate installation additionally requires the profile authorization, backup and conflict checks above. Never replace an already registered published marketplace in place.

1. Inspect the candidate checkout's exact Git commit, clean status and manifests, run the maintainer checks below, and record the matching host archive source and digest. Do not invent a tag or asset URL. Keep the checked-out source available: a local marketplace is not a published remote release.
2. In the selected authorized home, use the CLI's supported local marketplace source, replacing the remote-tag registration in section 3: `CODEX_HOME="$dsh_codex_home" codex plugin marketplace add /absolute/verified/candidate-checkout --json`, then `CODEX_HOME="$dsh_codex_home" codex plugin add dsh-agent-team@oh-my-codex --json`. Require plugin 0.4.3 and validate its returned `installedPath`. Do not run the published 0.4.0 assertion or use published 0.6.0 host assets for this route.
3. Discover the resolved transport using `CODEX_HOME="$dsh_codex_home" codex mcp list --json`, captured privately. Select exactly the entry whose transport command/args identify this installed plugin's `src/mcp/main.mjs`. Read only its two non-secret DSH paths from `transport.env`; never print other servers' environment values. Require absolute, fully expanded paths ending in `/runtime/node_modules/@deepseek-ai/dsh` and `/dsh-home` under the **same canonical plugin data parent**. Do not guess that parent's path from internal Codex cache layout. Stop if the client does not expose this entry or the values differ from the manifest contract.
4. This plugin-data parent is an additional write target inside the chosen Codex home, not the separate download root. Confirm authorization and ownership/symlink/write-boundary checks for that exact directory. Require its runtime and DSH Home to be absent for a fresh install; apply section 2's reuse checks otherwise. Use a new private download/cache root for the remaining temporary files. Install `@deepseek-ai/dsh@0.2.2-alpha.3` under the discovered parent's `runtime` directory with the sanitized npm environment and flags from section 3. Set the two DSH variables for the **setup process** to the discovered manifest values and run the candidate's setup with the verified built host 0.6.1 archive and authorized workspace. Keep these values identical for direct CLI checks. Never use the published runtime or host commands unchanged for this candidate.
5. Restart the authorized Codex client using this same home and a PATH containing verified Node >=24.9.0. The candidate no longer needs terminal exports to bind these paths: its manifest supplies them on each MCP launch. A desktop client still needs to use the same home and discover/reload the installed plugin. Call the actual `dsh_team_health`, verify versions/capabilities/ownership and the selected workspace, and only then report actual MCP integration passed. The regression below verifies Codex's real manifest expansion and MCP launch without model inference; it is not a substitute for this installation's host health check.

A release can later promote this mechanism into the normal recipe after versions and published assets are verified. Until then, report the distinction plainly: published 0.4.0 registration works but MCP path binding is blocked; candidate 0.4.3 has the binding fix but is unpublished and requires the explicitly authorized source-build route.

Initialization does not call `dsh_team_create`, `dsh_team_web`, or the candidate's `dsh_team_web_url`; open a browser; send model requests; or configure a provider. The user can complete authentication and role configuration later through native DSH. Do not copy existing account authentication into the dedicated Home.

The candidate defaults to `danger-full-access` / `never`, with network enabled intent. It does not automatically inherit Codex sandbox/approval/network restrictions and may write outside the project. Do not assume this candidate behavior applies to the published version or use it to bypass outer OS, process, or administrator restrictions. Installation must not grant broader permissions, forge signatures/authorization, or automatically approve native requests.

## 6. Failure recovery and handoff

- Download or digest failure: Stop and keep the failed files for diagnosis. Do not switch versions or continue setup. A download may be removed and fetched again from the same pinned asset only after confirming that it belongs to this procedure and has not yet been used.
- `INSTALL_FAILED` / `SETUP_INCOMPLETE` / `SETUP_MISMATCH` / `UNOWNED_HOME`: Stop and inspect this procedure's dedicated paths. Do not rerun setup against a partially installed Home, delete its directory, or migrate personal data.
- `STARTUP_PENDING` / `STARTUP_UNCERTAIN` / `OWNERSHIP_MISMATCH`: Verify the existing process's identity and outcome first. Do not automatically restart it, kill it, or create a second writer. Report only redacted error codes/diagnostic paths from logs, not launch URLs, cookies, tokens, or the raw environment.
- `RUNTIME_MISMATCH` / `CAPABILITY_MISMATCH`: Report the actual and expected non-secret versions. Do not automatically upgrade a global runtime/host, relax checks, or fall back to a lower-level connection path.
- The dedicated host started by post-installation health checks lives independently of MCP. When cleanup is needed, call `dsh_team_shutdown` (or `scripts/client.mjs shutdown` with the same environment) only after confirming that the host belongs to this installation and has no active or unknown work that would make shutdown unsafe. Check the confirmation result. If shutdown is refused, preserve the instance and report it. MCP EOF does not shut down the host. Never stop a personal Web process.
- Existing-profile rollback: preserve unrelated changes. Do not restore the entire configuration backup over subsequent edits or delete the home. With explicit rollback authorization, remove only the plugin added by this run (`CODEX_HOME="$dsh_codex_home" codex plugin remove dsh-agent-team@oh-my-codex`); remove the marketplace only if this run added it and no other plugin uses it. Compare the remaining config/inventory locally. Keep the runtime/Home until its host is safely stopped and removal is separately authorized.
- Version switching requires explicit prior authorization: check every affected plugin, use a verified published combination, run `codex plugin marketplace remove oh-my-codex`, add the marketplace and plugin again with an explicit tag, and finally restart MCP. The CLI rejects an in-place add with a different ref; `marketplace upgrade` only refreshes the currently pinned ref. Rollback also requires a matching isolated runtime/Home. Do not automatically migrate DSH data. All commands must still target the authorized `CODEX_HOME`.
- Final handoff: Report exact catalog/plugin/runtime/Team Profile/host versions and sources, the selected Codex home and existing/isolated mode, backup location (not contents), preservation checks, the installation root and `installedPath`, the two non-secret MCP paths, verification digests and results, separate static/CLI/actual MCP statuses, whether the dedicated host is still running, and any remaining blockers and recovery steps. Passing read-only validation is different from being ready to run model tasks. Without a real MCP health check, keep the blocker explicit.

Maintainer regression commands: `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`, `npm run build`, `npm run pack:check`, `npm run release:prepare -- --output /absolute/new-empty-output`, `npm run test:install`, and `npm run test:mcp-env`. The installation fixture verifies installation, refresh, upgrade, same-version replacement, rollback, and the actual stdio interface only in a temporary `CODEX_HOME` and local Git fixture. The MCP environment fixture launches Codex app-server with local plugin fixtures and verifies resolved paths and actual server startup without inference. Fixture tags/versions are not historical releases. It does not use personal configuration, remote tags, provider credentials, or model inference.
