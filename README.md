# Oh My Codex

Independent Codex plugins and reusable skills. Each plugin is self-contained under `plugins/<name>/`; the repository root owns the marketplace catalog and development tooling.

| Plugin | Purpose | Setup |
| --- | --- | --- |
| DSH Agent Team | Explicit MCP client for the same native DSH Session service used by Web | [Getting started](plugins/dsh-agent-team/docs/getting-started.md) · [Plugin README](plugins/dsh-agent-team/README.md) |

## Install in Codex

Register the marketplace and install the plugin with a CLI that supports `codex plugin`:

```sh
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref main
codex plugin add dsh-agent-team@oh-my-codex
```

Start a new Codex session after installation. DSH Agent Team also requires a separately installed, compatible **running DSH Web host with `dsh-team-roles` loaded**. Installing this Codex plugin does not start DSH. Follow the [getting-started guide](plugins/dsh-agent-team/docs/getting-started.md) for current runtime and host-plugin requirements.

For a stable snapshot, replace `main` with a published semantic tag from [Releases](https://github.com/silverbullet233/oh-my-codex/releases). **`v0.1.0` is the initial candidate; it is not published by this change.** After that tag is available:

```sh
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.1.0
codex plugin add dsh-agent-team@oh-my-codex
```

The tag versions the entire catalog; plugins keep independent versions (`dsh-agent-team` is currently `0.2.0`). Release archives and checksums are for inspection and packaging. Codex installs through the Git marketplace, not directly from a Release tarball.

## Update or roll back

To refresh the currently selected ref and reinstall its plugin snapshot:

```sh
codex plugin marketplace upgrade oh-my-codex
codex plugin add dsh-agent-team@oh-my-codex
```

An immutable tag stays on that tag. To select a different published tag (or return to `main`), first remove the marketplace registration, then repeat the install commands with the desired `--ref`:

```sh
codex plugin marketplace remove oh-my-codex
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref main
codex plugin add dsh-agent-team@oh-my-codex
```

This changes the catalog registration and selected plugin snapshot; it does not remove DSH data. Other plugins from this marketplace must also be reinstalled if you want them to use the selected snapshot. Start a new session afterward. The CLI rejects changing an existing marketplace's ref without removing its registration first.

## Repository layout

```text
.agents/plugins/marketplace.json   Repository marketplace
plugins/<name>/                   Self-contained plugin packages
skills/<name>/                    Future standalone reusable skills
scripts/                         Catalog, installation and release tooling
test/                            Catalog and release checks
```

There are no standalone skills yet; the DSH workflow skill stays inside its plugin. For development, migration from the former root-plugin layout and release maintenance, see [CONTRIBUTING.md](CONTRIBUTING.md).
