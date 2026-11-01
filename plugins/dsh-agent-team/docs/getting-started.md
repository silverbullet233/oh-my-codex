# Get started

The client starts its own ordinary Web host when first used. Perform one-time installation in a **new dedicated Harness home**; existing personal/global Web processes are never adopted or stopped.

## Install the pinned Codex catalog

Catalog **v0.2.1** contains plugin **dsh-agent-team 0.3.2**. These are independent versions.

**Published release:** catalog **v0.2.1** / plugin **0.3.2** was published on **2026-10-31** and passed GitHub Actions release validation. The fixed tag below is available to authorized repository users. The older v0.1.0 catalog contains the legacy plugin and does not install this native-Gateway client.

This catalog repository is currently private. Git must already authenticate an account with repository access before marketplace registration; keep that authentication in the existing Git credential manager. A published Release does not change repository visibility, and anonymous requests may return 404. Never put tokens in repository URLs or MCP configuration.

For the catalog's supplementary assets, an already authenticated GitHub CLI can download the fixed release with `gh release download v0.2.1 --repo silverbullet233/oh-my-codex --dir /absolute/new-empty-download-directory`; verify its `SHA256SUMS`. Git authentication and GitHub CLI authentication are separate prerequisites. The host archive below is public and uses its exact versioned URLs.

Use a Codex CLI that supports plugin marketplaces:

```sh
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.2.1
codex plugin add dsh-agent-team@oh-my-codex --json
```

The install result's `installedPath` is the plugin directory used below. Start a new Codex session after setup. Codex installs through the fixed Git marketplace tag, not directly from a Release tarball. Changing an existing marketplace's ref requires removing that registration first; this does not delete DSH data. Do not register `main`, a feature branch or a floating latest ref for normal use.

## Bootstrap (unreleased local change)

This entry is under local review and **is not in catalog v0.2.1 / plugin 0.3.2**. The current fixed-tag install still requires the manual steps in the next section. Do not change marketplace registration to a feature branch, copy changed code into a published tag, or expect an installed v0.2.1 plugin to have `bootstrap.mjs`. Once an explicitly approved future release contains this entry, it can run directly from that release's `installedPath`. For local review use this checkout's `plugins/dsh-agent-team` directory and a temporary isolated `CODEX_HOME`.

With **Node.js >=24.9.0 and npm already on PATH**, from the plugin directory:

```sh
node scripts/bootstrap.mjs /absolute/authorized/workspace
```

Bootstrap checks npm, downloads the fixed **host v0.5.0** archive and `SHA256SUMS`, and verifies both against the reviewed SHA-256 `e9f89b9e93e0c236005d3ad60c78ade3a548ba38f4b9b881bb9fb6378b5f5d61`. It installs exact **@deepseek-ai/dsh@0.2.2-alpha.2** privately from the official npm registry with lifecycle scripts disabled. It calls the existing `setup.mjs` to claim the private DSH Home and install exact **Team Profile 0.2.2-alpha.2** and host **0.5.0**, then checks native API/runtime/ownership through the existing host lifecycle. It creates no Team and makes no inference request. Node installation remains a prerequisite; if Node is absent or too old, install a supported Node through your existing Node manager and invoke this entry with that executable. Bootstrap never installs or upgrades global Node/DSH.

The default root is `<CODEX_HOME>/dsh-agent-team/bootstrap`, where `CODEX_HOME` defaults to `~/.codex`. It contains private ownership/version metadata, the verified archive and an atomically published `installation/` with `runtime/` and `home/`. Bootstrap and MCP must use the **same Codex home and user account**. The default MCP/client discovers that installation directly after restart; no terminal exports, marketplace changes or global Codex configuration writes are required. `node` must also be available on the MCP process's PATH at a supported version. Bootstrap cannot change the executable PATH of an already-running desktop app.

Existing `DSH_AGENT_TEAM_HOME`, `DSH_AGENT_TEAM_RUNTIME` or `DSH_HOME` values cause bootstrap to refuse. Keep the manual configuration, or start a clean bootstrap process without those values. Explicit `DSH_AGENT_TEAM_HOME` / `DSH_AGENT_TEAM_RUNTIME` values always take precedence in MCP; remove them from that process only if you deliberately want default discovery. An existing legacy default `dsh-agent-team/host` Home also blocks the default bootstrap: keep it or choose a separate custom root. No personal/default Home is adopted, migrated or modified.

