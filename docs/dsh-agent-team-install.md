# DSH Agent Team: Installation Guide for Agents

Users can give this file to an agent with an instruction such as: "Install DSH Agent Team using this guide. The workspace is ..., and the installation root is ...." Complete installation and verification within the authorized scope. Preserve state and report exact dependency, permission, authentication or restart blockers. There is no separate `install.sh` or automatic runtime discovery.

## Repository ownership and pinned versions

The Codex plugin is `plugins/dsh-agent-team` in [silverbullet233/oh-my-codex](https://github.com/silverbullet233/oh-my-codex). [dsh-team-roles](https://github.com/silverbullet233/dsh-team-roles) supplies the native Host; it is not a Codex marketplace.

| Component | Required version/source |
| --- | --- |
| Catalog / Codex plugin | **v0.3.1 / 0.4.3**, fixed Git marketplace tag |
| Official DSH / Team Profile | **0.2.2-alpha.3**, official npm packages |
| Native Host | Built **[dsh-team-roles 0.6.1 Release](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.6.1)** archive |

Catalog **v0.3.1 was published on 2026-11-08** from reviewed commit `7c70e4aeec07fb55b59a28ccdb92c92ac7f3a837`. Its official tag workflow, public assets/checksums and a new fixed-tag clean installation through actual Codex MCP all passed verification. Before installing, verify the fixed catalog Release, its checksums and tag/commit mapping below. The Host was published and its actual archive verified separately. Never substitute `main`, a feature branch, `latest`, an older Host/runtime, or a GitHub source archive. Earlier catalog v0.3.0 / plugin 0.4.0 remains unchanged and lacks MCP path forwarding; it is not a fallback route for working MCP integration.

Plugin 0.4.3 uses standard manifest `env` and `${PLUGIN_DATA}` expansion to bind the MCP runtime/Home. Codex 0.164.0 was verified with this mechanism, including actual Host health and guarded shutdown. Discover those resolved paths before installing dependencies. Terminal exports alone do not override them. Desktop integration still requires the intended client to use the same Codex home, supported Node on PATH and a restart/reload; no separate desktop-specific override is claimed. See [validation evidence](release-0.3.1-validation.md).

## 1. Authorization, targets, and prerequisites

- Confirm the authorized absolute path of the existing project, installation root, Codex profile, and whether network downloads are allowed. Use the explicitly authorized Codex plugin-data directory for the runtime and DSH Home, and a **new, separate installation root** for downloads, private npm configuration/cache and optional isolated Codex home. Choose the Codex target explicitly: **existing profile** to make the plugin available in the user's normal Codex, or **isolated profile** for evaluation. If the target is unspecified, ask; do not silently install into an unused isolated profile and call it integrated. Modifying an existing profile requires explicit prior authorization. Both routes keep personal `~/.dsh` and system configuration unchanged.
- Use existing installations of Git, Node **>=24.9.0**, npm, a Codex CLI supporting `codex plugin`, curl, and shasum. CLI **0.164.0** was verified for the original guide; the profile-preservation fixture also passes on **0.167.0-alpha.4**. This is a tested-version statement, not a request to upgrade. Check `node --version`, `npm --version`, and `git --version`; check `codex --version` and `codex plugin marketplace add --help` / `codex plugin add --help` under a temporary `CODEX_HOME`. Report missing commands or incompatible versions. **Do not run brew, sudo, global npm installs, npx automatic downloads, or system upgrades**.
- Check canonical paths, ownership by the current user, permissions, symlinks, and writable boundaries. The installation root must not be inside an existing runtime, DSH Home, project source tree, or another application's state directory. Do not repair unknown directories with recursive chmod/chown.
- Public repositories normally need no GitHub authentication (both repositories were public on 2026-11-08). Private mirrors must already be accessible through an existing Git credential manager. Verify Git and `gh` authentication separately. Stop on authentication failure; do not create tokens, initiate a new login flow, or put credentials in URLs, command arguments, MCP configuration, reports, or the temporary profile. Do not print the environment, npm configuration, personal configuration, or secrets, and do not copy personal DSH/provider configuration.
- Installation authorization covers initialization and health checks without inference, not working Teams, paid model requests, provider credential configuration, automatic browser opening, or expanded persistent permissions. On first startup, DSH may generate local browser/API authorization state through its native flow. If the user prohibits any such state creation, stop after static validation and report that health checks were not run. The agent must not generate or collect credentials itself.

## 2. Check idempotency and conflicts first

For an existing installation, first discover and check the manifest-bound `DSH_AGENT_TEAM_RUNTIME` / `DSH_AGENT_TEAM_HOME` and the target profile's `codex plugin marketplace list --json` and `codex plugin list --json`. Do not paste private configuration into reports. Check the marketplace URL, pinned ref, plugin version, and `installedPath`. Stop if a marketplace with the same name uses a different URL/ref or a different plugin version is installed; do not automatically remove or upgrade it.

A matching runtime must have the correct package name and exact version. The dedicated Home's `.codex-dsh-owner.json` must have `version: 1`, `owner: oh-my-codex/dsh-agent-team`, and a `cwd` matching the same canonical project path. The Web profile must be inside that Home, with the exact Team Profile and host versions above installed and enabled. Reuse an existing installation directly when it matches and its actual MCP health check passes; do not download or install it again. Stop on mismatches, partial installations, unknown processes, a different workspace, symlink escapes, or uncertain liveness. Do not create a new Home to bypass an unverified existing writer.

### Choose the Codex target before writing

Here, “profile” means a **Codex home directory**, not a named TOML profile selected with `codex --profile`. `--profile` does not create an independent plugin registry. Determine the home used by the intended client from its actual launch configuration: an explicit `CODEX_HOME`, otherwise normally `$HOME/.codex`. Do not assume a terminal and the desktop app use the same home. Never read authentication files to determine this.

- **Existing profile:** Get authorization for plugin registration in that exact canonical home. Keep its existing model/provider/login configuration, other marketplaces, plugins, and MCP servers. Do not copy authentication, create a replacement `config.toml`, run `codex mcp add` for this already plugin-provided server, or edit the installed manifest. Inspect existing server names for conflicts without printing their values. Stop if an independent `dsh-agent-team` server or an uncertain duplicate exists.
- **Isolated profile:** Select a new home under the installation root. The plugin will only be available to clients explicitly launched with this home. This does **not** integrate with an already running personal Codex client, and authentication is not copied.

Before modifying an existing profile, close or pause competing plugin/configuration writers with the user's permission. Make a private backup of its `config.toml` if present and record the existing marketplace/plugin inventory. The configuration backup may contain secrets: keep it local, mode 600, and never print, upload, or commit it. Inventory is not a complete profile backup. If another registry/cache path would be replaced, stop and obtain an approved backup plan for that path first. The fresh-add route below must not replace an existing marketplace or plugin. Compare the final config with the backup locally and verify that only the intended plugin registration changed; do not paste the diff into reports.

The following command blocks are only for a **confirmed fresh DSH installation**, in either a new or an authorized existing Codex home. They are not an upgrade/recovery procedure. Replace the absolute paths first and run the commands in the same shell. Shell variables and JSON contain only non-secret paths; do not enable `set -x`.

## 3. Verify the fixed catalog and register the plugin

The command blocks are for a **confirmed fresh installation** in an authorized existing or isolated Codex home. They are not an upgrade or recovery procedure. Replace absolute paths and use the same shell. Shell variables and JSON contain only paths; do not enable `set -x`.

```sh
set -eu
umask 077
dsh_workspace='/absolute/existing/authorized-project'
dsh_install_root='/absolute/authorized-parent/new-dsh-install'
test -d "$dsh_workspace"
test ! -e "$dsh_install_root"
test ! -L "$dsh_install_root"
mkdir -m 700 "$dsh_install_root"
mkdir -m 700 "$dsh_install_root/downloads" "$dsh_install_root/npm-cache" "$dsh_install_root/process-home" "$dsh_install_root/catalog"
: > "$dsh_install_root/npmrc-user"
: > "$dsh_install_root/npmrc-global"

# Choose EXACTLY ONE route:
# Existing profile (replace with the verified, authorized home):
dsh_codex_home='/absolute/existing/authorized-codex-home'
test -d "$dsh_codex_home"
# Isolated alternative: replace the preceding two lines with:
# dsh_codex_home="$dsh_install_root/codex-profile"
# mkdir -m 700 "$dsh_codex_home"
dsh_codex_home="$(cd "$dsh_codex_home" && pwd -P)"
mkdir -m 700 "$dsh_install_root/profile-backup"
if test -f "$dsh_codex_home/config.toml"; then
  cp -p "$dsh_codex_home/config.toml" "$dsh_install_root/profile-backup/config.toml"
  chmod 600 "$dsh_install_root/profile-backup/config.toml"
fi
CODEX_HOME="$dsh_codex_home" codex plugin marketplace list --json > "$dsh_install_root/profile-backup/marketplaces.json"
CODEX_HOME="$dsh_codex_home" codex plugin list --json > "$dsh_install_root/profile-backup/plugins.json"
# Inspect those inventories locally; STOP on the conflicts in section 2.

for dsh_asset in catalog.json release-notes.md dsh-agent-team-0.4.3.tgz SHA256SUMS; do
  curl -fL --max-time 60 "https://github.com/silverbullet233/oh-my-codex/releases/download/v0.3.1/$dsh_asset" -o "$dsh_install_root/catalog/$dsh_asset"
done
(cd "$dsh_install_root/catalog" && shasum -a 256 -c SHA256SUMS)
node --input-type=module -e 'import fs from "node:fs"; const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(c.catalogVersion!=="0.3.1" || c.tag!=="v0.3.1" || !/^[a-f0-9]{40}$/.test(c.commit) || c.plugins.length!==1 || c.plugins[0].name!=="dsh-agent-team" || c.plugins[0].version!=="0.4.3") process.exit(1)' "$dsh_install_root/catalog/catalog.json"
git ls-remote https://github.com/silverbullet233/oh-my-codex.git 'refs/tags/v0.3.1' 'refs/tags/v0.3.1^{}'
# Require the peeled ^{} commit (or lightweight tag SHA) to equal catalog.json's commit.
# Do not continue until that comparison passes. Never move a remote tag.
CODEX_HOME="$dsh_codex_home" codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.3.1 --json
CODEX_HOME="$dsh_codex_home" codex plugin add dsh-agent-team@oh-my-codex --json > "$dsh_install_root/plugin-install.json"
dsh_plugin_root="$(node --input-type=module -e 'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(p.version!=="0.4.3" || typeof p.installedPath!=="string") process.exit(1); process.stdout.write(p.installedPath)' "$dsh_install_root/plugin-install.json")"
```

Require canonical `installedPath` inside the selected `CODEX_HOME`, matching `dsh-agent-team` / `0.4.3` in both `plugin.json` and `package.json`, and the installed `src/mcp/main.mjs` entrypoint. Release archives are supplementary verification artifacts; a `.tgz` cannot be passed to `codex plugin add`.

Discover the paths Codex will actually supply to MCP:

```sh
CODEX_HOME="$dsh_codex_home" codex mcp list --json > "$dsh_install_root/mcp-list-private.json"
node --input-type=module - "$dsh_install_root/mcp-list-private.json" "$dsh_plugin_root" "$dsh_codex_home" "$dsh_install_root/mcp-paths.json" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const [input, root, codexHome, output] = process.argv.slice(2);
const entrypoint = path.join(fs.realpathSync(root), 'src/mcp/main.mjs');
const entries = JSON.parse(fs.readFileSync(input, 'utf8')).filter(row => row.transport?.args?.length === 1 && row.transport.args[0] === entrypoint);
assert.equal(entries.length, 1);
assert.equal(entries[0].enabled, true);
assert.equal(entries[0].transport.command, 'node');
const runtime = entries[0].transport.env?.DSH_AGENT_TEAM_RUNTIME;
const home = entries[0].transport.env?.DSH_AGENT_TEAM_HOME;
assert.equal(typeof runtime, 'string'); assert.equal(typeof home, 'string');
const parent = path.dirname(home);
assert(path.isAbsolute(parent) && parent.startsWith(fs.realpathSync(codexHome) + path.sep));
assert(!parent.includes('${'));
assert.equal(home, path.join(parent, 'dsh-home'));
assert.equal(runtime, path.join(parent, 'runtime/node_modules/@deepseek-ai/dsh'));
fs.writeFileSync(output, JSON.stringify({ runtime, home, prefix: path.join(parent, 'runtime') }), { mode: 0o600 });
NODE
export DSH_AGENT_TEAM_RUNTIME="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).runtime' "$dsh_install_root/mcp-paths.json")"
export DSH_AGENT_TEAM_HOME="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).home' "$dsh_install_root/mcp-paths.json")"
dsh_runtime_prefix="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).prefix' "$dsh_install_root/mcp-paths.json")"
```

Keep the complete MCP inventory private; it can include unrelated server secrets. Inspect and authorize the exact discovered plugin-data parent as an additional write target inside the Codex home. Apply section 1's ownership, canonical-path, symlink and writable-boundary checks. Require both runtime prefix and DSH Home to be absent for a fresh install. Never change these paths to conceal a mismatch or bypass an existing writer. The exported variables below configure setup/direct CLI checks; the manifest independently supplies the same values to MCP on every launch.

## 4. Install the exact runtime and verified Host

Use an empty process environment and private npm configuration/cache to avoid passing provider/token configuration to installation. Node must resolve through the verified PATH. Pass only necessary approved proxy/CA settings if required; do not disable TLS verification or switch sources.

```sh
test ! -e "$dsh_runtime_prefix"
test ! -L "$dsh_runtime_prefix"
test ! -e "$DSH_AGENT_TEAM_HOME"
test ! -L "$DSH_AGENT_TEAM_HOME"
env -i PATH="$PATH" HOME="$dsh_install_root/process-home" \
  npm_config_userconfig="$dsh_install_root/npmrc-user" npm_config_globalconfig="$dsh_install_root/npmrc-global" \
  npm_config_cache="$dsh_install_root/npm-cache" \
  npm install --prefix "$dsh_runtime_prefix" @deepseek-ai/dsh@0.2.2-alpha.3 \
  --save-exact --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const p=JSON.parse(fs.readFileSync(path.join(process.argv[1],"package.json"))); if(p.name!=="@deepseek-ai/dsh" || p.version!=="0.2.2-alpha.3") process.exit(1)' "$DSH_AGENT_TEAM_RUNTIME"
curl -fL --max-time 60 https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.1/dsh-team-roles-0.6.1.tgz -o "$dsh_install_root/downloads/dsh-team-roles-0.6.1.tgz"
curl -fL --max-time 60 https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.1/SHA256SUMS -o "$dsh_install_root/downloads/SHA256SUMS"
(cd "$dsh_install_root/downloads" && shasum -a 256 -c SHA256SUMS)
printf '%s  %s\n' '00f3fbf359289afa648fe8ef57b01739631c3ea70184f7f9351323dae1fcf669' "$dsh_install_root/downloads/dsh-team-roles-0.6.1.tgz" | shasum -a 256 -c -
env -i PATH="$PATH" HOME="$dsh_install_root/process-home" \
  npm_config_userconfig="$dsh_install_root/npmrc-user" npm_config_globalconfig="$dsh_install_root/npmrc-global" \
  npm_config_cache="$dsh_install_root/npm-cache" \
  DSH_AGENT_TEAM_RUNTIME="$DSH_AGENT_TEAM_RUNTIME" DSH_AGENT_TEAM_HOME="$DSH_AGENT_TEAM_HOME" \
  node "$dsh_plugin_root/scripts/setup.mjs" "$dsh_install_root/downloads/dsh-team-roles-0.6.1.tgz" "$dsh_workspace"
```

Both digest checks must pass. Setup uses the dedicated exact CLI to install official Team Profile `0.2.2-alpha.3` and Host `0.6.1` into the empty Home with scripts disabled and exact versions. Validate the installed profile package names, versions and enabled bundle list. Setup does not install the runtime, download assets, roll back partial state or migrate personal profiles. Keep lockfiles for auditing; a top-level runtime pin does not guarantee identical future transitive bytes.

If a pinned public URL fails through a proxy, stop that download. An already available and authorized GitHub CLI may fetch the same Release into a new empty directory: `gh release download v0.6.1 --repo silverbullet233/dsh-team-roles --pattern dsh-team-roles-0.6.1.tgz --pattern SHA256SUMS --dir /absolute/new-empty-download-directory`. Both digest checks still apply. Do not initiate login, change assets or silently select another version.

## 5. Layered validation and actual MCP connection

1. **Static stdio check:** Send `initialize` (protocol `2025-06-18`) and `tools/list` to the installed `src/mcp/main.mjs` with the verified Node. Require matching response IDs, no RPC errors, `serverInfo.name=dsh-agent-team`, `serverInfo.version=0.4.3`, negotiated protocol and exactly these 18 names (all prefixed `dsh_team_`): `web, web_url, shutdown, health, create, send, status, jobs, input, withdraw_input, result, turn_result, stop, pending, answer, escalate, approval, wait`. Reject missing, duplicate, substituted or unexpected names. This check starts no Host.
2. **CLI health:** If native local authorization state and loopback listeners are authorized, run `node "$dsh_plugin_root/scripts/client.mjs" health` using the empty environment and same two DSH paths from section 4. Require `owned: true`, API `dsh-team-roles` version 1, official runtime `0.2.2-alpha.3`, all required capabilities (including permission profiles/presets, ended-turn results, input/Job observations and live withdrawal), and expected roles. Inspect the private ownership/instance records locally: Home, runtime package, workspace, instance ID, PID and start time must match. CLI health starts/reuses only this dedicated ordinary Web host; it is not model acceptance.
3. **Actual Codex MCP:** Restart/reload the intended client with this same Codex home and verified Node on PATH. Use the installed server's **actual `dsh_team_health`**, and repeat the same identity, capability, ownership and workspace checks. Codex app-server `mcpServer/tool/call` is also a real MCP route when directed at a thread in this home; it needs no inference turn. The manifest supplies both paths via supported `${PLUGIN_DATA}` expansion. Direct Node/CLI health is not proof of this step. If the client cannot expose/start the installed server or actual health fails, retain that exact blocker and do not claim a connected installation.

The isolated macOS / Codex 0.164.0 acceptance passed all three layers, actual app-server health and guarded shutdown. It did not verify the user's current desktop session, provider inference, authenticated browser rendering or unrestricted OS/network access. Do not copy authentication or configure providers during installation. Initialization never calls `dsh_team_create`, `dsh_team_web` or `dsh_team_web_url`, opens a browser or sends model requests.

Teams default to **native full access** (`danger-full-access` / `never`, network enabled intent). Codex sandbox/approval/network settings are not automatically inherited; the Host may write outside the project wherever its process can access. Explicit profiles remain supported. Outer OS/process/admin restrictions still apply; network intent is not a connectivity guarantee. Do not grant persistent permissions, forge authorization or automatically approve native requests.

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
