# Changelog

Versions here describe the repository catalog. Each plugin has its own version.

## 0.2.0

- DSH Agent Team 0.3.0 replaces private IPC with the official Node Connection/Typert Gateway.
- Lazily manage a dedicated ordinary DSH Web host, preserve native persistent data across MCP disconnects and restart, and offer native Web handoff and guarded graceful shutdown.
- Breaking: configure a dedicated home and the exact DSH 0.2.2-alpha.2 runtime; install the published host 0.5.0 release archive first. Socket configuration is removed.

## 0.1.0

- Establish the versioned marketplace catalog with `dsh-agent-team` 0.2.0.
- Add semantic Git tag installation, upgrade and rollback instructions.
- Validate catalog snapshots and prepare draft Releases with plugin archives, version mapping and SHA-256 checksums.

Catalog tags and Releases require an explicit maintainer publication decision. The separate DSH host plugin has its own version and release assets.
