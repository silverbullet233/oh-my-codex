# Get started

The client starts its own ordinary Web host when first used. Perform one-time installation in a **new dedicated Harness home**; existing personal/global Web processes are never adopted or stopped.

## Prepare the supported runtime and host candidate

Use Node >=24.9.0. Install the exact official DSH runtime in a separate directory, leaving any global installation alone:

```sh
npm install --prefix /absolute/dsh-runtime @deepseek-ai/dsh@0.2.2-alpha.2 --ignore-scripts
export DSH_AGENT_TEAM_RUNTIME=/absolute/dsh-runtime/node_modules/@deepseek-ai/dsh
export DSH_AGENT_TEAM_HOME=/absolute/new-dedicated-dsh-home
```

Build `dsh-team-roles` from the matching host branch (`npm ci --ignore-scripts --no-audit --no-fund`, `npm run build`, then `npm pack --pack-destination /absolute/output`). The resulting local file must actually exist. Host **0.5.0** and client **0.3.0** are unreleased candidates; published host 0.3.0 and main 0.4.0 are incompatible. Merge/release the host before a client release that requires it. These PRs do not publish tags, npm packages or Releases.

From this plugin's source or installed directory:

```sh
node scripts/setup.mjs /absolute/output/dsh-team-roles-0.5.0.tgz /absolute/authorized/workspace
node scripts/client.mjs health
node scripts/client.mjs web
```

Setup claims an empty private home, saves the launch workspace, and uses that exact CLI to install the ordinary Web profile, official Team bundle and actual host tarball. It does not launch a model or configure credentials. The first health lazily starts native Web; normal native first-run authentication/storage behavior belongs to DSH. Configure existing provider authentication and roles in native Web before submitting work. The launch workspace supplies the default native workspace allowlist; deployment changes remain native profile configuration.

The two environment variables must be available to **Codex's MCP server process**. Exporting them in an unrelated terminal does not update an already running desktop app. Do not put launch tokens, API cookies or provider credentials in MCP configuration.

## Install the Codex candidate

For development, use this repository's actual feature-branch ref until merged:

```sh
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref feat/owned-native-web-host
codex plugin add dsh-agent-team@oh-my-codex
```

Start a new Codex session. After merge, select `main` or an actual published catalog tag. Codex installs through the Git marketplace, not directly from an npm archive. Changing an existing marketplace's ref requires removing that registration first; this does not delete DSH data.

Explicitly ask Codex to use DSH Agent Team. Call health first, inspect the returned catalog, then create:

```sh
node scripts/client.mjs create '{"key":"task-001","cwd":"/absolute/authorized/workspace","text":"The explicitly authorized task."}'
```

Keep `teamId` and the create/input IDs. Send follow-ups to that Team rather than creating another. An empty role catalog supports native model inheritance; never invent a role, endpoint or reasoning setting. Native Web also has **Settings → Team roles → Create a role-managed Team**. Its ordinary New Session entry remains unmanaged.

## Connection and lifetime

- Each process starts a dedicated loopback Web listener on a free port. `dsh_team_web` invokes the native launch URL through the OS browser handoff and returns a clean origin. API cookies are separate from browser cookies.
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
| `CAPABILITY_MISMATCH` | Install the actual native-Gateway host candidate and matching official Team profile |
| `STARTUP_PENDING` / `STARTUP_UNCERTAIN` | Inspect that dedicated instance; a second writer is intentionally refused |
| `OUTCOME_UNCERTAIN` | Retain the original key/input ID, reconnect, inspect status and retry only the same authorized content |
| `SHUTDOWN_PENDING` | No force-kill was sent; inspect native work and retry after the fence expires |
| Native approval unavailable | Open native Web and handle approvals there; this passive API Peer cannot answer them |
