# Client validation

## Local keyless checks

Run from the collection root:

```sh
npm test
npm run build
npm run pack:check
```

The baseline on 2026-10-28 passed **25 tests**: three repository checks and 22 plugin tests. They exercise IPC protocol/capability negotiation before writes, exact request policies, private socket ownership, request limits, idempotency argument preservation, empty role catalogs, strict role errors, EOF/reconnection, marketplace paths and distribution startup. Source, built-folder and extracted-tarball clients initialize MCP and read synthetic fixture health without a DSH runtime or npm runtime dependencies.

These tests do not run native Sessions or models. The native plugin owns role bindings, native service identities, runtime compatibility and Web behavior. A passing client fixture is not evidence of a paid call, browser render or standalone native installation.

## Release-runtime migration status

The target is the exact npm runtime **`@deepseek-ai/dsh@0.2.2-alpha.2`** and the upstream plugin's **unreleased local 0.4.0 candidate** in [dsh-team-roles PR #4](https://github.com/silverbullet233/dsh-team-roles/pull/4). Upstream reported **88 locally passing tests** on that npm runtime: 52 unit, 25 native, five runtime and six release tests. Coverage includes keyless native Lead/role-member creation, message follow-up, same-member reuse, SessionController/Gateway/projections/bindings, persistence restore, empty-role inheritance, Settings saves and service identity. Its built tarball was also installed and loaded through the released CLI in a fresh relocated profile without development links. The reported standalone acceptance used seven synthetic requests. These are upstream local results; CI status and platform-specific fixes are tracked in that PR. Neither paid provider inference nor browser rendering was exercised by this migration.

The existing published `dsh-team-roles` **0.3.0** remains source-locked; these results do not make it compatible with alpha.2. The 0.4.0 version identifies a local candidate, not an existing public release or download URL. No global runtime/profile change, active Web restart, authentication change or paid inference is part of the local client cleanup.

The client already treats native runtime details as host-owned metadata. It requires `dsh-team-roles` IPC **1** and all five advertised capabilities, checks every response version, and retains private socket, exact invocation, size and identity checks. No DSH dependency, source SHA check, native import, source connector or release/source fallback is implemented in this client.

## Earlier validation

Earlier integration evidence targeted host 0.3.0 with the official source build at `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`. Split, socket/default-role and collection-layout checks are recorded in the [previous validation notes](https://github.com/silverbullet233/oh-my-codex/blob/6cef0698d18ada655f435539aa23a42f92fab3d0/plugins/dsh-agent-team/docs/validation.md). Those historical native/live results must not be presented as alpha.2 release-runtime results.

`scripts/live/codex-e2e.mjs` remains an opt-in historical runner for a separately prepared, explicitly authorized synthetic fixture, including its `dsh-team-synthetic` preset and named roles. It requires a fixture `run.json`, uses `codex` from PATH or `DSH_TEAM_CODEX_COMMAND`, and the normal socket override. It is not a normal installation step or empty-catalog smoke test. Do not run it without inference authorization and complete payload auditing. It was not run for this cleanup. Unknown usage and fees remain unknown.
