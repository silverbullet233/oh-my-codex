import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, createReadStream, existsSync, globSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openAsar } from './asar.mjs';

const project = resolve(import.meta.dirname, '../..');
const lock = JSON.parse(readFileSync(join(project, 'runtime-lock.json'), 'utf8'));
const root = join(project, '.runtime/dsh-source');
const hash = value => createHash('sha256').update(value).digest('hex');
const fileHash = path => hash(readFileSync(path));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const link = (target, path) => {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    check(realpathSync(path) === realpathSync(target), `Refusing to replace existing path: ${path}`);
    return;
  }
  symlinkSync(target, path, 'dir');
};

check(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: lock.source.reference, encoding: 'utf8' }).trim() === lock.source.commit, 'Reference source SHA differs from runtime-lock.json');
check(fileHash(join(lock.source.reference, 'pnpm-lock.yaml')) === lock.source.pnpmLockSha256, 'Pinned DSH dependency lock changed');
check(JSON.parse(readFileSync(join(lock.compiler.path, 'package.json'), 'utf8')).version === lock.compiler.version, 'Authorized TypeScript version is unavailable');
check(JSON.parse(readFileSync(join(lock.piAi.path, 'package.json'), 'utf8')).version === lock.piAi.version, 'Authorized pi-ai version is unavailable');
check(fileHash(lock.installedDependencies.archive) === lock.installedDependencies.sha256, 'Installed official DSH archive changed; inspect and update its dependency provenance explicitly');
mkdirSync(join(project, '.runtime'), { recursive: true });

if (!existsSync(root) || readdirSync(root).length === 0) {
  mkdirSync(root, { recursive: true });
  const archive = join(project, '.runtime/pinned-source.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, lock.source.commit], { cwd: lock.source.reference });
  execFileSync('tar', ['-xf', archive, '-C', root]);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(archive)) digest.update(chunk);
  writeFileSync(join(root, '.dsh-source-origin.json'), JSON.stringify({ commit: lock.source.commit, archiveSha256: digest.digest('hex') }, null, 2) + '\n');
}
check(JSON.parse(readFileSync(join(root, '.dsh-source-origin.json'), 'utf8')).commit === lock.source.commit, 'Existing runtime was not prepared from the pinned source');

for (const patch of lock.patches) {
  const path = join(project, patch.path);
  check(fileHash(path) === patch.sha256, `Tracked patch digest differs: ${patch.path}`);
  const marker = join(root, `.patch-${patch.sha256}`);
  if (!existsSync(marker)) {
    execFileSync('patch', ['-p1', '--forward', '-i', path], { cwd: root, stdio: 'pipe' });
    writeFileSync(marker, patch.path + '\n');
  }
}

const modules = join(root, 'node_modules');
mkdirSync(modules, { recursive: true });
const asar = openAsar(lock.installedDependencies.archive);
const installed = asar.tree.files.dsh.files.node_modules.files;
const dependencyEvidence = [];
const extract = (name) => {
  const target = join(modules, name);
  if (!existsSync(target)) asar.extract(`dsh/node_modules/${name}`, target);
  const manifest = join(target, 'package.json');
  if (existsSync(manifest)) {
    const value = JSON.parse(readFileSync(manifest, 'utf8'));
    dependencyEvidence.push({ name: value.name ?? name, version: value.version, manifestSha256: fileHash(manifest) });
  }
  if (name === 'zod' || name === 'js-yaml' || name === '@modelcontextprotocol/sdk') link(target, join(project, 'node_modules', name));
};
for (const [scope, value] of Object.entries(installed)) {
  if (scope.startsWith('@')) {
    for (const name of Object.keys(value.files ?? {})) {
      if (scope === '@deepseek-ai' && !name.startsWith('node-addon-system')) continue;
      if (scope === '@earendil-works' && name === 'pi-ai') continue;
      extract(`${scope}/${name}`);
    }
  } else extract(scope);
}
asar.close();

const piTarget = join(modules, '@earendil-works/pi-ai');
const piPatch = join(root, lock.piAi.patch);
check(fileHash(piPatch) === lock.piAi.patchSha256, 'Official pi-ai patch changed');
if (!existsSync(piTarget)) {
  cpSync(lock.piAi.path, piTarget, { recursive: true });
  execFileSync('patch', ['-p1', '--forward', '-i', piPatch], { cwd: piTarget, stdio: 'pipe' });
  writeFileSync(join(piTarget, '.dsh-official-patch.json'), JSON.stringify({ source: lock.piAi.path, version: lock.piAi.version, patchSha256: lock.piAi.patchSha256 }, null, 2) + '\n');
}
check(JSON.parse(readFileSync(join(piTarget, '.dsh-official-patch.json'), 'utf8')).patchSha256 === lock.piAi.patchSha256, 'Isolated pi-ai patch evidence differs');
link(lock.compiler.path, join(modules, 'typescript'));