A custom root is optional:

```sh
node scripts/bootstrap.mjs /absolute/authorized/workspace --root /absolute/new-private-bootstrap-root
```

Custom roots are not registered automatically. The JSON result prints the exact **nonsecret** `environment` values. Apply **both** values to the `dsh-agent-team` MCP server's environment and restart that server. In a per-server MCP configuration, the relevant fields are:

```json
{
  "command": "/absolute/path/to/supported/node",
  "args": ["/absolute/installed-plugin-path/src/mcp/main.mjs"],
  "cwd": "/absolute/installed-plugin-path",
  "env": {
    "DSH_AGENT_TEAM_HOME": "/absolute/new-private-bootstrap-root/installation/home",
    "DSH_AGENT_TEAM_RUNTIME": "/absolute/new-private-bootstrap-root/installation/runtime/node_modules/@deepseek-ai/dsh"
  }
}
```

Use your host's per-server configuration interface if available; bootstrap does not edit the installed `mcp.json` or Codex config. For Codex CLI, an exact process-scoped alternative is to launch a **new** process from the terminal:

```sh
env DSH_AGENT_TEAM_HOME='/absolute/new-private-bootstrap-root/installation/home' DSH_AGENT_TEAM_RUNTIME='/absolute/new-private-bootstrap-root/installation/runtime/node_modules/@deepseek-ai/dsh' codex
```

Exporting values in an unrelated terminal cannot update an already-running Codex app or MCP process. For the default root, use discovery and restart; for a custom root, use the server environment or the new CLI process above. Never add provider keys, Git tokens, launch tokens or API cookies to these fields.

Rerun the same command with the **same workspace/root** after an interruption. OS-released coordination serializes installers; contention fails with `STARTUP_BUSY` after a bounded wait, so retry after the first run settles. Complete installations skip all downloads and package installs, validate versions/ownership and rerun health. Health failure leaves the complete installation available for diagnosis and retry. A failed install leaves a private `.attempt-*` directory and starts a fresh attempt on retry, so an uncertain surviving package-manager child cannot modify the next attempt. No failed attempt or existing installation is automatically deleted. After confirming no installer uses it, you may deliberately remove a failed attempt to reclaim space. An interrupted checksum download is retried; cached digest conflicts fail closed instead of overwriting bytes.

Changed versions, a different workspace, foreign/nonprivate/symlink directories or unknown installation contents are refused without replacement. Pick a new empty private root for another installation; data migration is a separate deliberate action. Setup also refuses to change a live or uncertain dedicated host: use the existing guarded shutdown flow first. Installation subprocesses receive a minimal environment with private HOME/npm config/cache; existing npm config and provider environment secrets are not copied. Native first-run browser/API authentication may create DSH's normal private local grant storage; bootstrap does not provision or persist provider credentials. Configure roles and provider authentication yourself in native Web before submitting tasks. Health leaves only the owned idle host running; normal MCP disconnect/shutdown rules below still apply.

## Prepare the supported runtime and released host (v0.2.1 manual path)

Use Node >=24.9.0. Install the exact official DSH runtime in a separate directory, leaving any global installation alone:

```sh
npm install --prefix /absolute/dsh-runtime @deepseek-ai/dsh@0.2.2-alpha.2 --ignore-scripts
export DSH_AGENT_TEAM_RUNTIME=/absolute/dsh-runtime/node_modules/@deepseek-ai/dsh
export DSH_AGENT_TEAM_HOME=/absolute/new-dedicated-dsh-home
```

Download the built [host 0.5.0 release](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.5.0), check its checksum, and keep the archive's absolute path. In a new download directory:

```sh
curl -fL https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.5.0/dsh-team-roles-0.5.0.tgz -o dsh-team-roles-0.5.0.tgz
curl -fL https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.5.0/SHA256SUMS -o SHA256SUMS
shasum -a 256 -c SHA256SUMS
dsh_host_archive="$(pwd)/dsh-team-roles-0.5.0.tgz"
```

From the `installedPath` returned by Codex, in the same terminal:

```sh
cd /absolute/installed-plugin-path
node scripts/setup.mjs "$dsh_host_archive" /absolute/authorized/workspace
node scripts/client.mjs health
node scripts/client.mjs web
```

