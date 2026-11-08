# Runtime budgets and Codex session lifetime

Audit date: 2026-11-08. Baseline: catalog main commit `803a97816d826ed1332b4f45d2e940eeb775b714` (PR #28). This change is the unpublished plugin 0.4.3 candidate in catalog 0.3.1. It adds no session-exit mechanism.

## Runtime budget removal

The baseline MCP entrypoint read `DSH_AGENT_TEAM_MCP_CALL_LIMIT`, validated a positive integer up to 100 and incremented a cumulative counter before every dispatched client request. Once exhausted, it rejected subsequent operations, including reads and stop. It was optional (absent meant unlimited), but was a real call-count execution control when configured. The entrypoint now passes the request client directly to the dispatcher. The retired environment variable is ignored, including stale invalid values.

No other cumulative cost, inference-request, turn, round or work-duration budget was found in the installed plugin source/configuration/skill. The 16384-byte summary presentation limit, input/page sizes, bounded observation/transport/startup waits and pending-interaction capacity/expiry protect individual protocol operations. They do not stop a Team when a runtime allowance is consumed and remain intact. Exact-request authorization is a method/argument/Team scope boundary, not a cumulative budget, and remains intact. Model configuration, historical acceptance reports and test-only synthetic adapter limits are outside this runtime change.

## Exit behavior and evidence

There is no Codex-session-ended notification or automatic Team stop/pause call in this client. Native DSH owns the Team; the MCP process owns a disposable API Peer. Already admitted work is independent of that Peer. This is not a guarantee that every native task will finish: pending questions/approvals, native cancellation, provider/tool failure and host/process termination can still prevent progress. Local delivery tokens are invalidated on disconnect; refresh pending state after reconnect rather than replaying an answer.

| Event | Code path | Evidence and limit |
| --- | --- | --- |
| stdio EOF | `src/mcp/main.mjs`: stdin `end` waits for pending/in-flight calls, then `OwnedHost.close()` | The subprocess tests confirm the MCP exits, a new peer sees the same host PID, and an active synthetic Team stays running/incomplete until explicit stop. EOF can wait for in-flight calls; it is not an immediate stop. |
| MCP Gateway/WebSocket disconnect or explicit client close | `src/native/gateway.mjs`: socket close invalidates the connection/interactions; `disconnect()` disposes its context. `src/host/manager.mjs`: `close()` closes only the Gateway | The lifecycle regression disconnects a live socket and closes the client, reconnects, and observes the same PID and running synthetic Team. No Team stop/pause is submitted by these paths. Foreground question delivery may be cancelled or require redelivery; this test has no pending question. |
| SIGINT / SIGTERM sent only to the MCP PID | No signal handler in `src/mcp/main.mjs`; the ready host has a detached supervisor (`src/host/manager.mjs`, `ensure`) | Subprocess tests observe each signal as the MCP exit cause, then the same host PID and active synthetic state. Signals to a process group, supervisor or host are different cases. |
| Abrupt MCP-only SIGKILL | Same independent ready-host process boundary | Tested as abrupt MCP death: the same host and synthetic active state survive. This is not an actual Codex app crash test. |
| User exits a real Codex session, e.g. `/quit` or closing the application | The plugin has no semantic session-exit hook; actual effects depend on what that Codex version does to its MCP/descendant processes | Not executed in this validation. If the client is closed through EOF, Gateway disconnect or MCP-only termination after host readiness, the tested paths above do not notify/stop/pause the Team. Do not treat that conditional conclusion as a recording of real Codex UI exit. |
| Codex app crash / OS process-tree cleanup | Depends on which processes the OS/client actually terminates | Not executed. MCP-only death is covered; killing the detached host/supervisor, logout or machine shutdown is not. A dead host cannot continue native execution; persistence does not imply automatic resume. |

The startup boundary also matters: `src/host/runner.mjs` handles parent IPC disconnect before its start message by cleaning provisional state and exiting. After startup it disconnects IPC deliberately; the supervisor retains the native child. SIGTERM sent to the supervisor forwards SIGTERM to its child. These startup/supervisor paths must not be confused with closing a ready MCP Peer.

Explicit controls remain separate: `dsh_team_stop` requests Team interruption; `dsh_team_shutdown` first obtains the native safe-to-stop lease and refuses active/unknown work before signaling the attributed host. The tests verify active-work shutdown refusal and explicitly stop their own synthetic Team during cleanup. No shutdown is automatically attached to session exit.

## Reproducing the checks

From the repository root, after installing locked dependencies:

```sh
node --test plugins/dsh-agent-team/test/mcp/stdio.test.mjs plugins/dsh-agent-team/test/client/lifecycle.test.mjs
npm test
npm run build
npm run pack:check
```

The new tests are `retired MCP call-limit settings cannot block work, reads or stop`, `EOF and MCP-only signals preserve an active synthetic Team on the same host` and `active synthetic work survives Gateway disconnect and explicit client close`. They run real MCP subprocesses, the detached supervisor and the official Connection/Gateway transport against `test/fixtures/owned-cli.mjs`. That CLI fabricates Team receipts and an active flag: this verifies client/process behavior, **not real Agent/Team execution, live model continuation, billing, a Codex UI exit or an application crash**. Fixtures use private temporary homes and no provider account. Full lifecycle tests need loopback listeners and process-identity access, as documented in CONTRIBUTING.md. Source, tests and this report are versioned together so commit permalinks provide stable line references.

Local validation on macOS / Node 26.0.0 passed 255 full-suite executions (19 catalog/release + 236 plugin, including signal subtests), 123 isolated executions, build, package inspection and offline release-asset preparation. Release preparation writes local files only; no tag, GitHub Release or npm publication was performed. The optional `npm run test:install` reached Codex CLI 0.164.0 installation and MCP discovery but failed at `scripts/test-codex-install.mjs:81`: that baseline script expects 17 tools while the baseline and current plugin expose 18. That pre-existing unrelated assertion is unchanged; the source/built/tarball distribution tests in the full suite pass with 18 tools. This optional install result is a failure, not an installation acceptance claim. No global installation was changed.