// A separately approved build-tools installation can supply generator/Web dependencies.
const buildTools = join(project, '.runtime/build-tools/node_modules');
if (existsSync(buildTools)) {
  for (const item of readdirSync(buildTools, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    if (item.name.startsWith('@')) {
      for (const child of readdirSync(join(buildTools, item.name))) {
        const name = `${item.name}/${child}`;
        if (!existsSync(join(modules, name))) link(join(buildTools, name), join(modules, name));
      }
    } else if (!existsSync(join(modules, item.name))) link(join(buildTools, item.name), join(modules, item.name));
  }
}

const ts = (await import(pathToFileURL(join(lock.compiler.path, 'lib/typescript.js')).href)).default;
let emitted = 0;
const packages = globSync(['vendor/*/package.json', 'packages/*/*/package.json', 'native/system/package.json', 'native/system/packages/*/package.json', 'apps/*/package.json'], { cwd: root });
for (const manifestPath of packages) {
  const folder = dirname(join(root, manifestPath));
  const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'));
  if (!manifest.name) continue;
  mkdirSync(join(folder, 'lib'), { recursive: true });
  cpSync(join(root, manifestPath), join(folder, 'lib/package.json'));
  if (!existsSync(join(modules, manifest.name))) link(folder, join(modules, manifest.name));
  for (const file of globSync('src/**/*', { cwd: folder })) {
    const source = join(folder, file);
    if (!statSync(source).isFile()) continue;
    const destination = join(folder, 'lib/types', relative('src', file));
    mkdirSync(dirname(destination), { recursive: true });
    if (/\.d\.[cm]?ts$/.test(file)) cpSync(source, destination);
    else if (/\.[cm]?tsx?$/.test(file)) {
      const output = destination.replace(/\.[cm]?tsx?$/, '.js');
      const result = ts.transpileModule(readFileSync(source, 'utf8'), {
        fileName: source,
        reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, rewriteRelativeImportExtensions: true, esModuleInterop: true, sourceMap: false },
      });
      const errors = result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error) ?? [];
      check(errors.length === 0, ts.formatDiagnostics(errors, { getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
      writeFileSync(output, result.outputText);
      emitted++;
    } else cpSync(source, destination);
  }
  const forward = (target, declaration) => {
    if (typeof target !== 'string' || typeof declaration !== 'string' || !/\.(?:js|mjs)$/.test(target) || !declaration.endsWith('.d.ts')) return;
    const implementation = declaration.replace(/\.d\.ts$/, '.js');
    const output = join(folder, target);
    const input = join(folder, implementation);
    if (!existsSync(input) || resolve(input) === resolve(output)) return;
    mkdirSync(dirname(output), { recursive: true });
    const specifier = './' + relative(dirname(output), input).replaceAll('\\', '/');
    const hasDefault = /\bexport\s+default\b|\bas\s+default\b/.test(readFileSync(input, 'utf8'));
    writeFileSync(output, `export * from ${JSON.stringify(specifier)};\n${hasDefault ? `export { default } from ${JSON.stringify(specifier)};\n` : ''}`);
  };
  for (const value of Object.values(manifest.exports ?? {})) if (value && typeof value === 'object') forward(value.default ?? value.import, value.types);
  if (manifest.main && manifest.types) forward(manifest.main, manifest.types);
  for (const entry of Object.values(typeof manifest.bin === 'string' ? { bin: manifest.bin } : manifest.bin ?? {})) {
    if (entry.startsWith('lib/') && entry.endsWith('.js')) forward(entry, entry.replace(/^lib\//, 'lib/types/').replace(/\.js$/, '.d.ts'));
  }
  if (existsSync(join(folder, 'lib/types/bin.js')) && manifest.name === '@deepseek-ai/dsh') {
    writeFileSync(join(folder, 'lib/bin.js'), "import './types/bin.js';\n");
  }
  if (existsSync(join(folder, 'lib/types/profile-boot.js')) && manifest.name === '@deepseek-ai/dsh') forward('lib/profile-boot.js', 'lib/types/profile-boot.d.ts');
  if (manifest.name.startsWith('@deepseek-ai/') && (existsSync(join(folder, 'lib/index.js')) || existsSync(join(folder, 'lib/index.mjs')))) link(folder, join(project, 'node_modules', manifest.name));
}

const emittedFiles = packages.flatMap(manifestPath => {
  const folder = dirname(join(root, manifestPath));
  return [manifestPath, ...globSync('lib/**/*', { cwd: folder }).filter(file => statSync(join(folder, file)).isFile()).map(file => relative(root, join(folder, file)))];
}).sort().map(path => ({ path, sha256: fileHash(join(root, path)) }));
const emissionSha256 = hash(JSON.stringify(emittedFiles));
writeFileSync(join(root, '.runtime-build.json'), JSON.stringify({ source: lock.source, compiler: { path: lock.compiler.path, version: ts.version }, patches: lock.patches, piAi: { version: lock.piAi.version, patchSha256: lock.piAi.patchSha256 }, installedDependencies: { archiveSha256: lock.installedDependencies.sha256, packages: dependencyEvidence }, emittedModules: emitted, emittedFiles, emissionSha256, build: { kind: 'source-transpilation', typechecked: false, frontend: false, officialBundle: false } }, null, 2) + '\n');
console.log(JSON.stringify({ root, emittedModules: emitted, compiler: ts.version, frontend: false, typechecked: false }));
