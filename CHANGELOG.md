# Changelog

Versions here describe the repository catalog. Each plugin has its own version.

## Unreleased

- Add an Agent-facing bootstrap guide using the existing setup and explicit MCP environment configuration.
- Guard setup workspace/ownership, reuse matching complete installations and refuse partial, incompatible or uncertain state without overwriting it.
- Correct v0.2.1 availability documentation; the new guide and setup changes are not part of that published tag.

## 0.2.1

- DSH Agent Team 0.3.2 documents existing Git authentication for this private catalog and authenticated release-asset verification. Publishing a Release does not make a private repository public.
- Keep the fixed catalog tag and public host 0.5.0 asset pins. The Lead orchestration behavior introduced in catalog 0.2.0 / plugin 0.3.1 is unchanged.

## 0.2.0

- DSH Agent Team 0.3.1 replaces private IPC with the official Node Connection/Typert Gateway.
- Lazily manage a dedicated ordinary DSH Web host, preserve native persistent data across MCP disconnects and restart, and offer native Web handoff and guarded graceful shutdown.
- Explicit activation makes Codex main responsible for requirements/design, decomposition, acceptance, progress and independent read-only review. All implementation/testing/debugging is delegated to DSH Lead; no direct member instructions or alternate Codex execution workers. Blocked Lead work escalates to the user. This is skill guidance, not a global sandbox.
- Breaking: configure a dedicated home and the exact DSH 0.2.2-alpha.2 runtime; install the published host 0.5.0 release archive first. Socket configuration is removed.

## 0.1.0

- Establish the versioned marketplace catalog with `dsh-agent-team` 0.2.0.
- Add semantic Git tag installation, upgrade and rollback instructions.
- Validate catalog snapshots and prepare draft Releases with plugin archives, version mapping and SHA-256 checksums.

Catalog tags and Releases require an explicit maintainer publication decision. The separate DSH host plugin has its own version and release assets.
