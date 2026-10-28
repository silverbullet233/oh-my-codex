# Get started with DSH Agent Team

**A running native `dsh web` host with `dsh-team-roles` loaded is required.** The Codex plugin is a client: Codex → stdio MCP → private local IPC → the same native DSH Session/Team service that Web uses. It does not start DSH, create another scheduler or replace the native UI. Keep that host running while Codex submits and continues work.

## 1. Check the prerequisites

- Node.js satisfying the installed DSH runtime's requirements and this client's **>=24.9.0** minimum, a compatible local Codex client, and DSH running as the same OS user. UID-owned Unix sockets are required; macOS is validated, Windows is not established.
- The exact official npm runtime **`@deepseek-ai/dsh@0.2.2-alpha.2`**, which supplies native `agent.model.select/current` and durable selection. No DSH source checkout or source build is needed for this release-runtime path. rc.3/rc.4 lack the required APIs; other versions need separate compatibility verification.
- The **unreleased local `dsh-team-roles` 0.4.0 candidate**. Upstream's 88 local keyless tests and standalone tarball installation/loading checks passed on the npm runtime. The adaptation is under review in [upstream PR #4](https://github.com/silverbullet233/dsh-team-roles/pull/4). The existing published **0.3.0** host is source-locked and is not compatible with alpha.2.
- Existing native provider registrations and authentication for the model you intend to use. Select a working native main Agent model in Web before the first task.

When installing the runtime, use its exact npm version rather than a moving tag:

```sh
npm install -g @deepseek-ai/dsh@0.2.2-alpha.2
```

Coordinate any replacement of an existing runtime with its active work. Use `command -v dsh` and `dsh --version` to check the launcher your terminal resolves. The native plugin also checks APIs and shared service identities at activation. The host package version, Codex client **0.2.0**, and IPC protocol **1** are separate versions.

## 2. Install the DSH plugin and enable native Teams

Perform profile installation/edits while the host is stopped, or coordinate native reload with its active work. Do not start a second writer against the same Session store or IPC socket.

