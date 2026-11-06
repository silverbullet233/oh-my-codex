The unreleased 0.3.1 / 0.4.1 candidate adds the explicit `dsh_team_web_url` disclosure command: protocol/argument gating, attributed-entry and managed-root validation, NO-side-effect behavior, verbatim URL fidelity with synthetic values, redacted errors, and setup host-version coherence are covered by candidate unit/transport tests. Keyless native acceptance for this candidate is **UNVERIFIED** in the current environment: its owned-host startup path requires process start-time inspection (`/bin/ps`), which the validating sandbox denies (`PROCESS_UNVERIFIABLE`); that is an environment limitation, not a pass or an incompatibility.

# Validation scope

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

`npm run build && npm run test:isolated` from the catalog runs source/package checks and an explicit no-listener subset: synthetic signed permission contexts, unknown/declared/forged/stale/wrong-process failures, inherited full/restricted policy, signed overrides, retained-host binding comparison, input and interaction preflight, MCP schemas, output, orchestration, distribution and catalog/release tests. Interaction tests exercise the real manager/Gateway/queue path for live and continued answers/approvals, including expiry during observation, reconnect binding changes and legitimate retries. URL tests use both an in-memory double and the real GatewayClient with deferred native responses: delayed success, no response, cleanup-phase cancellation, and primary/cleanup failures never disclose the synthetic credential after cancellation. The two pure URL-entry/root validators also run. It deliberately excludes socket, real host lifecycle, ps attribution and browser fixtures, including the one socket-based MCP summary case. Packaged/source/built MCP initialization and tool listing are checked with fail-closed health rather than real host startup. `npm test` remains the separate fuller gate; an isolated pass is not a full integration pass.

This environment rejected `127.0.0.1` test listening with `listen EPERM`; no real authenticated host was queried and no real bearer URL was read. Temporary synthetic keys/credentials are test-only and removed. The new Gateway factory is a test seam; the production environment configuration cannot select a mock and the original owned-process identity guard remains required.

Still required in a permitted environment: the external supervisor's actual effective-Codex-policy acquisition and confinement contract, authenticated real socket MCP/host startup/reuse with matching and changed outer limits, process start-time guards, browser/Connection behavior, shutdown and actual OS/network enforcement. The code does not include a Codex supervisor, independent OS attestation, network-policy setter or production authority enrollment. No production installation, runtime pin deployment, host restart or system permission change was performed for this gate.
