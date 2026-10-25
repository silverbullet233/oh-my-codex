# dsh-agent-team — Codex client

An independent, explicit **Codex MCP/CLI client** for the native `dsh-team-roles` host. Native role policy, immutable member bindings, Session/Team integration, IPC server and Web settings live in the separate **dsh-team-roles** repository. This repository retains only the Codex manifest, opt-in skill, thin client and client tests. It has no DSH runtime dependency, server implementation, cross-repository source import or separate dashboard.

## Native host requirement

Install and run `dsh-team-roles` in the existing native DSH Web profile first. It requires the complete official source build at **`22ddee3792402c3e70ec5f86a63c3e3e895a2f60`** with matching Web assets, native `agent.model.select/current` and durable model selection. The released `dsh-v0.2.1-rc.3` / `1f81c047fc48fa190a683e469daa699857e9afe8` lacks those APIs despite sharing version text. No legacy adapter or semver-only compatibility claim is made.

The client requires private IPC **`dsh-team-roles` protocol 1**, checks each response version and handshakes native Session, immutable role, settings, text and idempotency capabilities before submitting work. An incompatible host fails explicitly, with no fallback. Normal socket: `/tmp/dsh-agent-team-<uid>/native.sock`; override with `DSH_AGENT_TEAM_SOCKET`.

Edit roles in authenticated **native DSH Web → account menu → Settings → Team roles**. Changes affect new Leads/new members. Existing bindings, same-member follow-up and recovery preserve their snapshots. Role catalog and routes come from the host, not Codex settings.

## Use

```sh
node scripts/client.mjs health
node scripts/client.mjs status '{"teamId":"existing-native-session-id"}'
node scripts/client.mjs create '{"key":"task-1","cwd":"/absolute/authorized/workspace","text":"An explicitly authorized task."}'
```

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

The pre-split native host/client checkpoint is **`71e9f7a`**, preceded by `95ac02d`, on branch `dsh-agent-team`. Git preserves removed files. Rollback must restore matching native bundle, nonsecret profile metadata and client protocol together; do not overwrite account or native Session stores. Host installation/config/state backups remain under `~/.dsh/dsh-agent-team/`.
