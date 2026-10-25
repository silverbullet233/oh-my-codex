import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(import.meta.dirname, '../..');
const hash = value => createHash('sha256').update(value).digest('hex');

/** Verify the actual native public ESM import and all sealed emitted files before IPC opens. */
export async function verifyRuntime() {
  const lock = JSON.parse(readFileSync(join(project, 'runtime-lock.json'), 'utf8'));
  const resolvedAgent = realpathSync(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-agent')));
  let runtime = dirname(resolvedAgent);
  while (!existsSync(join(runtime, '.runtime-build.json'))) {
    const parent = dirname(runtime);
    if (parent === runtime) throw new Error('Native DSH import does not belong to a prepared pinned runtime');
    runtime = parent;
  }
  if (realpathSync(join(project, '.runtime/dsh-source')) !== runtime) throw new Error('Native DSH import resolves outside the configured isolated runtime');
  const evidence = JSON.parse(readFileSync(join(runtime, '.runtime-build.json'), 'utf8'));
  if (evidence.source.commit !== lock.source.commit || evidence.compiler.version !== lock.compiler.version) throw new Error('Runtime source or compiler differs from the pinned build');
  if (evidence.piAi.patchSha256 !== lock.piAi.patchSha256) throw new Error('Runtime pi-ai patch differs from the pinned build');
  if (!lock.build.emissionSha256 || evidence.emissionSha256 !== lock.build.emissionSha256) throw new Error('Runtime emission has not been sealed in runtime-lock.json');
  if (hash(JSON.stringify(evidence.emittedFiles)) !== evidence.emissionSha256) throw new Error('Runtime emitted-file manifest changed');
  for (const file of evidence.emittedFiles) {
    const path = resolve(runtime, file.path);
    const local = relative(runtime, path);
    if (isAbsolute(local) || local === '..' || local.startsWith(`..${sep}`)) throw new Error('Runtime emitted-file path escaped its root');
    if (hash(readFileSync(path)) !== file.sha256) throw new Error(`Runtime emitted file changed: ${file.path}`);
  }
  const native = await import(pathToFileURL(resolvedAgent).href);
  if (typeof native.AgentModel?.prototype?.select !== 'function' || typeof native.AgentModel?.prototype?.current !== 'function' || !native.modelSelectionProjectionDefinition) throw new Error('Pinned native agent.model APIs are unavailable');
  return Object.freeze({ sourceSha: evidence.source.commit, runtimeDirectory: runtime, resolvedAgent, emissionSha256: evidence.emissionSha256, compilerVersion: evidence.compiler.version, build: Object.freeze(evidence.build), capabilities: Object.freeze({ agentModelSelect: true, agentModelCurrent: true, durableModelSelection: true }) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await verifyRuntime(), null, 2));
