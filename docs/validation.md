# Client validation

The repository split retains only a standalone Codex MCP/CLI client. The native package owns the original role/bridge/runtime/native tests and the new Settings tests. Earlier combined validation at commit `71e9f7a` reported 84 passing tests and synthetic dual-provider inference; that historical result is not a new live inference claim for this split.

The initial split client unit suite passed **17/17** tests. It covers MCP protocol/stdio, exact invocation-only request policies, private transport ownership, protocol/capability checks before work, EOF reconnection and error propagation. Build/package checks verify that the client package includes no native host, role implementation, runtime or cross-repository import. A packaged client can run from an isolated directory without DSH or node_modules and connect to the already running native host.

Migration verification reads health/status/result through the independent client and stdio MCP against the same native Web process and preserved Session `307febae-d8c0-4f59-b442-6ecd8a7efec1`. These are read-only calls and do not trigger new inference. Native Settings browser rendering/edit/save/reopen/invalid rejection evidence is maintained in `dsh-team-roles/docs/validation.md`.

Usage and fees remain unknown. Live synthetic inference permission remains removed; no credential is copied or changed. The historical native role snapshots and native Team/member identifiers remain stored by DSH.

The built npm package contained 17 files and was unpacked into an isolated temporary directory with no DSH/node_modules. Its stdio MCP process successfully initialized, read protocol-1 health and fetched the existing Team result `REUSE_fa56b94b8b`, `completed: true`. The native host stayed PID 13438 on loopback port 3080 throughout the migration; no host restart or new inference was needed. The final exact request-size check also passed; no write can exceed the private IPC request limit.

## Synchronization with native host 0.3.0 (2026-10-26)

The host reference is `silverbullet233/dsh-team-roles` commit `058c7c491e87dfb21e7735deb19ec4dac266dc2d`, package version 0.3.0. Its source protocol and published contract still declare IPC `dsh-team-roles` version 1 with the same five capabilities and six methods. The client version remains independent at 0.2.0; no native implementation or runtime dependency was copied back.

The current client unit suite passed **21/21** tests. New regressions verify that CLI/MCP use the host's `os.tmpdir()` socket default with a nondefault `TMPDIR`, retain an explicit legacy/custom socket override, submit an empty-catalog create without inventing a Lead/model route, and preserve an explicit role rejection without retrying native defaults. These are client/transport fixtures, not a new native-model inheritance or paid-inference claim. The first sandboxed run refused Unix socket creation; the same suite passed with local socket permission.

The opt-in historical inference runner now requires an explicit synthetic fixture description and uses PATH/configured commands and the normal socket resolver. It was not run during this synchronization. No credentials or native profile settings were changed, no active Web host was restarted, and no paid inference was requested.

Build and npm tarball inspection passed. The 18-file tarball was unpacked into an isolated temporary directory without `node_modules` or DSH imports in the client. Its CLI health and stdio MCP create/result requests succeeded against the actual 0.3.0 private IPC server module and protocol constants from the pinned host source, using a synthetic dispatch fixture and a nondefault `TMPDIR`. The create payload contained no injected role/provider/model. This verifies wire compatibility and packaged entrypoints, not native Session execution or model behavior; model requests were zero. Temporary sockets/processes were cleaned up.
