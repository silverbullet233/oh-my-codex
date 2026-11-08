# Full-access default validation — 2026-11-08

Current behavior: the companion starts native DSH directly with `danger-full-access`/`never` and network enabled intent, without automatic Codex metadata inheritance. Explicit profiles/attestation, admission guards, policy propagation and attributed lifecycle protection remain. Outer OS/process/admin restrictions remain effective. The former launcher/bootstrap/boundary-probe implementation has been removed from the client.

Use `npm run build`, `npm run test:isolated` and `npm run pack:check` for the restricted-environment gate, then normal full CI before merge. The isolated gate excludes listener/process-identity tests and is not a full-CI substitute. New full-access-default validation does not rerun paid provider inference or certify unrestricted OS/network access. See [current permissions](permissions.md).

## Current local result

On macOS / Node 26.0.0, this full-access iteration passed build/package checks, **243 full test executions** and **118 isolated executions**, with zero failures/cancellations/skips. The full suites used approved temporary listeners/process checks and no real provider credentials. The client gate also exercised the actual official DSH `0.2.2-alpha.3` CLI with the locally packed host candidate: **10 bounded synthetic requests**, two role members, first-work full-access/never checks, same-member follow-up, question delivery, still-required approval rejected by native never, disconnect, guarded shutdown and cold restart. No persistent credential file was created, and the temporary profile/processes were cleaned up. This is synthetic model integration, not real-provider or unrestricted-network acceptance. Final-head CI and Codex review remain separate required merge gates.

Everything below is **historical evidence for the implementations and heads recorded there**, including obsolete automatic inheritance/fallback behavior. It does not describe current defaults or certify the new implementation. Prior acceptance hashes/dates are retained.

## Historical validation through PR #26

