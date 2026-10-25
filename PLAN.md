# dsh-agent-team implementation plan

1. Verify the clean branch, pinned DSH source and available dependencies. Record a reproducible isolated runtime and matching native Web build.
2. Implement a role plugin in the native host: immutable member bindings, awaited pre-input routing and instructions, recovery, and request-route evidence.
3. Implement a durable native Session bridge and local UID-restricted IPC. Provide explicit stdio MCP health/create/send/status/result/stop tools without owning the host lifecycle.
4. Exercise keyless tests against the pinned native runtime, including Team projection visibility, lifecycle, recovery, idempotency, cancellation and approval refusal. Review independently and commit tested increments.
5. Run bounded synthetic-only live provider and Codex MCP checks, then inspect the rendered native Team page if authorized native browser authentication and matching assets are available. Report gates honestly.

## Invariants

- One native DSH host, SessionController and store serve both Web and Codex. No independent scheduler or dashboard.
- The reference checkout is read-only. Never recover the discarded implementation. No main/master development, push, global DSH restart, Codex configuration changes, unapproved installs or new credentials.
- Role configuration contains existing provider references, never credentials. Changed configuration affects new members only.
- Cross-provider inference uses fresh synthetic fixtures, two narrow fixture tools, audited complete payloads, no repository or personal data, and no general shell/network tools.
- All repository content is English. Progress reports are Chinese.

## Initial evidence

- Branch: `dsh-agent-team`; clean at `77ffbdcd3f473c0c834c9276f9559795588e5c63`.
- DSH reference: `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`.
- Global Homebrew packages verified: TypeScript `6.0.3`, `@earendil-works/pi-ai` `1.3.0`.

## Current checkpoint

The user requested a separate source-install task in `deepseek-harness` before continuing this plugin. All runtime provisioning, dependency installation, native host launch and live testing in this task are paused pending its verified handoff. The sole npm installation was interrupted with confirmed exit code 130. No native host, model request, test daemon or worker-owned subprocess remains active.

The role layer now uses supported native tool guards and an enhanced `spawn_role_teammate`; no native source patch is retained. Independent review identified and prompted fixes for active-turn continuation detection, read-only native credential no-op inspection, the first-role-selection crash window and whole-Team completion reporting. Pure/unit validation is separate from authored but incomplete native, live and rendered checks.
