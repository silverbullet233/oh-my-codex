# DSH Agent Team: Installation Guide for Agents

Users can give this file to an agent with an instruction such as: "Install DSH Agent Team using this guide. The workspace is ..., and the installation root is ...." The agent should complete checks, installation, and verification within the authorized scope. If permissions, dependencies, authentication, or a required client restart block progress, preserve the current state and report the exact blocker. This document is an executable procedure; **there is no separate `install.sh`, bootstrap command, or automatic MCP discovery feature**.

## Repository ownership and pinned versions

DSH Agent Team is `plugins/dsh-agent-team` in [silverbullet233/oh-my-codex](https://github.com/silverbullet233/oh-my-codex). The separate [dsh-team-roles](https://github.com/silverbullet233/dsh-team-roles) repository provides the native DSH host and roles; it is not a Codex marketplace. Do not modify Codex installation tests in that repository or install the Codex plugin from it.

The combinations below were verified on 2026-11-08. Recheck both repositories' releases, tags, and manifests before proceeding. Stop if the publication status or contents differ; do not automatically select the latest version.

| Purpose | Catalog / Codex plugin | Official DSH / Team Profile | dsh-team-roles host |
| --- | --- | --- | --- |
| Normal installation, published | **v0.3.0 / 0.4.0** | **0.2.2-alpha.2** | Built Release `.tgz` for **0.6.0** |
| Development candidate, unpublished | 0.3.1 / 0.4.3 | 0.2.2-alpha.3 | Matching unpublished 0.6.1 candidate build |

The published [catalog v0.3.0](https://github.com/silverbullet233/oh-my-codex/releases/tag/v0.3.0) comes from source commit `2bb302f9ab75f7bccb9274f9cacedcfbe18d904c` and pairs with [host v0.6.0](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.6.0). The candidate **has no v0.3.1 tag, Release assets, or npm publication**. Never invent candidate download URLs or use `main`, a feature branch, `latest`, or a GitHub source archive for normal installation. Candidate validation requires separate authorization, an isolated location, an explicit commit, and a matching locally built host, with its source and digest reported. Do not substitute host 0.6.0. This guide does not authorize publishing, tagging, or changing marketplace publication status.

## 1. Authorization, targets, and prerequisites

- Confirm the authorized absolute path of the existing project, installation root, Codex profile, and whether network downloads are allowed. Default to a **new, separate installation root and a separate `CODEX_HOME`**, writing only within that root. Modifying the user's real Codex installation requires explicit prior authorization. All examples use an isolated profile and leave personal `~/.codex`, `~/.dsh`, and system configuration unchanged.
- Use existing installations of Git, Node **>=24.9.0**, npm, a Codex CLI supporting `codex plugin`, curl, and shasum. CLI **0.164.0** has been verified. Check `node --version`, `npm --version`, and `git --version`; check `codex --version` and `codex plugin marketplace add --help` / `codex plugin add --help` under a temporary `CODEX_HOME`. Report missing commands or incompatible versions. **Do not run brew, sudo, global npm installs, npx automatic downloads, or system upgrades**.
- Check canonical paths, ownership by the current user, permissions, symlinks, and writable boundaries. The installation root must not be inside an existing runtime, DSH Home, project source tree, or another application's state directory. Do not repair unknown directories with recursive chmod/chown.
- Public repositories normally need no GitHub authentication (both repositories were public on 2026-11-08). Private mirrors must already be accessible through an existing Git credential manager. Verify Git and `gh` authentication separately. Stop on authentication failure; do not create tokens, initiate a new login flow, or put credentials in URLs, command arguments, MCP configuration, reports, or the temporary profile. Do not print the environment, npm configuration, personal configuration, or secrets, and do not copy personal DSH/provider configuration.
- Installation authorization covers initialization and health checks without inference, not working Teams, paid model requests, provider credential configuration, automatic browser opening, or expanded persistent permissions. On first startup, DSH may generate local browser/API authorization state through its native flow. If the user prohibits any such state creation, stop after static validation and report that health checks were not run. The agent must not generate or collect credentials itself.

## 2. Check idempotency and conflicts first

For an existing installation, first check the explicitly configured `DSH_AGENT_TEAM_RUNTIME` / `DSH_AGENT_TEAM_HOME` and the target profile's `codex plugin marketplace list --json` and `codex plugin list --json`. Do not paste private configuration into reports. Check the marketplace URL, pinned ref, plugin version, and `installedPath`. Stop if a marketplace with the same name uses a different URL/ref or a different plugin version is installed; do not automatically remove or upgrade it.

A matching runtime must have the correct package name and exact version. The dedicated Home's `.codex-dsh-owner.json` must have `version: 1`, `owner: oh-my-codex/dsh-agent-team`, and a `cwd` matching the same canonical project path. The Web profile must be inside that Home, with the exact Team Profile and host versions above installed and enabled. Reuse an existing installation directly when it matches and its actual MCP health check passes; do not download or install it again. Stop on mismatches, partial installations, unknown processes, a different workspace, symlink escapes, or uncertain liveness. Do not create a new Home to bypass an unverified existing writer.

The following command blocks are only for a **confirmed fresh installation**. Replace the two absolute paths first and run the commands in the same shell. Shell variables and JSON contain only non-secret paths; do not enable `set -x`.

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
mkdir -m 700 "$dsh_install_root/codex-profile" "$dsh_install_root/downloads" "$dsh_install_root/npm-cache" "$dsh_install_root/process-home"
: > "$dsh_install_root/npmrc-user"
: > "$dsh_install_root/npmrc-global"

CODEX_HOME="$dsh_install_root/codex-profile" codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.3.0 --json
CODEX_HOME="$dsh_install_root/codex-profile" codex plugin add dsh-agent-team@oh-my-codex --json > "$dsh_install_root/plugin-install.json"
dsh_plugin_root="$(node --input-type=module -e 'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(p.version!=="0.4.0" || typeof p.installedPath!=="string") process.exit(1); process.stdout.write(p.installedPath)' "$dsh_install_root/plugin-install.json")"
```

Confirm that the canonical `installedPath` is inside the selected `CODEX_HOME`, that both `plugin.json` and `package.json` identify `dsh-agent-team` / `0.4.0`, and that the MCP entrypoint is `src/mcp/main.mjs` inside that installation. Do not guess Codex's internal cache paths. Install the marketplace through its pinned Git tag; a Release `.tgz` **cannot** be passed to `codex plugin add`. Before continuing, verify that the remote tag resolves to the source commit above. Do not change the remote tag.

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
3. **Actual MCP connection**: Set these two non-secret environment variables using the host application's supported per-server controls, with a supported Node executable and the installed entrypoint. Do not silently edit global configuration or the installed manifest. A newly started CLI can use the following process-level command (it opens an interactive interface and must not be run as a background test):

   ```sh
   CODEX_HOME="$dsh_install_root/codex-profile" \
     DSH_AGENT_TEAM_RUNTIME="$DSH_AGENT_TEAM_RUNTIME" \
     DSH_AGENT_TEAM_HOME="$DSH_AGENT_TEAM_HOME" codex
   ```

   After restarting MCP, call this server's **actual `dsh_team_health`** and recheck the identity/capabilities above. Exports in another terminal do not update an already running desktop client. If per-server configuration or restart permission is unavailable, deliver the two paths and restart instructions, and record the status as "CLI passed; actual MCP connection pending." Do not claim that the entire installation succeeded in one step.

Initialization does not call `dsh_team_create`, `dsh_team_web`, or the candidate's `dsh_team_web_url`; open a browser; send model requests; or configure a provider. The user can complete authentication and role configuration later through native DSH. Do not copy existing account authentication into the dedicated Home.

The candidate defaults to `danger-full-access` / `never`, with network enabled intent. It does not automatically inherit Codex sandbox/approval/network restrictions and may write outside the project. Do not assume this candidate behavior applies to the published version or use it to bypass outer OS, process, or administrator restrictions. Installation must not grant broader permissions, forge signatures/authorization, or automatically approve native requests.

## 6. Failure recovery and handoff

- Download or digest failure: Stop and keep the failed files for diagnosis. Do not switch versions or continue setup. A download may be removed and fetched again from the same pinned asset only after confirming that it belongs to this procedure and has not yet been used.
- `INSTALL_FAILED` / `SETUP_INCOMPLETE` / `SETUP_MISMATCH` / `UNOWNED_HOME`: Stop and inspect this procedure's dedicated paths. Do not rerun setup against a partially installed Home, delete its directory, or migrate personal data.
- `STARTUP_PENDING` / `STARTUP_UNCERTAIN` / `OWNERSHIP_MISMATCH`: Verify the existing process's identity and outcome first. Do not automatically restart it, kill it, or create a second writer. Report only redacted error codes/diagnostic paths from logs, not launch URLs, cookies, tokens, or the raw environment.
- `RUNTIME_MISMATCH` / `CAPABILITY_MISMATCH`: Report the actual and expected non-secret versions. Do not automatically upgrade a global runtime/host, relax checks, or fall back to a lower-level connection path.
- The dedicated host started by post-installation health checks lives independently of MCP. When cleanup is needed, call `dsh_team_shutdown` (or `scripts/client.mjs shutdown` with the same environment) only after confirming that the host belongs to this installation and has no active or unknown work that would make shutdown unsafe. Check the confirmation result. If shutdown is refused, preserve the instance and report it. MCP EOF does not shut down the host. Never stop a personal Web process.
- Version switching requires explicit prior authorization: check every affected plugin, use a verified published combination, run `codex plugin marketplace remove oh-my-codex`, add the marketplace and plugin again with an explicit tag, and finally restart MCP. The CLI rejects an in-place add with a different ref; `marketplace upgrade` only refreshes the currently pinned ref. Rollback also requires a matching isolated runtime/Home. Do not automatically migrate DSH data. All commands must still target the authorized `CODEX_HOME`.
- Final handoff: Report exact catalog/plugin/runtime/Team Profile/host versions and sources, the installation root and `installedPath`, the two non-secret MCP paths, verification digests and results, separate static/CLI/actual MCP statuses, whether the dedicated host is still running, and any remaining blockers and recovery steps. Passing read-only validation is different from being ready to run model tasks. Without a real MCP health check, keep the blocker explicit.

Maintainer regression commands: `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`, `npm run build`, `npm run pack:check`, `npm run release:prepare -- --output /absolute/new-empty-output`, and `npm run test:install`. The last command verifies installation, refresh, upgrade, same-version replacement, rollback, and the actual stdio interface only in a temporary `CODEX_HOME` and local Git fixture. Fixture tags/versions are not historical releases. It does not use personal configuration, remote tags, provider credentials, or model inference.
