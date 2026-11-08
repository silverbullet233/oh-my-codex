# Oh My Codex

Independent Codex plugins and reusable skills. Each plugin is self-contained under `plugins/<name>/`; the repository root owns the marketplace catalog and development tooling.

| Plugin | Purpose | Setup |
| --- | --- | --- |
| DSH Agent Team | Codex-owned ordinary DSH Web host and native Team Gateway | [Getting started](plugins/dsh-agent-team/docs/getting-started.md) · [Plugin README](plugins/dsh-agent-team/README.md) |

## Install in Codex

For an Agent-executable installation workflow with verified published pins, isolated targets, repeat-safety checks and recovery, use [DSH Agent Team installation guide](docs/dsh-agent-team-install.md).

Register the marketplace and install the plugin with a CLI that supports `codex plugin`:

**Published release:** catalog **v0.3.1** / plugin **0.4.3**, paired with exact official DSH / Team Profile **0.2.2-alpha.3** and **[dsh-team-roles 0.6.1](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.6.1)**. Published on 2026-11-08 from reviewed commit `7c70e4aeec07fb55b59a28ccdb92c92ac7f3a837`; the official tag workflow, public assets and fixed-tag clean actual-MCP installation passed verification. Before installing, verify the fixed Release and tag using the installation guide. Older tags retain their original contents.
This catalog repository is public as verified on 2026-11-08; earlier private-repository installation observations describe their historical configuration. For a private mirror, Git must already authenticate an account with repository access; keep that authentication in the existing Git credential manager. Release publication does not change repository visibility. Never put tokens in repository URLs or MCP configuration.

```sh
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.3.1
codex plugin add dsh-agent-team@oh-my-codex
```

Start a new Codex session after installation. DSH Agent Team requires one-time setup of an exact supported DSH runtime and a new dedicated home with the native host plugin. Its MCP client then starts/reuses that ordinary Web host lazily. Follow the [getting-started guide](plugins/dsh-agent-team/docs/getting-started.md) for current runtime and host-plugin requirements.

Plugin 0.4.3 binds its runtime and DSH Home through Codex's persistent `${PLUGIN_DATA}` paths. Discover the resolved paths with `codex mcp list --json` in the intended Codex home, install the runtime and verified host there, then restart and call actual `dsh_team_health`. Terminal exports alone do not configure MCP. See the [Agent bootstrap guide](plugins/dsh-agent-team/docs/bootstrap.md) and [complete installation guide](docs/dsh-agent-team-install.md).

DSH Team defaults to native **full access** (`danger-full-access` / `never`, network enabled intent). It does not automatically inherit Codex sandbox, approval or network settings. Outer OS/process/admin restrictions remain effective. See [Team permissions](plugins/dsh-agent-team/docs/permissions.md).

Catalog and plugin versions are independent: **v0.3.1 → dsh-agent-team 0.4.3**. Install through the fixed Git marketplace tag. Release archives and checksums are supplementary inspection artifacts and cannot be passed directly to `codex plugin add`.

## Update or roll back

To refresh the currently selected ref and reinstall its plugin snapshot:

```sh
codex plugin marketplace upgrade oh-my-codex
codex plugin add dsh-agent-team@oh-my-codex
```

An immutable tag stays on that tag. To select a different published tag, first remove the marketplace registration, then repeat the install commands with an explicit compatible version (verify publication and compatibility before switching):

```sh
codex plugin marketplace remove oh-my-codex
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.3.1
codex plugin add dsh-agent-team@oh-my-codex
```

This changes the catalog registration and selected plugin snapshot; it does not remove DSH data. Other plugins from this marketplace must also be reinstalled if you want them to use the selected snapshot. Start a new session afterward. The CLI rejects changing an existing marketplace's ref without removing its registration first. An older catalog may require an older host/transport; verify that version's compatibility before rollback. Maintainers update these pins and their install verification with every release.

## Repository layout

```text
.agents/plugins/marketplace.json   Repository marketplace
plugins/<name>/                   Self-contained plugin packages
skills/<name>/                    Future standalone reusable skills
scripts/                         Catalog, installation and release tooling
test/                            Catalog and release checks
```

There are no standalone skills yet; the DSH workflow skill stays inside its plugin. For development, migration from the former root-plugin layout and release maintenance, see [CONTRIBUTING.md](CONTRIBUTING.md).
