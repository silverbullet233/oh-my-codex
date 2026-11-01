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

## Agent-guided initialization

Ask your AI Agent to follow [the bootstrap guide](bootstrap.md). It coordinates the existing explicit runtime/Home configuration, verified host download, setup and health checks; there is no separate bootstrap installer or automatic MCP discovery. The guide and setup repeat-safety changes are unreleased and are not part of the immutable v0.2.1 tag. The published tag uses the manual steps below.

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

The two environment variables must be available to **Codex's MCP server process**. Restart that server and call its actual `dsh_team_health`; CLI health alone does not confirm MCP connectivity. Exporting them in an unrelated terminal does not update an already running desktop app. Do not put launch tokens, API cookies or provider credentials in MCP configuration.

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
| Native approval unavailable | In published v0.2.1 the passive Peer cannot answer; use native Web. The unreleased [interaction bridge](interactions.md) uses separate explicit approval tools; while it controls the Team, Web answering/messages are unsupported |

Health and Web handoff return `diagnostics.path`, and startup errors include the corresponding local diagnostic path. Each instance retains a private 0600 JSON log with at most 64 KiB of recent native stdout/stderr, including output after readiness. Launch capabilities, URL queries, cookies and credential fields are redacted before writing. Inspect that local file when activation or runtime calls fail; never copy private launch metadata into reports. Oversized native lines are omitted rather than logging an unlabelled suffix.
