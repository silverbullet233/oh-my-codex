# Client validation

The repository split retains only a standalone Codex MCP/CLI client. The native package owns the original role/bridge/runtime/native tests and the new Settings tests. Earlier combined validation at commit `71e9f7a` reported 84 passing tests and synthetic dual-provider inference; that historical result is not a new live inference claim for this split.

The final client unit suite passed **17/17** tests. It covers MCP protocol/stdio, exact invocation-only request policies, private transport ownership, protocol/capability checks before work, EOF reconnection and error propagation. Build/package checks verify that the client package includes no native host, role implementation, runtime or cross-repository import. A packaged client can run from an isolated directory without DSH or node_modules and connect to the already running native host.

Migration verification reads health/status/result through the independent client and stdio MCP against the same native Web process and preserved Session `307febae-d8c0-4f59-b442-6ecd8a7efec1`. These are read-only calls and do not trigger new inference. Native Settings browser rendering/edit/save/reopen/invalid rejection evidence is maintained in `dsh-team-roles/docs/validation.md`.

Usage and fees remain unknown. Live synthetic inference permission remains removed; no credential is copied or changed. The historical native role snapshots and native Team/member identifiers remain stored by DSH.

The built npm package contained 17 files and was unpacked into an isolated temporary directory with no DSH/node_modules. Its stdio MCP process successfully initialized, read protocol-1 health and fetched the existing Team result `REUSE_fa56b94b8b`, `completed: true`. The native host stayed PID 13438 on loopback port 3080 throughout the migration; no host restart or new inference was needed. The final exact request-size check also passed; no write can exceed the private IPC request limit.
