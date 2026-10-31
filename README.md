# Oh My Codex

Independent Codex plugins and reusable skills. Each plugin is self-contained under `plugins/<name>/`; the repository root owns the marketplace catalog and development tooling.

| Plugin | Purpose | Setup |
| --- | --- | --- |
| DSH Agent Team | Codex-owned ordinary DSH Web host and native Team Gateway | [Getting started](plugins/dsh-agent-team/docs/getting-started.md) · [Plugin README](plugins/dsh-agent-team/README.md) |

## Install in Codex

Register the marketplace and install the plugin with a CLI that supports `codex plugin`:

**Release availability:** use the catalog **v0.2.1** / plugin **0.3.2** commands below only after that tag is published, its release workflow succeeds and its assets are verified. While publication is pending, these commands are not an available installer; do not substitute a floating ref. The older v0.1.0 catalog contains the legacy plugin and does not install this native-Gateway client.

This catalog repository is currently private. Git must already authenticate an account with repository access before marketplace registration; keep that authentication in the existing Git credential manager. A published Release does not change repository visibility, and anonymous requests may return 404. Never put tokens in repository URLs or MCP configuration.

```sh
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.2.1
codex plugin add dsh-agent-team@oh-my-codex
```

Start a new Codex session after installation. DSH Agent Team requires one-time setup of an exact supported DSH runtime and a new dedicated home with the native host plugin. Its MCP client then starts/reuses that ordinary Web host lazily. Follow the [getting-started guide](plugins/dsh-agent-team/docs/getting-started.md) for current runtime and host-plugin requirements.

The version mapping for this release is **catalog v0.2.1 → dsh-agent-team 0.3.2**, paired with **[dsh-team-roles 0.5.0](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.5.0)** and exact DSH **0.2.2-alpha.2**. Normal installation uses the fixed catalog tag, never `main`, a feature branch or a floating latest ref. Check [Releases](https://github.com/silverbullet233/oh-my-codex/releases) before selecting another version.

The tag versions the entire catalog; plugins keep independent versions (`dsh-agent-team` is currently `0.3.2`). Release archives and checksums are for inspection and packaging. Codex installs through the Git marketplace, not directly from a Release tarball.

## Update or roll back

To refresh the currently selected ref and reinstall its plugin snapshot:

```sh
codex plugin marketplace upgrade oh-my-codex
codex plugin add dsh-agent-team@oh-my-codex
```

An immutable tag stays on that tag. To select a different published tag, first remove the marketplace registration, then repeat the install commands with an explicit compatible version (the current pin is shown below):

```sh
codex plugin marketplace remove oh-my-codex
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.2.1
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
