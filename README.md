# Oh My Codex

A repository of independent Codex plugins and reusable skills. The repository root owns discovery, documentation and development tooling; each plugin is a self-contained package under `plugins/<name>/`.

## Catalog

| Plugin | Purpose | Source and instructions |
| --- | --- | --- |
| DSH Agent Team | Explicit MCP/CLI client for the same native DSH Session service used by Web | [plugins/dsh-agent-team](plugins/dsh-agent-team/README.md) |

There are no standalone skills yet. See [skills/](skills/README.md) for the convention; the DSH workflow skill remains bundled inside its plugin.

## Discovery and installation

The repository marketplace is [.agents/plugins/marketplace.json](.agents/plugins/marketplace.json). Its `./plugins/dsh-agent-team` source is relative to this repository root, as specified by the [official marketplace format](https://developers.openai.com/plugins/build/plugins#marketplace-metadata). It lists the plugin as available, without enabling it or changing account access.

Open this repository in a supported local Codex client and use its plugin browser to select **Oh My Codex → DSH Agent Team**. For a GitHub marketplace import, use the repository URL `https://github.com/silverbullet233/oh-my-codex` with the repository-root Path; select the desired branch/commit. Do not import the repository root as one plugin. Git-backed single-plugin sources use `source: "git-subdir"` with `path: "./plugins/dsh-agent-team"`, rather than a root-plugin source. See [official GitHub marketplace guidance](https://learn.chatgpt.com/docs/enterprise/plugin-management).

The CLI can explicitly register the local checkout using `codex plugin marketplace add .` from this directory, then list it with `codex plugin marketplace list`. These commands were verified with a disposable configuration directory; this migration does not run them against your personal configuration. Use `/plugins` to choose the plugin in Codex.

The standalone plugin directory, built folder and npm tarball each contain their own `plugin.json`, `mcp.json`, skill and runtime files. `${PLUGIN_ROOT}` resolves to that installed plugin directory, not this repository. Source commands from this repository root are:

```sh
node plugins/dsh-agent-team/scripts/client.mjs health
node plugins/dsh-agent-team/src/mcp/main.mjs
```

The DSH client needs an existing compatible native host. Install the separately published native host package with:

```sh
dsh plugin --profile web add 'https://github.com/silverbullet233/dsh-team-roles/releases/download/v0.3.0/dsh-team-roles-0.3.0.tgz' --ignore-scripts
```

This is a [GitHub Release asset](https://github.com/silverbullet233/dsh-team-roles/releases/tag/v0.3.0); it does not imply an npm publication. Native runtime requirements, explicit role behavior and socket overrides are documented in the [plugin README](plugins/dsh-agent-team/README.md).

## Layout and development

```text
.agents/plugins/marketplace.json   Repository marketplace
plugins/<name>/                   Self-contained plugin packages
skills/<name>/                    Future standalone reusable skills
scripts/                         Repository catalog tooling
test/                            Repository layout checks
```

Run the workspace checks from this directory:

```sh
npm test
npm run build
npm run pack:check
```

To work on or package one plugin:

```sh
npm run test:unit --workspace dsh-agent-team
npm run build --workspace dsh-agent-team
npm pack --workspace dsh-agent-team --ignore-scripts --pack-destination /absolute/output/directory
```

The root npm package is private workspace tooling, not an installable plugin. Build output belongs to each plugin's `dist/` directory. Add future plugins with their own manifest and marketplace entry; plugin-specific code, tests and docs remain with that package. No unrelated plugin or skill is added by this migration.

## Migration from the previous layout

The former root `src`, `scripts/client.mjs`, `plugin.json`, `mcp.json`, plugin skill and package metadata moved under `plugins/dsh-agent-team/`. Update direct MCP/source paths and any saved plugin source to that subdirectory, or refresh the repository marketplace. Existing packaged installations still use `${PLUGIN_ROOT}` and keep their self-contained layout. Plugin identity `dsh-agent-team`, version 0.2.0 and IPC protocol 1 are unchanged. The native `dsh-team-roles` package, Session data, role bindings and user configuration are untouched.
