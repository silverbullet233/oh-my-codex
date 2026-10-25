# dsh-agent-team

An explicit Codex MCP client and role plugin for the **same native DSH Session service used by DSH Web**. Native Agent Teams owns members, tasks, CAS, messages, activation, tools and approvals. This project adds role profiles and durable client admission metadata. It does not own an execution scheduler or provide another dashboard.

**Development checkpoint:** the implementation is awaiting a verified complete DSH source installation from a separate task. Runtime provisioning and native/live/browser validation are paused. The current experimental source transpilation is deliberately unsealed; plugin startup fails closed. This is not a completed or installed integration.

The target is official DSH commit `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`. The installed `dsh-v0.2.1-rc.3` release commit `1f81c047fc48fa190a683e469daa699857e9afe8` lacks the new `agent.model.select/current` APIs. Its existing native Session/Web capabilities are not the gap. A complete matching source build supplies the required APIs; identical package version text does not establish source identity. No legacy adapter is included.

## Architecture

```text
Codex (explicit MCP tools) -> disposable stdio client -> private Unix socket
                                                        |
Native DSH Web <-> native Connection/Gateway/SessionController
                                      |                 |
                           native Agent Team + role plugin
                                      |
                        one native Session/store/runtime
```

The host loads the `dsh-agent-team/roles` and `dsh-agent-team/bridge` package exports alongside native Agent Team, its tool layer and its native Web UI. The bridge uses a public in-process owner Peer with `interactions: none`; it exposes no owner network endpoint and cannot answer approvals. Web retains native Host, Origin and Cookie authentication. The optional `dsh-agent-team/auth` export reads existing native credentials without changing them.

Each role configures `description`, `instructions`, an existing registered `provider`, `model` and optional `reasoningEffort`. Several named instances can share a role. The Lead profile is reserved before native Session creation; member snapshots are durable before native provisioning. The awaited creation hook installs scoped instructions and the initial model route before input. Existing members retain their snapshots after configuration changes. See [role policy](src/roles/README.md) and [existing authentication](docs/auth.md).

`spawn_role_teammate` selects an allowlisted role. The unchanged native tool layer retains collaboration tools. A native monotonic guard refuses its original `spawn_teammate` and general spawn/fork alternatives for bound members; the original tool remains visible because the public API cannot hide a scope-local registration. No native source patch is required.

## MCP interface

| Tool | Purpose |
| --- | --- |
| `dsh_team_health` | Verify shared host and inspect its role catalog |
| `dsh_team_create` | Submit text with a durable caller key and authorized `cwd` |
| `dsh_team_send` | Queue or steer the same Session with a durable input ID |
| `dsh_team_status` | Read native runtime/task state, members, routes and recent activity |
| `dsh_team_result` | Read native output and processed-input evidence |
| `dsh_team_stop` | Request native cancellation without rolling back files |

Create and send reject reuse of an idempotency key with different content. An accepted input may still be queued or executing. After an uncertain response, inspect status and retain the original key/ID. A cold create retry before initial admission returns `accepted: false`, the reserved IDs and `requiresContinuation: true`; an unconfirmed prior admission returns `accepted: null`. Inspect status and explicitly continue using the returned input ID. Cold or interrupted continuation requires `continue: true`. `rootTurnCompleted` describes the Lead's turn; `completed` describes the whole observed Team and is `null` when cold member activity is unknown. Configured, currently selected and last-request routes are separate fields; unloaded selection and unknown usage/fees are `null`.

The stdio command is `node /absolute/plugin/path/src/mcp/main.mjs`, with `DSH_AGENT_TEAM_SOCKET` set to the shared host's private socket. The host config requires private `stateDirectory` and `socketPath` paths and explicit `allowedRoots`. The socket parent must belong to the same OS UID with mode `0700`; the socket is `0600`. Closing an MCP client leaves the host and native execution running. `mcp.json` describes this explicit client; it does not change Codex configuration, entrypoint or model defaults.

## Validation and next steps

`npm run test:unit` runs protocol, private IPC, metadata, role-record, credential and synthetic-fixture checks. IPC tests require permission to bind a local Unix socket. `npm run test:native` is the separate actual-runtime suite; it is authored but has not passed against the final runtime. `npm run build` assembles the ESM plugin, not DSH itself. `npm run pack:check` inspects package contents. If the user npm cache is unwritable, run `npm --cache /tmp/dsh-agent-team-npm-cache pack --dry-run --ignore-scripts` without changing global cache ownership.

The next gate is a complete pinned native host and matching frontend, regenerated Typert metadata and source integrity checks. Then run native integration, bounded live Codex subscription `gpt-6.1-sol` with effort `high`, and one Team containing `opencode-go/deepseek-v4.1-flash` and `deepseek-account/deepseek-flash` at supported `max`. Live checks must use fresh audited synthetic fixtures with only two narrow fixture file tools. No final-code live result or rendered native Team screenshot exists yet. See [validation evidence](docs/validation.md), [runtime handoff](docs/runtime.md) and [plan](PLAN.md).

Inputs are text-only initially. Image, audio, video and attachment propagation are not supported promises. Native workspace and approval policies remain authoritative. This project has not installed a plugin, replaced global DSH, restarted a user service, changed Codex configuration or created persistent authentication credentials.
