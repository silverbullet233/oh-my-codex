# Get started

The client starts its own ordinary Web host when first used. Perform one-time installation in a **new dedicated Harness home**; existing personal/global Web processes are never adopted or stopped.

## Install the pinned Codex catalog

The unreleased candidate catalog **v0.3.1** contains plugin **dsh-agent-team 0.4.1**; it is not tagged or published. The latest **published** catalog is **v0.3.0** with plugin **dsh-agent-team 0.4.0**. These are independent versions.

**Installation target (unreleased candidate):** catalog v0.3.1 / plugin 0.4.1; publication pending — no tag or Release assets exist yet. The latest published installation remains catalog v0.3.0 / plugin 0.4.0; use the published `v0.3.0` tag for released installation until this candidate is tagged and its assets are verified. The earlier catalog v0.2.1 / plugin 0.3.2 was published on 2026-10-31. The older v0.1.0 catalog uses the legacy client.

This catalog repository is public as verified on 2026-11-08; earlier private-repository installation observations describe their historical configuration. For a private mirror, Git must already authenticate an account with repository access; keep that authentication in the existing Git credential manager. Release publication does not change repository visibility. Never put tokens in repository URLs or MCP configuration.

**Unreleased candidate (catalog 0.3.1 / plugin 0.4.1, this branch):** the candidate is not tagged, has no Release assets and is not published; the `v0.3.1` pins below are release-preparation pins, not a published ref. It requires exact DSH `0.2.2-alpha.3` and the matching **unreleased** dsh-team-roles 0.6.1 candidate build (the published 0.6.0 archive supports only `0.2.2-alpha.2`), installed from a locally built plugin package in an isolated home; see the repository development instructions. The published install below remains on catalog v0.3.0 / plugin 0.4.0 and exact DSH `0.2.2-alpha.2`.

For the published v0.3.0 catalog's supplementary assets, an already authenticated GitHub CLI can download that fixed release with `gh release download v0.3.0 --repo silverbullet233/oh-my-codex --dir /absolute/new-empty-download-directory`; verify its `SHA256SUMS`. Git authentication and GitHub CLI authentication are separate prerequisites. The host archive below is public and uses its exact versioned URLs.

Use a Codex CLI that supports plugin marketplaces:

```sh
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.3.1
codex plugin add dsh-agent-team@oh-my-codex --json
```

The install result's `installedPath` is the plugin directory used below. Start a new Codex session after setup. Codex installs through the fixed Git marketplace tag, not directly from a Release tarball. Changing an existing marketplace's ref requires removing that registration first; this does not delete DSH data. Do not register `main`, a feature branch or a floating latest ref for normal use. The `v0.3.1` ref above is the candidate release-preparation pin; for released installation substitute the published `v0.3.0` tag until the candidate is tagged and verified.

## Agent-guided initialization

Ask your AI Agent to follow [the bootstrap guide](bootstrap.md). It coordinates the existing explicit runtime/Home configuration, verified host download, setup and health checks; there is no separate bootstrap installer or automatic MCP discovery. The guide and setup repeat-safety changes are included from catalog v0.3.0. The equivalent manual steps are below.

## Prepare the published runtime and released host

Use Node >=24.9.0. Install the exact official DSH runtime in a separate directory, leaving any global installation alone. The published plugin 0.4.0 requires exact `0.2.2-alpha.2`; the unreleased candidate requires `0.2.2-alpha.3` instead, as noted above:

```sh
npm install --prefix /absolute/dsh-runtime @deepseek-ai/dsh@0.2.2-alpha.2 --ignore-scripts
export DSH_AGENT_TEAM_RUNTIME=/absolute/dsh-runtime/node_modules/@deepseek-ai/dsh
export DSH_AGENT_TEAM_HOME=/absolute/new-dedicated-dsh-home
```

Download the built [host 0.6.0 release](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.6.0), check its checksum, and keep the archive's absolute path. In a new download directory:

