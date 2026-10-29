# dsh-agent-team — Codex client

An independent, explicit **Codex MCP/CLI client** extending the standalone native `dsh-team-roles` DSH plugin. Native role policy, immutable member bindings, Session/Team integration, IPC server and Web settings live in that separate repository. This package retains only the Codex manifest, opt-in skill, thin client and client tests. It has no DSH runtime dependency, server implementation, cross-repository source import or separate dashboard. Codex-specific setup and capability negotiation belong here, not in the upstream DSH plugin's requirements.

This self-contained plugin lives at `plugins/dsh-agent-team/` in the [Oh My Codex collection](https://github.com/silverbullet233/oh-my-codex). Run the commands below from this plugin directory, or from the root of its extracted package. The repository marketplace points here; it does not install the collection root as a plugin.

Start with the [getting-started guide](docs/getting-started.md) for native Web setup, Codex installation, a first task and follow-ups on the same Lead.

## Native host requirement

Use **`@deepseek-ai/dsh@0.2.2-alpha.2`** and the **unreleased local `dsh-team-roles` 0.4.0 candidate** in the native Web profile. Upstream's 88 local keyless tests and standalone tarball installation/loading checks passed on that npm runtime. The adaptation and its CI status are tracked in [dsh-team-roles PR #4](https://github.com/silverbullet233/dsh-team-roles/pull/4). The [published host 0.3.0](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.3.0) is source-locked and must not be installed as the alpha.2-compatible host.

Enable the matching official Team profile if needed, then install the locally built tarball until upstream publishes a compatible version:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-experimental-agent-team-profile@0.2.2-alpha.2 --ignore-scripts
dsh plugin --profile web add /absolute/path/to/dsh-team-roles-0.4.0.tgz --ignore-scripts
```

The path is a local artifact placeholder, not a published URL. See the [guide](docs/getting-started.md) for the exact npm runtime installation command. No DSH source clone/build, manual dependency links or runtime connector are client setup steps. The native plugin owns runtime/API/service-identity validation; this client checks its IPC protocol and capabilities. Older rc.3/rc.4 runtimes lack required APIs. This client remains **0.2.0** with IPC protocol **1**; host and client package versions do not need to match.

The client requires private IPC **`dsh-team-roles` protocol 1**, checks each response version and handshakes native Session, immutable role, settings, text and idempotency capabilities before submitting work. An incompatible host fails explicitly, with no fallback. Its default matches a fresh host: `path.join(os.tmpdir(), 'dsh-agent-team-<uid>', 'native.sock')`. On macOS, the OS temporary directory may be under `/var/folders`, rather than `/tmp`. Set `DSH_AGENT_TEAM_SOCKET` to the exact existing socket for a custom or legacy deployment, including one that retained `/tmp/dsh-agent-team-<uid>/native.sock`. The client does not probe alternate hosts or read native configuration to guess a location.

For the released runtime, health reports `sourceSha: null` and identifies the DSH version in `runtime.packageVersion` (`0.2.2-alpha.2`). A null source SHA is expected; native runtime validation belongs to the host, while this client checks IPC compatibility and preserves the reported metadata.

Roles are optional. With an empty catalog, omit `leadRole`: the Lead uses the native main Agent selection, and native teammates inherit its provider/model and applicable reasoning options. Do not invent a role or force a provider/model. When explicit roles are configured, an omitted `leadRole` uses the host's configured default; an explicit name must be allowlisted, and an invalid role remains an error without native-default fallback.

Edit roles in authenticated **native DSH Web → account menu → Settings → Team roles**. Changes affect new Leads/new members. Existing managed bindings, same-member follow-up and recovery preserve their snapshots; existing unmanaged Teams stay unmanaged when roles are added. Role catalog and routes come from the host, not Codex settings.

## Use

```sh
node scripts/client.mjs health
node scripts/client.mjs status '{"teamId":"existing-native-session-id"}'
node scripts/client.mjs create '{"key":"task-1","cwd":"/absolute/authorized/workspace","text":"An explicitly authorized task."}'
```

The create example deliberately omits `leadRole` and works with the host's empty native-default catalog or its configured default Lead. To select an explicit role, first inspect `health`, then add `"leadRole":"<an-advertised-role>"` to a new create request. Preserve an existing create key's exact content.

The MCP command is `node /absolute/plugin-root/src/mcp/main.mjs` using the default UID socket or `DSH_AGENT_TEAM_SOCKET` for a custom existing host socket. From the repository root, use `node plugins/dsh-agent-team/src/mcp/main.mjs`. `mcp.json` resolves `${PLUGIN_ROOT}` to this plugin directory in a checkout, built folder or extracted package. Explicit invocation changes no Codex model, subscription or ordinary entrypoint.

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

## Development and upgrades

```sh
npm run test:unit
npm run build
npm pack --dry-run --ignore-scripts
```

These checks need no DSH installation or npm runtime dependencies. Local IPC tests need Unix socket permission. Host tests belong to `dsh-team-roles`. See [validation evidence](docs/validation.md).

Coordinate host upgrades with its native lifecycle and preserve configuration, role bindings and Session data. Runtime installation and compatibility checks belong to the standalone native plugin. The [validation notes](docs/validation.md) distinguish client fixtures, upstream native checks and the opt-in historical live runner.