Enable the exact official Team profile first if it is not already active, then install the **locally built 0.4.0 tarball** through the alpha.2 launcher:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-team-profile@0.2.2-alpha.2 --ignore-scripts
dsh plugin --profile web add /absolute/path/to/dsh-team-roles-0.4.0.tgz --ignore-scripts
```

Replace the placeholder with the actual locally built 0.4.0 candidate tarball. **0.4.0 is not yet a published release.** This command initializes the Web profile if needed and adds the role bundle. Do not substitute the published [0.3.0 asset](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.3.0) or a Git source archive. A compatible public tarball URL will be documented after validation and publication; none is implied here.

These commands manage the Web profile's installed dependencies and ordered bundles. The official Team profile enables `agent-team`, `tool-agent-team` and `ui-agent-team`; the default Web profile alone does not enable them. It must follow the base bundle and precede `dsh-team-roles`. Existing profile dependencies and other bundle choices should be preserved. All entries resolve through the same native runtime/profile resolver, without manual dependency links or manifest replacement. See the candidate's [runtime requirements](https://github.com/silverbullet233/dsh-team-roles/blob/303eef006c75a45270a2d3f55b6a5842d4de2512/docs/runtime.md).

## 3. Start Web from the intended workspace

For the first task, use an empty directory that you authorize for model work. From an interactive terminal with the required provider environment already initialized:

```sh
cd /absolute/path/to/quickstart-workspace
dsh web
```

For a fresh installation, the default allowed workspace is the host's launch directory. If the intended compatible host is already running, use its allowed workspace and connect to it instead of starting another. Keep the terminal/host alive and open the URL through the launcher's normal browser authentication flow. If your existing provider variables are initialized by `~/.zshrc`, a noninteractive launcher can use normal shell initialization:

```sh
zsh -ic 'cd /absolute/path/to/quickstart-workspace && exec dsh web'
```

Do not print, extract or copy credentials. Check registered providers, model IDs and sign-in state through native Web's model settings. An already running host does not acquire variables exported later in another terminal. Roles refer to those existing registrations and contain no secrets or endpoint overrides.

Startup must load both the native Team bundle and `dsh-team-roles` without activation errors. An HTTP page being reachable does not prove the role plugin or IPC adapter activated. See [native configuration](https://github.com/silverbullet233/dsh-team-roles/blob/main/docs/configuration.md) for profile overrides, state and workspace roots.

## 4. Install the Codex client

These commands can run from any directory in a current CLI that exposes `codex plugin add`:

```sh
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex --ref main
codex plugin add dsh-agent-team@oh-my-codex
codex plugin list --marketplace oh-my-codex --json
```

The marketplace is **`oh-my-codex`** (display name **Oh My Codex**); the plugin is **`dsh-agent-team`** (display name **DSH Agent Team**). Installation enables it. No manual copy, local build or npm installation of this client is needed.

Start a **new Codex session** after installation. `/plugins` opens the CLI plugin browser. In a supported desktop client, choose the marketplace and plugin in the Plugins directory; after registering a new local marketplace, refresh/restart the desktop client as described in the [official marketplace documentation](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli). See the [official session guidance](https://learn.chatgpt.com/docs/plugins). Desktop automatic discovery was not exercised by the published-install acceptance; the CLI installation path was.

To refresh a previously configured remote marketplace, use `codex plugin marketplace upgrade oh-my-codex`, inspect the plugin list, and use a new session. Installing the Codex plugin does not install, upgrade or restart the DSH host, or change Codex's selected model/subscription.

## 5. Check the connection before submitting work

Ask Codex:

```text
Use dsh-agent-team. Call dsh_team_health only. Report whether the native host is
ready, runtime.packageVersion, protocol/capabilities and available roles.
Do not create a task or start another host.
```

Expect `ok: true`, protocol name `dsh-team-roles`, version `1`, and capabilities `native-session`, `durable-role-snapshots`, `native-role-settings`, `text-input`, `idempotent-admission`. An empty role catalog is valid. The client refuses incompatible capabilities before submitting work.

The released runtime is identified by `health.runtime.packageVersion`, expected to be `0.2.2-alpha.2`. Its `health.sourceSha` is `null`; this is normal for the npm runtime and does not indicate a failed source build. Runtime/API/service-identity checks are performed by the native host.

For direct diagnostics, run `node scripts/client.mjs health` **from this plugin's root** in a checkout or extracted package; from the collection root use `node plugins/dsh-agent-team/scripts/client.mjs health`. This is an optional diagnostic, not another server.

## 6. Submit a first synthetic task, then change its direction

The following calls use the selected DSH model/account and may consume its quota. Replace the absolute directory with the same authorized empty workspace used to launch Web. Keep the task text synthetic; the first check needs no file, shell or network tools.

Ask Codex to call `dsh_team_create` with:

```json
{
  "key": "quickstart-001",
  "cwd": "/absolute/path/to/quickstart-workspace",
  "text": "Synthetic smoke test. Reply exactly QUICKSTART_OK. Do not call tools, inspect files, spawn members or use network access."
}
```

Then ask it to retain the returned `teamId` and `inputId`, and call `dsh_team_result` until the input is processed with outcome `completed`, `completed: true`, and output `QUICKSTART_OK`. Use a small polling limit and report an error instead of starting another Team. `accepted: true` means admitted, not completed.

To adjust the **same Lead**, replace the placeholder below with that returned `teamId` and call `dsh_team_send`:

```json
{
  "teamId": "<teamId-from-create>",
  "inputId": "quickstart-followup-001",
  "mode": "queue",
  "text": "Change the completed synthetic task direction. Keep this same Team. Reply exactly QUICKSTART_REVISED. Do not call tools or spawn members."
}
```

Read `dsh_team_result` again and verify that this specific input is processed and the output changed. Use a new `inputId` for each new follow-up. `queue` supplies a subsequent turn; `steer` admits input for a running turn at native processing boundaries, rather than rewriting an already completed turn.

Reuse a create key or input ID only for the exact same content after an uncertain transport outcome. Inspect `dsh_team_status` before retrying. After a crash/interruption, continue explicitly with `continue: true`; if a cold create retry returns `requiresContinuation`, retain its returned Team/input IDs and original text. Do not silently create a replacement Team. `dsh_team_stop` cancels native work but does not undo file changes. Unknown usage/fees remain unknown; inputs are text-only.

## 7. Find the conversation and optionally configure roles

In the **same native Web host**, expand the Session sidebar's **Ungrouped** section (or the workspace group supplied through `workspaceId`) and open the Session whose first message begins `Synthetic smoke test`. The native transcript shows the initial task and follow-up. When a task creates members, use the **Agent Team** control in its header to inspect the roster/tasks and open member Sessions, their messages and tool cards. Approvals stay in native Web; this client cannot approve them. No separate dashboard or log import is needed.

For a first task, leave **Settings → Team roles** empty and omit `leadRole`: the Lead uses the native main Agent model selection, and native teammates inherit its provider/model and applicable reasoning options.

To use explicit roles, add descriptions, instructions, existing provider/model IDs and supported reasoning effort in **account menu → Settings → Team roles**, choose a default Lead role, and save. Read `health` before choosing an explicit `leadRole`; unknown roles fail without fallback. Descriptions help the Lead choose `spawn_role_teammate` roles, and several member instances can use one role. Changed configuration applies to new Leads/members; existing managed bindings and member identity persist across follow-up and recovery.

**Ordinary Sessions/Teams created directly in Web are not automatically role-managed.** Create through the Codex/MCP client to reserve the configured Lead role. Those IPC-created Sessions use the same native service and remain visible in Web. Existing unmanaged Teams stay unmanaged if roles are added later.

## Troubleshooting

| Symptom | Check/action |
| --- | --- |
| `EADDRINUSE` on port 3080 | Identify the listener, for example `lsof -nP -iTCP:3080 -sTCP:LISTEN` on macOS. If it is the intended compatible host with the plugin loaded, connect to it. Coordinate any restart with active work; do not kill an unknown process. Changing the HTTP port alone does not isolate the store or IPC socket. |
| MCP tools are absent | Check `codex plugin list --marketplace oh-my-codex --json`, installation/enabled state, and start a new session. Use `/plugins` to inspect the configured source. |
| Web works, but IPC/health is missing | Inspect native plugin activation diagnostics and the profile's ordered bundles. Both the official Team bundle and `dsh-team-roles` must activate in that same host. The client does not start them. |
| `ENOENT`, `ECONNREFUSED`, or a socket-path mismatch | The default is `path.join(os.tmpdir(), 'dsh-agent-team-<uid>', 'native.sock')`. Compare the host's actual `socketPath`, OS user and temporary-directory environment with the MCP process. On macOS, do not assume `/tmp`. For a custom/legacy socket, ensure the MCP server receives `DSH_AGENT_TEAM_SOCKET` with that exact private socket path; direct CLI diagnostics can receive the same variable. Do not probe another host or loosen permissions. |
| `DSH_NATIVE_PEERS_UNAVAILABLE` or `DSH_RUNTIME_INCOMPATIBLE` | Check the exact npm runtime version, adapted host build and native Team bundle resolution. The published host 0.3.0 is not the alpha.2 adaptation. Do not fall back to rc.3/rc.4, create manual dependency links or mix native service instances. |
| Provider/model is unavailable, or sign-in is required | Check the exact native registration, model ID and supported effort in Web. Launch from the shell that initializes existing provider variables, or use native sign-in/settings. Do not put keys in roles or change provider/model to conceal a failure. |
| Workspace rejected | `cwd` must be inside the host's configured `allowedRoots`; the fresh default is its launch directory. Use that workspace or deliberately configure the host's intended roots. |
| Unknown role | Omit `leadRole` for an empty catalog; with configured roles, choose an advertised name. Changing roles does not rebind an existing Team. |
| Accepted input, stale output, or pending approval | Read the input's processed/outcome fields, native runtime state, activity and errors. Handle approvals in Web. A prior output alone does not prove the latest input completed; a cold/interrupted turn needs explicit continuation. |
