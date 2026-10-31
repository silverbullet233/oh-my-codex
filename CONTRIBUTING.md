# Contributing and release maintenance

## Development

Use Node.js >=24.9.0 and npm. CI uses Node 24.9.0 on Ubuntu and macOS. The root npm package is private catalog tooling, not an installable plugin.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
npm run pack:check
```

`npm test` covers catalog paths, release safeguards and the plugin suites. `npm run build` validates metadata and builds each workspace. `npm run pack:check` inspects package contents. No tests require a live model account. The official native transport fixtures need loopback listener permission.

Each plugin owns its manifest, MCP entrypoints, skills, tests, docs and package metadata. Add its local source under `./plugins/<name>` in `.agents/plugins/marketplace.json`; paths are relative to the repository root. `${PLUGIN_ROOT}` must resolve inside the installed plugin package, independent of the checkout or current working directory. Standalone skills belong under `skills/<name>/` when added.

To package only one plugin:

```sh
npm run test:unit --workspace dsh-agent-team
npm run build --workspace dsh-agent-team
npm pack --workspace dsh-agent-team --ignore-scripts --pack-destination /absolute/output/directory
```

## Isolated Codex installation checks

With an existing Codex CLI supporting `codex plugin` and Git on PATH:

```sh
npm run test:install
```

This test creates an owned temporary `CODEX_HOME`, copies the actual packaged plugin files into a local Git fixture, and creates local semantic tags there. A Git wrapper rewrites the fixture URL to `file:` and denies other Git transports. It verifies initial install, an unchanged-ref refresh, rejected in-place ref changes, version upgrade, same-version content replacement, rollback, and installed MCP initialization/tool discovery. It cleans up its temporary profile. It does not use personal Codex configuration, remote tags, credentials, a DSH host or model inference.

These operations were verified with Codex CLI 0.164.0. This optional check uses the installed CLI; normal CI does not download or install Codex. Do not treat these keyless checks as native DSH or live model acceptance.

## Version policy

- Root `package.json` and its root lock entries carry the **catalog** version, starting at **0.1.0**. The previous `0.0.0` was a private workspace placeholder. Tags use stable semantic `vX.Y.Z`, never dates.
- Each plugin has an independent version in its `plugin.json` and, where present, `package.json` and workspace lock entry. Initial catalog 0.1.0 maps to `dsh-agent-team` 0.2.0. Do not synchronize unrelated plugin versions with the catalog.
- Bump the affected plugin version when its installed content changes. A catalog-only change can leave plugin versions unchanged. Codex 0.164.0 refreshed changed content under an unchanged plugin version in our fixture, but published versions should still identify immutable content.
- Bump the catalog version for each catalog snapshot release. Use patch for compatible corrections, minor for compatible additions and major for breaking installation/catalog changes; during 0.x, document any breaking changes explicitly.
- Add one `## X.Y.Z` entry to `CHANGELOG.md`. Tag, root version, lock and changelog must agree. Never move a published tag or replace an asset.

## Prepare a release locally

