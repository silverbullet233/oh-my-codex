# dsh-agent-team

An explicit Codex MCP client and role plugin for the **same native DSH Session service used by DSH Web**. Native Agent Teams owns members, tasks, CAS, messages, activation, tools and approvals. This project adds configurable roles and durable input correlations, with no separate scheduler or dashboard.

The required runtime is official DSH commit `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`, built with its matching native Web frontend. The released `dsh-v0.2.1-rc.3` commit `1f81c047fc48fa190a683e469daa699857e9afe8` lacks the required `agent.model.select/current` APIs despite sharing version text. No legacy adapter is included.

## Shared native host

```text
Codex explicit MCP client -> stdio -> private Unix IPC --+
Direct CLI client -------------------------------------+
                                                       |
Native DSH Web <-> Connection/Gateway/SessionController <-+
                                  |
                    native Agent Team + role profiles
                                  |
                        one Session store/runtime
```

The installable bundle's `cordis.patch.yml` loads `dsh-agent-team/host` into the existing native Web profile. That export composes roles and the bridge beside the official Agent Teams profile bundle, retaining native Team and member views. Startup verifies the sealed complete source build, actual public imports and serving service identities before opening IPC. See [runtime verification](docs/runtime.md).

The bridge uses a supported in-process owner Peer with `interactions: none`. It cannot answer approvals and exposes no owner network endpoint. Native Host, Origin, Cookie, workspace and approval policies remain effective. The socket directory belongs to the current OS UID with mode `0700`; the socket is `0600`. Closing a client leaves native execution running.

Each role specifies `description`, `instructions`, an existing registered `provider`, `model` and optional `reasoningEffort`; multiple named members may share a role. Immutable snapshots are durable before provisioning. The awaited creation hook installs instructions and selects the route before first input. Configuration changes affect new members; follow-up and recovery retain member identity. `spawn_role_teammate` selects an allowlisted role. Native guards refuse original, aliased and unreserved delegation for managed members, while ordinary unmanaged Web Teams remain available. See [role policy](src/roles/README.md).

## Install and use

Connect this checkout to the already built source installation and verify it:

```sh
node scripts/runtime/connect.mjs /Users/mxr/github/deepseek/deepseek-harness
node scripts/runtime/verify.mjs
```

The connector changes only plugin-local dependency links; it neither installs nor builds DSH. The complete source manifest pins the host, dependencies, generated reflection and frontend together.

The native Web profile must include `@deepseek-ai/dsh-experimental-agent-team-profile`. `node scripts/install-native.mjs` prepares nonsecret configuration at `~/.dsh/dsh-agent-team.json` and guarded profile backups. A fresh default configuration loads roles and the bridge without temporary validation-fixture dependencies; an optional first argument naming a validation `run.json` explicitly enables that fixture. Existing configuration is preserved.

Host fields are `stateDirectory`, `socketPath`, `allowedRoots`, `leadRole` and `roles`. Paths identify private state/IPC directories and authorized workspaces. Providers refer to existing native registrations; role configuration contains no credentials or endpoint overrides. `examples/roles.json` is overlay-generator input: omit its `nativeTeam` option from the installable host configuration.

Install through DSH's profile package manager, then launch the ordinary native Web profile when a host start is intended:

```sh
/Users/mxr/.local/bin/dsh plugin --profile web add link:/Users/mxr/github/silverbullet233/oh-my-codex --ignore-scripts
/Users/mxr/.local/bin/dsh web --no-open
```

This checkout is currently installed as a linked package in the user's Web profile. Use one host per writable native data directory; clients attach to its socket. Supported native authentication remains required. The optional [read-only credential provider](docs/auth.md) cannot create, migrate or refresh credentials.

`node scripts/start-native.mjs --shell-env` starts that same ordinary Web command through `zsh -ic`, inheriting the user's normal shell environment, including existing native provider references. It does not copy or migrate credentials, and suppresses raw shell/host output. Apply host lifecycle changes only when intended; starting another process against an active data directory is not a client connection.

