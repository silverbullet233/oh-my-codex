# dsh-agent-team — Codex client

An independent, explicit **Codex MCP/CLI client** for the native `dsh-team-roles` host. Native role policy, immutable member bindings, Session/Team integration, IPC server and Web settings live in the separate **dsh-team-roles** repository. This repository retains only the Codex manifest, opt-in skill, thin client and client tests. It has no DSH runtime dependency, server implementation, cross-repository source import or separate dashboard.

## Native host requirement

Install and run the separately versioned [dsh-team-roles 0.3.0 host](https://github.com/silverbullet233/dsh-team-roles/tree/058c7c491e87dfb21e7735deb19ec4dac266dc2d) in the existing native DSH Web profile first. Use its **built versioned tarball**, following its [installation and release instructions](https://github.com/silverbullet233/dsh-team-roles/blob/058c7c491e87dfb21e7735deb19ec4dac266dc2d/README.md#install-by-plugin-version):

```sh
dsh plugin --profile web add /absolute/path/dsh-team-roles-0.3.0.tgz --ignore-scripts
```

This does not assume an npm publication or GitHub Release exists. A Git source archive is not the built npm tarball. Installed host packages use DSH's official profile resolver; manual dependency links, workstation paths and a runtime connector are not client installation steps. Apply host installation changes through its coordinated native lifecycle.

The host still requires the complete official source build at **`22ddee3792402c3e70ec5f86a63c3e3e895a2f60`** with matching Web assets, native `agent.model.select/current` and durable model selection. The released `dsh-v0.2.1-rc.3` / `1f81c047fc48fa190a683e469daa699857e9afe8` lacks those APIs despite sharing version text. No legacy adapter or semver-only compatibility claim is made. Host package version **0.3.0**, this client version **0.2.0**, and IPC protocol **1** are independent; the client negotiates capabilities rather than requiring equal package versions.

The client requires private IPC **`dsh-team-roles` protocol 1**, checks each response version and handshakes native Session, immutable role, settings, text and idempotency capabilities before submitting work. An incompatible host fails explicitly, with no fallback. Its default matches a fresh host: `path.join(os.tmpdir(), 'dsh-agent-team-<uid>', 'native.sock')`. On macOS, the OS temporary directory may be under `/var/folders`, rather than `/tmp`. Set `DSH_AGENT_TEAM_SOCKET` to the exact existing socket for a custom or legacy deployment, including one that retained `/tmp/dsh-agent-team-<uid>/native.sock`. The client does not probe alternate hosts or read native configuration to guess a location.

Roles are optional in host 0.3.0. With an empty catalog, omit `leadRole`: the Lead uses the native main Agent selection, and native teammates inherit its provider/model and applicable reasoning options. Do not invent a role or force a provider/model. When explicit roles are configured, an omitted `leadRole` uses the host's configured default; an explicit name must be allowlisted, and an invalid role remains an error without native-default fallback.

Edit roles in authenticated **native DSH Web → account menu → Settings → Team roles**. Changes affect new Leads/new members. Existing managed bindings, same-member follow-up and recovery preserve their snapshots; existing unmanaged Teams stay unmanaged when roles are added. Role catalog and routes come from the host, not Codex settings.

## Use

```sh
node scripts/client.mjs health
node scripts/client.mjs status '{"teamId":"existing-native-session-id"}'
node scripts/client.mjs create '{"key":"task-1","cwd":"/absolute/authorized/workspace","text":"An explicitly authorized task."}'
```

The create example deliberately omits `leadRole` and works with the host's empty native-default catalog or its configured default Lead. To select an explicit role, first inspect `health`, then add `"leadRole":"<an-advertised-role>"` to a new create request. Preserve an existing create key's exact content.

The MCP command is `node /absolute/path/to/oh-my-codex/src/mcp/main.mjs` using the default UID socket or `DSH_AGENT_TEAM_SOCKET` for a custom existing host socket. `mcp.json` provides the portable plugin command. Explicit invocation changes no Codex model, subscription or ordinary entrypoint.

| CLI | MCP tool | Behavior |
| --- | --- | --- |
| `health` | `dsh_team_health` | Exact host/runtime evidence and public role catalog |
| `create` | `dsh_team_create` | Idempotent native Session creation and initial text admission |
| `send` | `dsh_team_send` | Queue/steer with a durable input ID |
| `status` | `dsh_team_status` | Native state, members, routes and activity |
| `result` | `dsh_team_result` | Output and processed-input evidence |
| `stop` | `dsh_team_stop` | Native cancellation retaining file changes |

Keep original keys/input IDs after an uncertain transport outcome and inspect status before retrying. Acceptance differs from processing. A cold create retry can return `requiresContinuation: true`; continue explicitly using the returned input ID and `continue: true`. EOF disconnects only this client. Native work continues. The client cannot approve requests, edit credentials or start another host.

Configured, selected and last-request routes are distinct. Unloaded selection and unknown usage/fees remain null. Inputs are text-only. Outer Codex configuration stays user-owned; bounded synthetic validation uses subscription `gpt-6.1-sol` with `high` only when specifically authorized.

## Build and rollback

```sh
npm run test:unit
npm run build
npm pack --dry-run --ignore-scripts
```

These checks need no DSH installation or npm runtime dependencies. Local IPC tests need Unix socket permission. Host tests belong to `dsh-team-roles`. See [validation evidence](docs/validation.md).

`scripts/live/codex-e2e.mjs` is an opt-in historical acceptance runner for a separately prepared, explicitly authorized synthetic fixture, including its `dsh-team-synthetic` preset and named roles. It is not an empty-catalog installation smoke test. It requires an explicit fixture `run.json`, uses `codex` from PATH (or `DSH_TEAM_CODEX_COMMAND`) and the normal socket override. Do not run it without separate inference authorization and complete fixture payload auditing.

The pre-split native host/client checkpoint is **`71e9f7a`**, preceded by `95ac02d`, on branch `dsh-agent-team`. Git preserves removed files. Rollback must restore matching native bundle, nonsecret profile metadata and client protocol together; do not overwrite account or native Session stores. Host installation/config/state backups remain under `~/.dsh/dsh-agent-team/`.