From a clean checkout of the intended, reviewed main-branch commit:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
npm run pack:check
npm run release:prepare -- --tag v0.2.0 --output ./dist/release-v0.2.0
```

The example pins the intended catalog version; verify its version mapping and release authorization before tagging. `release:prepare` only validates metadata and writes to an empty directory. It does not create a Git tag, contact GitHub or publish npm packages. It packs each npm-backed plugin offline with lifecycle scripts disabled. Manifest-only plugins remain available through the tagged catalog without an npm archive.

Run the same install/build sequence before each preparation: npm normalizes workspace executable bits during installation, which affects archive bytes. Both hosted validation and the draft job use the same Node version and sequence. Do not prepare a replacement from a differently configured workstation if an existing draft's asset digest differs.

Output:

- Plugin tarballs, currently `dsh-agent-team-0.3.1.tgz`.
- `catalog.json`: catalog/tag/commit and independent plugin versions with repository-relative paths.
- `release-notes.md`: changelog, version mapping and tagged marketplace instructions.
- `SHA256SUMS`: SHA-256 hashes for the archives, catalog and notes.
- `release-plan.json`: local upload plan and integrity metadata; this is not uploaded as an asset.

Checksums establish integrity, not a separate signing trust chain. Build output and release metadata contain no workstation paths. The Git tag is the Codex installation source; archives are supplementary and cannot be passed directly to `codex plugin add`.

## Tag workflow and draft review

Creating or pushing a release tag is a separate maintainer action, after the release PR is merged and the version is approved. Do not create or publish a new tag merely because this checklist is present.

The `validate-release.yml` workflow validates pull requests, main and `v*` tags. Validation has read-only repository permissions, immutable full-SHA action pins, disabled persisted checkout credentials, and no lifecycle installation scripts. Both operating systems run tests/build/package checks and local release preparation. A tag must exactly match the catalog version.

Only a successful tag-push run in `silverbullet233/oh-my-codex` reaches the draft job. Only that job has `contents: write`; its publisher receives the ephemeral Actions token. It resolves the existing remote tag (including annotated tags), checks its exact commit and local artifact hashes, and creates a **draft** Release with the catalog mapping and assets. It never creates/moves a tag, publishes a Release, marks it latest or publishes npm packages. Tags should point at the reviewed default-branch commit; GitHub can refuse Release creation if workflow files differ from the default branch and the token cannot modify workflows.

Reruns search both drafts and published Releases. An identical draft resumes missing uploads and skips assets with matching size and SHA-256 digest. The complete existing asset listing is checked against the entire plan before any upload, then refreshed and checked again before each upload. Published Releases, differing notes/targets/assets, missing server digests or incomplete listings fail closed. There is no asset deletion or overwrite path. If an upload was interrupted and left an incomplete asset, inspect and remove that draft manually before an intentional retry. Do not publish/edit the draft while its upload job is running; GitHub does not offer an atomic draft-check-and-upload operation.

After the job succeeds, manually review notes, catalog mapping, archives and checksums, then publish the draft through GitHub. That publication requires a separate explicit decision. For a correction after publication, release a new version instead of editing assets. If catalog code/package checks pass but GitHub rejects draft creation, report the exact API status and resolve repository permissions or the release target; do not add a long-lived token as a workaround.

The draft publisher's mutation/error cases are tested with a fake HTTP service. PR validation does not exercise the hosted tag/upload/publication path; verify that exact tag workflow and its published assets on every authorized release.

## Earlier layout migration

The former root `src`, `scripts/client.mjs`, `plugin.json`, `mcp.json`, plugin skill and package metadata moved to `plugins/dsh-agent-team/`. Update saved direct source/MCP paths or refresh the repository marketplace. Local checkout installation uses `codex plugin marketplace add .`; do not install the repository root as one plugin. Existing packaged installations keep `${PLUGIN_ROOT}` relative to their self-contained package. Native DSH Session data and user configuration are unaffected.

## Installation pins in every release

Normal installation must use a fixed, published catalog tag with `codex plugin marketplace add ... --ref vX.Y.Z`. Never use `main`, feature branches or floating latest refs as the normal installation source. The catalog version and each plugin version remain independent.

For every authorized release, publish and verify the compatible host first. Use its actual explicit `releases/download/vX.Y.Z/...` archive and SHA256SUMS URLs; never invent asset URLs or substitute a source archive. Check compatibility and isolated installation against those downloaded bytes. Prepare/review any release-note or installation correction before the catalog tag so generated assets describe the actual owned-host behavior. After publication, verify the catalog's exact tag/commit, version mapping, public assets/checksums and a real isolated Codex install. Update all normal installation pins in the root README, plugin README, getting-started guide and generated release instructions together, with reviewed PRs and their CI. Keep the chosen fixed tag on refresh; users must deliberately switch to another verified published tag.

A release-preparation PR may name its intended catalog tag, but it must state that publication is pending until the reviewed main commit is tagged, its workflow succeeds and assets are verified. Do not claim that pending tag/assets are already published. This checklist is a lasting documentation convention, not permission for future merges, releases or daily-use deployment.
