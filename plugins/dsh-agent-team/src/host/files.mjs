import { constants } from 'node:fs';
import { mkdir, lstat, open, rename, unlink } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ClientError } from '../native/errors.mjs';
export async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new ClientError('UNSAFE_STATE', 'Owned host state must be a private, current-UID, non-symlink directory.');
}
export async function readPrivate(path) {
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new ClientError('UNSAFE_STATE', 'Owned host metadata must be a private current-UID file.');
    return JSON.parse(await file.readFile('utf8'));
  } finally { await file.close(); }
}
export async function writePrivate(path, data) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(data)); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
}
export function birth(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new ClientError('UNSAFE_STATE', 'Owned process metadata has an invalid PID.');
  try { process.kill(pid, 0); }
  catch (error) { if (error.code === 'ESRCH') return null; throw new ClientError('PROCESS_UNVERIFIABLE', 'Cannot establish the owned process identity; no process was stopped or replaced.'); }
  try {
    const value = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8', env: { ...process.env, TZ: 'UTC', LC_ALL: 'C', LANG: 'C' }, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (value) return value;
  } catch {}
  try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return null; }
  throw new ClientError('PROCESS_UNVERIFIABLE', 'Cannot establish process start time; no process was stopped or replaced.');
}
export async function removeIf(path, nonce) { if ((await readPrivate(path))?.instanceId === nonce) await unlink(path); }
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** OS-owned coordination; a crashed caller cannot strand a lock file. */
export async function withLifecycleLock(directory, timeoutMs, action) {
  const path = join(directory, 'lifecycle.sqlite');
  const file = await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try { const stat = await file.stat(); if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new ClientError('UNSAFE_STATE', 'Lifecycle coordination requires a private file.'); } finally { await file.close(); }
  const database = new DatabaseSync(path); database.exec('PRAGMA busy_timeout=0');
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      try { database.exec('BEGIN IMMEDIATE'); break; }
      catch (error) { if (!String(error.message).includes('locked')) throw error; if (Date.now() > deadline) throw new ClientError('STARTUP_BUSY', 'Another owner is coordinating this host; retry after it settles.'); await delay(25); }
    }
    try { return await action(); } finally { database.exec('ROLLBACK'); }
  } finally { database.close(); }
}