Installation rollback metadata and guarded nonsecret profile backups are under `~/.dsh/dsh-agent-team/install-backup-<timestamp>/`. Reconciliation backups are `~/.dsh/dsh-agent-team/profile-before-reconcile-<timestamp>.yml`. The official removal command is `/Users/mxr/.local/bin/dsh plugin --profile web remove dsh-agent-team`; use the native service workflow when applying a rollback. Neither installation nor rollback changes saved Codex configuration or backs up credentials.

Both clients expose six operations:

| CLI method | MCP tool | Purpose |
| --- | --- | --- |
| `health` | `dsh_team_health` | Runtime evidence and role catalog |
| `create` | `dsh_team_create` | Native Session creation and initial text admission |
| `send` | `dsh_team_send` | Queue or steer with a durable input ID |
| `status` | `dsh_team_status` | Native task/runtime state, members, routes and activity |
| `result` | `dsh_team_result` | Output and processed-input evidence |
| `stop` | `dsh_team_stop` | Native cancellation, retaining file changes |

```sh
node scripts/client.mjs health
node scripts/client.mjs create '{"key":"task-1","cwd":"/absolute/authorized/workspace","text":"Describe the requested task."}'
node scripts/client.mjs status '{"teamId":"returned-session-id"}'
```

Set `DSH_AGENT_TEAM_SOCKET` for a nondefault socket; the default is `/tmp/dsh-agent-team-<uid>/native.sock`. The stdio MCP command is `node /absolute/plugin/path/src/mcp/main.mjs`. `mcp.json` describes explicit use and changes no Codex configuration, entrypoint, subscription or model defaults.

Create keys and input IDs reject different content. Acceptance is distinct from processing. After an uncertain response, retain the original key/ID and inspect status. A cold initial-create retry returns reserved IDs and `requiresContinuation: true`, with `accepted: false` when no receipt exists or `null` when admission is unconfirmed. Continue explicitly using the returned input ID and `continue: true`.

`rootTurnCompleted` describes the Lead; `completed` describes the observed Team. Native inactive children can be confirmed complete through durable projections without activation. Missing evidence remains unknown; an open or interrupted child turn cannot reuse an earlier completed outcome. Configured, selected and last-request routes are separate. Unloaded selection and unknown usage/fees are `null`.

## Validation and limits

Run `npm run test:unit`, `npm run test:native` and `npm run test:runtime`; Unix IPC tests require local socket permission. `npm run build` packages this ESM plugin, and `npm run pack:check` inspects it. The actual native suite has passed 17 shared-host scenarios plus one validation-scope regression; runtime checks have passed 5 tests. [Validation evidence](docs/validation.md) separates these results from live inference and rendered checks.

The final aggregate passed 84/84 tests, including configuration-backup and exact-request privacy regressions. Build/package checks passed. Real Codex subscription `gpt-6.1-sol` / `high` completed a two-call MCP create/result handoff through the installed user's host. A live native Team completed with `opencode-go/deepseek-v4.1-flash/max` and `deepseek-account/deepseek-flash/max`: its members read/wrote synthetic fixtures, messaged the Lead and returned `left=5`, `right=11`, with exact routes recorded in native headers and audits. No fallback was used.

Another outer Codex invocation sent a follow-up to that same dual-provider Team, reused the existing `calc-left` member and received exact output `REUSE_fa56b94b8b` through one send and three result calls. Native Chrome accessibility and screenshots show the real three-member Team and actual member tool/message traces. See [validation evidence and live screenshots](docs/validation.md).

Inputs are initially text-only. Image, audio, video and attachment propagation are unsupported. Live tests used fresh synthetic fixtures, complete payload auditing and two narrow fixture tools, without repository/personal files, inherited conversations or general shell/network tools. Live inference permission has been removed after validation. Cold member recovery and changed-role recovery are proven by keyless tests, not live inference. Costs remain unknown.
