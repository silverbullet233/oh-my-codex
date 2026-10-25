# Runtime preparation checkpoint

Runtime provisioning is paused while a separate source-install task prepares the native DSH installation. Do not run `scripts/runtime/prepare.mjs` or install build dependencies until that work has completed and the parent task explicitly resumes this workflow.

## Verified inputs

The read-only reference checkout is `/Users/mxr/github/deepseek/deepseek-harness` at `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`. `runtime-lock.json` records the source dependency lock, the official installed application archive digest, the authorized TypeScript `6.0.3` compiler, and the official pi-ai `1.3.0` patch digest. The reference checkout and global packages were not modified.

The isolated copy lives in `.runtime/dsh-source`. Its fresh official Git archive has SHA-256 `b29c96d4f3e6f34ddbcb057a04ec8825bb7ad71fb98ff651a9807391cb78acc2`. Only third-party dependencies and native addon packages were extracted from the currently installed official application archive. No compiled DSH packages, generated Typert descriptors, or frontend assets were taken from that archive.

The authorized global pi-ai package was copied into the isolated runtime and patched there using the pinned official patch, SHA-256 `4e1c90fd00aea42989664504668633033c1962e53c07860901edb4f72d843765`. Global pi-ai remains unchanged. There are no active native-source patches: role enforcement uses supported tool guards.

## Available evidence

The experimental preparation script emitted 2,765 JavaScript modules using the explicit Homebrew TypeScript compiler. Public ESM import smokes passed for the native Agent, Agent Loop Testkit, SessionController, gateway, Team service, and Team tools. This is source transpilation for focused keyless tests; it is not an official full build, has not passed the source typecheck, and has no matching frontend build.

The emitted-file manifest is `.runtime/dsh-source/.runtime-build.json`; its SHA-256 is `32fec80e2205229487974d0289b4d22873b144162f39eec47888721f12f829ed`, and its recorded emission digest is `34c1184ec006f03109115f5dd340b7e757275a566689d6e87cff44c7d4b1aeee`. The verifier is deliberately unsealed: `runtime-lock.json` does not authorize that experimental emission digest. `verifyRuntime()` therefore rejects host-plugin startup before IPC can open.

`scripts/runtime/verify.mjs` resolves the actual public Agent module, locates its prepared runtime, checks recorded emitted-file checksums against a separately sealed lock, and checks the new `AgentModel.select` and `current` capabilities. The final source-installed runtime must supply equivalent verified evidence; the current helper still expects the isolated project directory and needs adaptation after installation.

## Stopped installation

One isolated official npm registry installation was started for the versions listed in `.runtime/build-tools/package.json`. The task then received an explicit pause instruction. Its own tool session `81783` was interrupted through that session and exited with code `130`; no process ID was returned. No broad process termination was used. The prefix contains only its manifest: there is no `node_modules` directory or npm lockfile, and installation was not retried.

The request manifest `scripts/runtime/build-tools-request.json` records the larger source Web dependency request. The actual attempted npm manifest excluded the CDN-hosted SheetJS package. The official installed archive contains no standalone `xlsx` package, and the pinned SheetJS CDN URL has not been downloaded or replaced with another version.

## Remaining work after resume

- Use one complete matching native host and frontend from the separate source-install task, with the pinned new Agent APIs. Do not combine old DSH code or frontend bundles with it.
- Run the official source artifact and check builds with locked dependencies and required official patches.
- Generate current Typert reflection; `@deepseek-ai/dsh-api-session-controller/typert` is currently absent, so native controller integration cannot complete yet.
- Fix or retire the experimental forwarding emitter before using it again: it does not detect re-exported defaults such as `export { default } from ...`.
- Seal verified runtime evidence only after the final build, then run runtime guard, native integration, live synthetic-only, and rendered native Team checks.

No DSH host or daemon was started by this runtime worker. No authentication material was read, generated, copied, or changed. No global DSH installation, service, or Codex configuration was changed.
