# Get started with DSH Agent Team

**A running native `dsh web` host with `dsh-team-roles` loaded is required.** The Codex plugin is a client: Codex → stdio MCP → private local IPC → the same native DSH Session/Team service that Web uses. It does not start DSH, create another scheduler or replace the native UI. Keep that host running while Codex submits and continues work.

## 1. Check the prerequisites

- Node.js **>=24.9.0**, a compatible local Codex client, and DSH running as the same OS user. UID-owned Unix sockets are required; macOS is validated, Windows is not established.
- The complete official DSH source build at **`22ddee3792402c3e70ec5f86a63c3e3e895a2f60`**, including matching Web artifacts, native `agent.model.select/current` and durable selection. Follow the [official source-run instructions at that commit](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/apps/cli/README.md#development). The released `dsh-v0.2.1-rc.3` tag at `1f81c047fc48fa190a683e469daa699857e9afe8` lacks these APIs despite the same version string. Other source commits and newer releases need separate compatibility verification.
- Existing native provider registrations and authentication for the model you intend to use. Select a working native main Agent model in Web before the first task.

Use `command -v dsh` to check which launcher your terminal resolves. A matching `dsh --version` alone does not establish API or build compatibility. Native host version **0.3.0**, Codex client **0.2.0**, and IPC protocol **1** are separate versions.

## 2. Install the DSH plugin and enable native Teams

Perform profile installation/edits while the host is stopped, or coordinate native reload with its active work. Do not start a second writer against the same Session store or IPC socket.

Install the built GitHub Release asset through the compatible DSH launcher:

```sh
dsh plugin --profile web add \
  'https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.3.0/dsh-team-roles-0.3.0.tgz' \
  --ignore-scripts
```

This initializes the Web profile if needed and adds the role bundle. It is a [GitHub Release](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.3.0), not an npm publication or a source archive. No development-directory links or second registry DSH runtime are required.

Enable the official **`@deepseek-ai/dsh-experimental-agent-team-profile`** bundle in the Web profile's `package.json`: `$DSH_HOME/profiles/web/package.json`, or `~/.dsh/profiles/web/package.json` when `DSH_HOME` is unset. Preserve its dependencies and any other bundles. Add the Team bundle after base and before `dsh-team-roles`; the relevant portion is:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@deepseek-ai/dsh-experimental-agent-team-profile",
        "dsh-team-roles"
      ]
    }
  }
}
```

The compatible complete source runtime supplies the official Team bundle through DSH's profile resolver. That bundle enables `agent-team`, `tool-agent-team` and `ui-agent-team`; the default Web profile alone does not enable them. Do not replace the whole profile manifest with the fragment above. See the [native runtime requirements](https://github.com/silverbullet233/dsh-team-roles/blob/v0.3.0/docs/runtime.md).

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
ready, its source SHA, protocol/capabilities and available roles. Do not create
a task or start another host.
```

Expect `ok: true`, protocol name `dsh-team-roles`, version `1`, and capabilities `native-session`, `durable-role-snapshots`, `native-role-settings`, `text-input`, `idempotent-admission`. An empty role catalog is valid. The client refuses incompatible capabilities before submitting work.

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
| `DSH_NATIVE_PEERS_UNAVAILABLE` or `DSH_RUNTIME_INCOMPATIBLE` | Use the complete compatible source-built launcher and matching Web artifacts/profile resolver. Do not rely on rc.3 version text, install a second native runtime, or substitute old frontend assets. |
| Provider/model is unavailable, or sign-in is required | Check the exact native registration, model ID and supported effort in Web. Launch from the shell that initializes existing provider variables, or use native sign-in/settings. Do not put keys in roles or change provider/model to conceal a failure. |
| Workspace rejected | `cwd` must be inside the host's configured `allowedRoots`; the fresh default is its launch directory. Use that workspace or deliberately configure the host's intended roots. |
| Unknown role | Omit `leadRole` for an empty catalog; with configured roles, choose an advertised name. Changing roles does not rebind an existing Team. |
| Accepted input, stale output, or pending approval | Read the input's processed/outcome fields, native runtime state, activity and errors. Handle approvals in Web. A prior output alone does not prove the latest input completed; a cold/interrupted turn needs explicit continuation. |
