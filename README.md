# Oh My Codex

Independent Codex plugins and reusable skills. Each plugin is self-contained under `plugins/<name>/`; the repository root owns the marketplace catalog and development tooling.

| Plugin | Purpose | Setup |
| --- | --- | --- |
| DSH Agent Team | Codex-owned ordinary DSH Web host and native Team Gateway | [Getting started](plugins/dsh-agent-team/docs/getting-started.md) · [Plugin README](plugins/dsh-agent-team/README.md) |

## Install in Codex

Register the marketplace and install the plugin with a CLI that supports `codex plugin`:

**Installation target (unreleased candidate):** catalog **v0.3.1** / plugin **0.4.1** — publication pending; this tag does not exist yet and there are no Release assets. The latest **published** installation remains catalog **v0.3.0** / plugin **0.4.0**, paired with exact DSH `0.2.2-alpha.2` and the published dsh-team-roles 0.6.0 archive; select the published `v0.3.0` tag with the same commands for released installation. Use the candidate pins below only after the candidate release is published and its assets are verified. The earlier catalog **v0.2.1** / plugin **0.3.2** was published on **2026-10-31**; immutable older tags do not gain these additions.

This catalog repository is public as verified on 2026-11-08; earlier private-repository installation observations describe their historical configuration. For a private mirror, Git must already authenticate an account with repository access; keep that authentication in the existing Git credential manager. Release publication does not change repository visibility. Never put tokens in repository URLs or MCP configuration.

```sh
codex plugin marketplace add https://github.com/silverbullet233/oh-my-codex.git --ref v0.3.1
codex plugin add dsh-agent-team@oh-my-codex
```

Start a new Codex session after installation. DSH Agent Team requires one-time setup of an exact supported DSH runtime and a new dedicated home with the native host plugin. Its MCP client then starts/reuses that ordinary Web host lazily. Follow the [getting-started guide](plugins/dsh-agent-team/docs/getting-started.md) for current runtime and host-plugin requirements.

**Unreleased candidate (catalog 0.3.1 / plugin 0.4.1):** the source on this branch moves the exact DSH runtime pin to `0.2.2-alpha.3` and requires the matching **unreleased** dsh-team-roles 0.6.1 candidate build. It is not tagged, has no GitHub Release assets and is not published to npm; the `--ref v0.3.1` commands above are release-preparation pins for this candidate, not a published installation instruction, and no release URL/tag may be claimed for it. The published catalog v0.3.0 / plugin 0.4.0 remains paired with exact DSH `0.2.2-alpha.2` and the published dsh-team-roles 0.6.0 archive.

Use the [Agent bootstrap guide](plugins/dsh-agent-team/docs/bootstrap.md) for guided initialization with existing setup and explicit MCP configuration. It is introduced in catalog v0.3.0, alongside Lead interactions, bounded waits, English main/Lead communication, explicit permission presets and safe Web homepage links.

The version mapping for the published release is **catalog v0.3.0 → dsh-agent-team 0.4.0**, paired with **[dsh-team-roles 0.6.0](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.6.0)** and exact DSH **`0.2.2-alpha.2`**. The unreleased candidate mapping is catalog 0.3.1 → dsh-agent-team 0.4.1, paired with the unreleased dsh-team-roles 0.6.1 candidate and exact DSH `0.2.2-alpha.3`; publication is pending. Normal installation uses the fixed published catalog tag, never `main`, a feature branch or a floating latest ref. Check [Releases](https://github.com/silverbullet233/oh-my-codex/releases) before selecting another version.

The tag versions the entire catalog; plugins keep independent versions (published catalog v0.3.0 maps to `dsh-agent-team` 0.4.0, while the unreleased candidate maps to 0.4.1). Release archives and checksums are for inspection and packaging. Codex installs through the Git marketplace, not directly from a Release tarball.

## Update or roll back

To refresh the currently selected ref and reinstall its plugin snapshot:

```sh
codex plugin marketplace upgrade oh-my-codex
codex plugin add dsh-agent-team@oh-my-codex
```

An immutable tag stays on that tag. To select a different published tag, first remove the marketplace registration, then repeat the install commands with an explicit compatible version (the current candidate pin is shown below; publication pending — use the published `v0.3.0` tag for released installation until the candidate is tagged and verified):

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