Use Node 24.9.0, matching CI. Normal validation is keyless:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
npm run pack:check
npm run test:install
```

The catalog/release tests and client suites cover native API capability checks, exact arguments/policies, owner authority, request bounds, uncertain outcome handling, source/built/tarball entrypoints, MCP EOF, API reauthentication, free-port/concurrent startup, active-work shutdown refusal, persistent restart, failed startup cleanup and foreign-home attribution. The lifecycle unit fixture uses a fabricated CLI with **actual official Connection/Gateway** and synthetic receipts; it is not evidence of native Agent/Team execution. No model accounts are involved.

The separate cross-repository gate uses the **actual official DSH CLI**, ordinary Web/base and Team profile, the newly built host tarball, a read-only in-memory credential provider and a bounded synthetic LLM adapter:

```sh
node plugins/dsh-agent-team/scripts/test-native-e2e.mjs /absolute/official-dsh-package /absolute/dsh-team-roles-0.6.0.tgz
```

Run it in an isolated environment with PATH and locale only. It creates its own home/profile, installs the actual candidate and test-only native contribution, and checks real managed-Team creation, duplicate create, two native role members, same-member follow-up, result/completion, client disconnect, safe shutdown and cold persistent restart. It asserts that no persistent credential file was created. `--open --keep` is an explicit visual-validation option; the retained process/home must be cleaned up afterward. This gate is independent of ordinary CI's transport fixtures.

The host repository separately verifies role edits/cold recovery, running steer/stop, pending provisioning, admission/result evidence, lost replies, native Web creation and writer lifecycle. Browser claims require actual UI inspection. Live provider inference, billing and all arbitrary user plugin combinations are not certified by synthetic tests.

Local acceptance completed with 18 catalog/release tests and 36 client tests, plus build, package inspection and isolated Codex install/upgrade/rollback/discovery. The real official-CLI gate passed with nine synthetic requests and two native role members, preserved identity through follow-up/disconnect/restart, and confirmed no persistent credential file. Earlier failed fixture attempts accidentally activated native file credentials due to a patch-name matching guard; their test-only browser grant files and isolated processes/homes were deleted without reading or reusing credential values. The corrected fixture preflights the composed credential rows before any start. No personal profile or provider credentials were used.

Final Chrome acceptance opened the client-owned ordinary Web instance, created a bounded synthetic Team through native Settings, and observed the completed Session with the configured fixture model. Open Team closed Settings and selected that same Session. Reload and reopening retained the original request fields and Team receipt, with no horizontal dialog overflow. The attributed idle fixture shut down through the native activity guard, and its test-only home was removed.

Node 24.9's built-in SQLite API emits its official experimental-status diagnostic on stderr. Production leaves it visible; protocol tests accept only that exact warning block and reject any other diagnostics while checking the original output for secrets. Confirmed failed startups wait for attributed supervisor cleanup after releasing lifecycle coordination; regression checks require removed metadata, a dead failed child and a successful clean restart.

Compatibility acceptance on Node 24.9 repeated all 54 tests, build, package inspection, real Codex installation and release asset preparation. The actual official-CLI gate also passed on that runtime with eight bounded requests, two role members, persistent restart and no persistent credential file. The existing Node 24.9 CI workflow is unchanged.

PR review follow-up passed 63 tests (18 catalog/release, 45 client) on Node 24.9 and 26, with complete build/package/Codex-install/release-asset checks. A real external SQLite contender reproduced the advisory-lock release before the local descriptor gate; the corrected gate also proves timed-out waiters never run later. Browser regressions keep a fake launcher alive while a following serialized MCP health call completes. The committed runner failed the new interleaving/authentication regression; the corrected runner passes it and checks bounded 0600 diagnostics before/after readiness without exposing launch capabilities. The actual official-CLI cross-repository gate passed with nine bounded synthetic calls, and the new real macOS handoff visibly reached ordinary Web. The idle native fixture was guardedly stopped and both review test homes were removed.

The 0.3.1 orchestration contract passed 67 tests on Node 24.9 and 26, build/package checks and isolated real Codex install/upgrade/rollback checks. Written-skill assertions validate explicit activation, main/Lead ownership, escalation and honest guidance limits; they do not prove model compliance or global tool enforcement. The actual public host 0.5.0 archive passed the ordinary official-CLI gate with a verified native Lead/root, rejection of a real child-ID send, same-member follow-up and durable restart (nine bounded synthetic requests, no persistent credentials). No live provider inference or user-environment deployment was performed.

Final catalog v0.2.0 publication exposed that this repository is private: anonymous release URLs returned 404 and Git clone without authentication failed. The same fixed tag installed successfully with the existing authorized GitHub credential helper in a new temporary Codex home: all 26 archive files matched, MCP reported plugin 0.3.1 and eight tools, the installed Lead contract and pinned refresh passed, no host started, and no credentials were written to that Codex home. Repository visibility and credential scopes were unchanged. The 0.2.1 / plugin 0.3.2 patch corrects access documentation and generated release instructions; it preserves the released orchestration implementation.

## Permission and URL candidate gate in a restricted environment

`npm run build` and `npm run test:isolated` check source/package metadata, catalog/release files, actual protocol/admission modules with synthetic state and signatures, and the no-listener client subset. Tests cover unsigned full-access fallback and its exact reason, explicit profiles, strict failures, complete opaque fields, protocol-only provenance, unavailable/external state, read-only startup refusal without fallback, exact launcher/bootstrap argv, source/cwd/backend binding, fresh native snapshots, question/approval freshness and URL cancellation/redaction. Real GatewayClient deferred responses cover cancellation and cleanup without a listener. Packaged MCP initialization/tool listing reports normal runtime-setup requirements rather than requiring an authority.

The full `npm test` also contains an explicitly synthetic sandbox-launcher lifecycle check for actual native host PID attribution, Gateway binding, same-state continued work, lost-metadata refusal and guarded shutdown. Its fabricated launcher does not impose OS confinement. Listener/lifecycle/process-attribution cases remain excluded locally and run only in normal CI. Native host tests include independent native forks and seeded ancestry remaining outside member inheritance.

The first local real CLI attempt used `scripts/test-codex-boundary.mjs` with Codex 0.164.0, an isolated empty Codex home and synthetic restricted filesystem state. It exited 71: `sandbox-exec: sandbox_apply: Operation not permitted`, before the DSH FileSystem/shell/background probe ran. That attempt was not changed to disabled mode. Subsequent formally approved synthetic boundary validation and real Codex metadata/host observations are recorded in [permission validation boundaries](permissions.md#validation-scope-and-history); the later read-only host attempt failed with EPERM on its own configuration write before inference. No socket/Web listener, real token, provider credentials, persistent signing keys or system-security changes were used. This is a failed environment-boundary check, not real OS or user-session acceptance. Full Codex approval/reviewer and managed-network inheritance remain unsupported/partial; the later scoped acceptance below does not certify them.

Current fallback candidate gates on Node 26.0.0: catalog/client build and **131 isolated tests** passed; companion host build and **236 isolated test executions** passed (15/15 selected native files, including 17 permission-inheritance executions). Zero failures/cancellations/skips in these completed gates. The initial client gate lacked permission to write test/build directories, and the initial host gate ran before its build; both were rerun successfully after the required setup/normal single-command approval. These gates exclude real listeners/process attribution and do not establish complete host/model E2E or approval/reviewer/network inheritance.

## Scoped real-model acceptance and merge scope

The [2026-11-08 acceptance report](acceptance-2026-11-08.md) records a successful, separately authorized real-provider run on client `b92be5a89829de83cbfe484a045d69c33469e945` and host `5dbea78dd347751cc5730cc8a3ef1f9f44644bd4`. Automatic metadata, the official launcher, owned host/Lead binding, exact model output, asynchronous completion and guarded process cleanup passed. Earlier paragraphs describe their own historical attempts; they are not current assertions that no model has ever run. Full approval/reviewer, YOLO, managed-network and authenticated-browser acceptance remain open.

The follow-up adds in-memory regressions through the actual manager ensure/request path: source/reason/state/launcher/cwd changes reject retained hosts before connecting, and responding execution/binding mismatches block create. No provider, listener or process-identity probe is involved. Existing summary tests already preserve unknown completion and distinguish Team completion from observed owned Jobs; copying the one-off harness would not strengthen that product contract.

The mergeable scope is supported opaque-state handoff, explicit capability-gap fallback, native policy propagation and fail-closed attribution/admission. Merging does not certify the unsupported policy channels or authorize release/deployment. Candidate versions and published installation pins stay separate.

The 2026-11-08 follow-up on Node 26.0.0 passed build, package inspection and **144 isolated tests** with zero failures/cancellations/skips. The matching host documentation follow-up passed build, package inspection and **236 isolated executions**. Full listener/lifecycle CI on the new heads remains required before merge.

The network-default follow-up passed local Node 26 build/package checks, **150 client isolated tests** and **236 host isolated executions**, with zero failures/cancellations/skips. New regressions cover requested open-network provenance, preserved opaque fields, refusal before work, capability gaps combined with restricted/unknown network, and refusal to adopt older unknown-network bindings. No real provider/network call or security-setting change was made. Full current-head CI/review is required before merge.