Setup claims an empty private home, saves the launch workspace, and uses that exact CLI to install the ordinary Web profile, official Team bundle and verified host tarball. It does not launch a model or configure provider credentials. The first health lazily starts native Web; normal native first-run authentication/storage behavior belongs to DSH. Configure existing provider authentication and roles in native Web before submitting work. The launch workspace supplies the default native workspace allowlist; deployment changes remain native profile configuration. Older host 0.3.0/0.4.0 use a different transport and are incompatible.

The two environment variables must be available to **Codex's MCP server process**. Exporting them in an unrelated terminal does not update an already running desktop app. Do not put launch tokens, API cookies or provider credentials in MCP configuration.

Explicitly ask Codex to use DSH Agent Team. Under the [orchestration contract](orchestration.md), main clarifies requirements/design, defines decomposition and acceptance, and delegates all implementation/testing/debugging to Lead. Main owns progress and independent read-only review; correction instructions go only to Lead. If Lead cannot proceed, main escalates to the user rather than taking over. Read-only member observations are allowed; direct member instructions are not. This is skill guidance, not global tool removal.

Call health first, inspect the returned catalog, then create the Lead/root. The CLI example below demonstrates the same delegation boundary:

```sh
node scripts/client.mjs create '{"key":"task-001","cwd":"/absolute/authorized/workspace","text":"The explicitly authorized task."}'
```

Keep `teamId` and the create/input IDs. Send follow-ups to that Team rather than creating another. An empty role catalog supports native model inheritance; never invent a role, endpoint or reasoning setting. Native Web also has **Settings → Team roles → Create a role-managed Team**. Its ordinary New Session entry remains unmanaged.

## Connection and lifetime

- Each process starts a dedicated loopback Web listener on a free port. `dsh_team_web` invokes the native launch URL through the OS browser handoff and returns a clean origin. Browser handoff is bounded even when the launcher remains alive; it never terminates the browser. API cookies are separate from browser cookies.
- Native `/connect` authentication is renewed after Mux closure or host restart. Writes with uncertain outcomes are not replayed automatically. Retain their IDs and inspect native status before retrying.
- Closing Codex/MCP does not cancel work. `dsh_team_stop` interrupts a Team and reports observed quiescence separately from cancellation acceptance. Native inboxes and file changes remain.
- `dsh_team_shutdown` refuses active, provisioning, queued or uncertain work, including unmanaged Web Sessions. On a safe result it sends graceful termination only to the attributed process. A lost preparation reply or failed termination leaves a five-second native fence that expires.
- The next health restarts the same dedicated home. Cold unfinished work requires explicit continuation. Process exit never means task completion.

## Migration and troubleshooting

`DSH_AGENT_TEAM_SOCKET` and all socket fallbacks are removed. The host keeps legacy receipt/projection storage identities, but the client cannot adopt an arbitrary old home. For a data migration, stop both writers, prepare a new owned home, and deliberately migrate native Sessions, related attachments, role state and nonsecret role/provider configuration while preserving their relationships. Keep the new ownership marker and installation. Reauthenticate through native DSH; do not copy credentials automatically.

| Error | Action |
| --- | --- |
| `RUNTIME_REQUIRED` / `RUNTIME_MISMATCH` | Point to the exact supported official package directory; no global upgrade is performed |
| `SETUP_REQUIRED` / `UNOWNED_HOME` | Use setup with an empty dedicated home; never repurpose a personal live profile |
| `CAPABILITY_MISMATCH` | Install the pinned native-Gateway host release and matching official Team profile |
| `STARTUP_PENDING` / `STARTUP_UNCERTAIN` | Inspect that dedicated instance; a second writer is intentionally refused |
| `OUTCOME_UNCERTAIN` | Retain the original key/input ID, reconnect, inspect status and retry only the same authorized content |
| `SHUTDOWN_PENDING` | No force-kill was sent; inspect native work and retry after the fence expires |
| Native approval unavailable | Open native Web and handle approvals there; this passive API Peer cannot answer them |

Health and Web handoff return `diagnostics.path`, and startup errors include the corresponding local diagnostic path. Each instance retains a private 0600 JSON log with at most 64 KiB of recent native stdout/stderr, including output after readiness. Launch capabilities, URL queries, cookies and credential fields are redacted before writing. Inspect that local file when activation or runtime calls fail; never copy private launch metadata into reports. Oversized native lines are omitted rather than logging an unlabelled suffix.
