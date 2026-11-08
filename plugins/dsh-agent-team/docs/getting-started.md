# Get started

The client starts its own ordinary Web host when first used. Perform one-time installation in a **new dedicated Harness home**; existing personal/global Web processes are never adopted or stopped.

## Install the pinned Codex catalog

Catalog **v0.3.1** maps to plugin **dsh-agent-team 0.4.3**, exact official DSH / Team Profile **0.2.2-alpha.3** and built **dsh-team-roles 0.6.1**. Catalog publication is pending until its reviewed commit is tagged and its workflow/assets are verified. Check the fixed Release before installing; never substitute `main`, a floating ref, or an older runtime/host.

This catalog repository is public as verified on 2026-11-08. For a private mirror, Git must already authenticate an account with repository access; keep that authentication in the existing Git credential manager. Release publication does not change repository visibility. Never put tokens in repository URLs or MCP configuration.

For both existing and isolated Codex homes, follow the complete [English installation guide](https://github.com/silverbullet233/oh-my-codex/blob/main/docs/dsh-agent-team-install.md). It contains profile backup/conflict checks, tag/asset verification, discovery of the manifest-bound runtime/Home, sanitized installation and separate static, CLI and actual MCP checks. The [bootstrap guide](bootstrap.md) summarizes the same path for an Agent.

In the intended authorized Codex home, registration uses:

```sh
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.3.1
codex plugin add dsh-agent-team@oh-my-codex --json
```

Keep the returned `installedPath`. Discover this plugin's resolved transport through `codex mcp list --json`; its `env` supplies `DSH_AGENT_TEAM_RUNTIME=${PLUGIN_DATA}/runtime/node_modules/@deepseek-ai/dsh` and `DSH_AGENT_TEAM_HOME=${PLUGIN_DATA}/dsh-home`, already expanded by Codex into absolute paths. Install official `@deepseek-ai/dsh@0.2.2-alpha.3` under that runtime directory and run setup with those same paths. Do not choose an unrelated runtime/Home or edit an installed manifest. Restart a client using the same Codex home and a verified Node >=24.9.0 on PATH; DSH terminal exports are not required for MCP.

## Verify and install the released host

In a new private download directory:

```sh
curl -fL https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.1/dsh-team-roles-0.6.1.tgz -o dsh-team-roles-0.6.1.tgz
curl -fL https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.6.1/SHA256SUMS -o SHA256SUMS
shasum -a 256 -c SHA256SUMS
printf '%s  %s\n' '00f3fbf359289afa648fe8ef57b01739631c3ea70184f7f9351323dae1fcf669' 'dsh-team-roles-0.6.1.tgz' | shasum -a 256 -c -
```

Both checks must pass. Use the built archive, not GitHub's automatic source archive. With the discovered nonsecret DSH paths supplied to the setup process, run the installed `scripts/setup.mjs` with this archive and the authorized workspace as arguments. Setup installs the exact official Team Profile and host into an empty dedicated Home with scripts disabled. It refuses partial or mismatched installations; it does not install the runtime or migrate personal data.

First validate the installed MCP identity, protocol and all 18 exact tool names. CLI health can then start the dedicated ordinary Web host without model requests. Finally restart/reload the authorized Codex client and call that server's **actual `dsh_team_health`**: require `owned: true`, native API 1, compatible capabilities, exact runtime, expected roles and attributed Home/runtime/workspace. Direct Node/CLI checks alone do not establish Codex MCP integration. Plugin 0.4.0's missing environment forwarding is historical; 0.4.3 uses the supported manifest binding verified through real Codex app-server.

Do not create a Team, invoke a model, copy authentication, or open a browser as an installation test. Configure provider authentication and roles later through native DSH when separately authorized. If cleaning up, call `dsh_team_shutdown` only for this attributed idle host and verify its result; MCP EOF leaves the host alive.

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

Keep an existing older Home intact. Setup for this release requires host 0.6.1 and refuses to overwrite a mismatched installation. Use a new dedicated Home, then deliberately plan any native Session/data migration; do not upgrade a live or personal profile automatically.

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

Plugin 0.4.3 defaults to [DSH native full access](permissions.md): `danger-full-access`/`never`, network enabled intent. Codex sandbox/approval/network settings are not automatically inherited. Explicit profiles remain optional; outer OS/process/admin restrictions still apply.
