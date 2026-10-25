# Validation checkpoint

This checkpoint is not a completed end-to-end integration. Runtime work is paused by the parent task while a separate task prepares a complete native source installation.

## Executed

- `node --test test/auth/*.test.mjs test/bridge/*.test.mjs test/mcp/*.test.mjs test/roles/*.test.mjs test/native/synthetic-fixtures.test.mjs`: 47 passed, 0 failed, 0 skipped. Private Unix socket cases ran with narrow host permission after sandbox `listen` returned `EPERM`.
- `node scripts/check.mjs`: ESM syntax and portable plugin metadata passed.
- `git diff --check`: passed.
- `npm --cache /tmp/dsh-agent-team-npm-cache pack --dry-run --ignore-scripts`: package contents inspected. The ordinary user npm cache was unwritable; no global ownership change was made.
- Public pinned-source ESM import smokes: native Agent, Agent Loop Testkit, SessionController, gateway, Team service and Team tools imported from the experimental fresh source transpilation. This is neither a complete official build nor a typecheck.
- Read-only existing native credential presence: browser signing record and DeepSeek API key were configured. Values were not output or copied; the current DeepSeek account and OpenCode model catalogs have not yet been reverified.

The unit suite uses synthetic data. Its auth cases instantiate the native credential parser and carrier-neutral Connection service with deterministic synthetic records; no browser server listens. Its admission and native-port cases use test doubles, and its stdio lifecycle case exercises the actual MCP child process and private IPC with a test dispatcher. These cases do not establish native Team execution, native approval behavior or live model routing.

Independent review found and prompted fixes for active-turn continuation, native read-only credential no-op checks, role selection after a binding-before-selection crash, whole-Team completion distinct from Lead completion, asynchronous role unload cleanup and initial-create crash identity recovery. An unconfirmed prior admission now reports `accepted: null`. Deferred actual-runtime tests must validate those behaviors through the real final host.

## Pending

- Final complete pinned DSH build, generated current Typert descriptors, matching frontend and verified import resolution. Experimental emitted files remain unsealed, and the mandatory startup verifier refuses them.
- `npm run test:native`: authored actual SessionController/Gateway/Team tests. The last attempt failed at the missing current `session-controller/lib/typert.host.js` artifact and cleaned up its Context. It has not passed; no old generated artifact was substituted.
- Official DSH artifact/check builds and reproducible plugin load profile against the source-install task's output.
- Bounded real Codex subscription `gpt-6.1-sol` / `high` through MCP.
- One live native Team with exact `opencode-go/deepseek-v4.1-flash` and `deepseek-account/deepseek-flash` routes, using `max` only after current catalog verification. No fallback route has been used.
- Native Web rendered Team/member/task/tool/approval checks through supported browser authentication, including screenshots. No alternate dashboard exists.

Live validation remains restricted to fresh synthetic fixtures, audited complete model-visible requests, and two narrow fixture file tools. No repository/personal files, inherited conversations or general shell/network tools may be exposed to test agents. Unknown usage and fees remain unknown.

## Process state

The single dependency-install session `81783` was interrupted intentionally and exited `130`. Other source-transpilation commands had already exited. No worker-owned DSH host, daemon, test runner, model request or writer remains active. No plugin was installed, global DSH replaced, user service restarted, Codex configuration changed or persistent credential created by this task. The remaining gate is pending verified runtime handoff, not an approval denial.