```sh
curl -fL https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.0/dsh-team-roles-0.6.0.tgz -o dsh-team-roles-0.6.0.tgz
curl -fL https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.0/SHA256SUMS -o SHA256SUMS
shasum -a 256 -c SHA256SUMS
dsh_host_archive="$(pwd)/dsh-team-roles-0.6.0.tgz"
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

- Each process starts a dedicated loopback Web listener on a free port. `dsh_team_web` invokes the native launch URL through the OS browser handoff and returns a clean origin. Browser handoff is bounded even when the launcher remains alive; it never terminates the browser. API cookies are separate from browser cookies. If the user explicitly requests the authenticated URL itself, `dsh_team_web_url` returns the existing owned-host homepage URL verbatim after an explicit user request; that URL is a reusable bearer credential (host-process scoped, not a Team permalink) that can appear in client history and grants owner access to all Teams on that host while it runs. Restart invalidates it; upstream has no logout API and browser cookies use the upstream absolute default lifetime (~30 days, configurable; the query does not read the actual configured value). The query never opens a browser, creates/resumes Teams, adopts another host or restarts a stopped one.
- Native `/connect` authentication is renewed after Mux closure or host restart. Writes with uncertain outcomes are not replayed automatically. Retain their IDs and inspect native status before retrying.
- Closing Codex/MCP does not cancel work. `dsh_team_stop` interrupts a Team and reports observed quiescence separately from cancellation acceptance. Native inboxes and file changes remain.
- `dsh_team_shutdown` refuses active, provisioning, queued or uncertain work, including unmanaged Web Sessions. On a safe result it sends graceful termination only to the attributed process. A lost preparation reply or failed termination leaves a five-second native fence that expires.
- The next health restarts the same dedicated home. Cold unfinished work requires explicit continuation. Process exit never means task completion.

## Migration and troubleshooting

Keep an existing 0.5.0 Home intact. Setup for this release requires host 0.6.0 and refuses to overwrite a mismatched installation. Use a new dedicated Home, then deliberately plan any native Session/data migration; do not upgrade a live or personal profile automatically.

`DSH_AGENT_TEAM_SOCKET` and all socket fallbacks are removed. The host keeps legacy receipt/projection storage identities, but the client cannot adopt an arbitrary old home. For a data migration, stop both writers, prepare a new owned home, and deliberately migrate native Sessions, related attachments, role state and nonsecret role/provider configuration while preserving their relationships. Keep the new ownership marker and installation. Reauthenticate through native DSH; do not copy credentials automatically.

| Error | Action |
| --- | --- |
| `RUNTIME_REQUIRED` / `RUNTIME_MISMATCH` | Point to the exact supported official package directory; no global upgrade is performed |
| `SETUP_REQUIRED` / `UNOWNED_HOME` | Use setup with an empty dedicated home; never repurpose a personal live profile |
| `CAPABILITY_MISMATCH` | Install the pinned native-Gateway host release and matching official Team profile |
| `STARTUP_PENDING` / `STARTUP_UNCERTAIN` | Inspect that dedicated instance; a second writer is intentionally refused |
| `OUTCOME_UNCERTAIN` | Retain the original key/input ID, reconnect, inspect status and retry only the same authorized content |
| `SHUTDOWN_PENDING` | No force-kill was sent; inspect native work and retry after the fence expires |
| Native approval unavailable | Use the separate explicit approval tool in the [interaction bridge](interactions.md); while it controls the Team, Web answering/messages are unsupported |

Health and Web handoff return `diagnostics.path`, and startup errors include the corresponding local diagnostic path. Each instance retains a private 0600 JSON log with at most 64 KiB of recent native stdout/stderr, including output after readiness. Launch capabilities, URL queries, cookies and credential fields are redacted before writing. Inspect that local file when activation or runtime calls fail; never copy private launch metadata into reports. Oversized native lines are omitted rather than logging an unlabelled suffix.

For this unreleased candidate, startup/work additionally requires the [trusted Codex permission context](permissions.md). There is no automatic effective-permission discovery or environment-based YOLO detection. Published release instructions above retain their version scope.
