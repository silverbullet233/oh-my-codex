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
node plugins/dsh-agent-team/scripts/test-native-e2e.mjs /absolute/official-dsh-package /absolute/dsh-team-roles-0.5.0.tgz
```

Run it in an isolated environment with PATH and locale only. It creates its own home/profile, installs the actual candidate and test-only native contribution, and checks real managed-Team creation, duplicate create, two native role members, same-member follow-up, result/completion, client disconnect, safe shutdown and cold persistent restart. It asserts that no persistent credential file was created. `--open --keep` is an explicit visual-validation option; the retained process/home must be cleaned up afterward. This gate is independent of ordinary CI's transport fixtures.

The host repository separately verifies role edits/cold recovery, running steer/stop, pending provisioning, admission/result evidence, lost replies, native Web creation and writer lifecycle. Browser claims require actual UI inspection. Live provider inference, billing and all arbitrary user plugin combinations are not certified by synthetic tests.

Local acceptance completed with 18 catalog/release tests and 36 client tests, plus build, package inspection and isolated Codex install/upgrade/rollback/discovery. The real official-CLI gate passed with nine synthetic requests and two native role members, preserved identity through follow-up/disconnect/restart, and confirmed no persistent credential file. Earlier failed fixture attempts accidentally activated native file credentials due to a patch-name matching guard; their test-only browser grant files and isolated processes/homes were deleted without reading or reusing credential values. The corrected fixture preflights the composed credential rows before any start. No personal profile or provider credentials were used.

Final Chrome acceptance opened the client-owned ordinary Web instance, created a bounded synthetic Team through native Settings, and observed the completed Session with the configured fixture model. Open Team closed Settings and selected that same Session. Reload and reopening retained the original request fields and Team receipt, with no horizontal dialog overflow. The attributed idle fixture shut down through the native activity guard, and its test-only home was removed.

Node 24.9's built-in SQLite API emits its official experimental-status diagnostic on stderr. Production leaves it visible; protocol tests accept only that exact warning block and reject any other diagnostics while checking the original output for secrets. Confirmed failed startups wait for attributed supervisor cleanup after releasing lifecycle coordination; regression checks require removed metadata, a dead failed child and a successful clean restart.

Compatibility acceptance on Node 24.9 repeated all 54 tests, build, package inspection, real Codex installation and release asset preparation. The actual official-CLI gate also passed on that runtime with eight bounded requests, two role members, persistent restart and no persistent credential file. The existing Node 24.9 CI workflow is unchanged.
