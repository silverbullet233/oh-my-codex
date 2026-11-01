import { execFile } from 'node:child_process';
import { ClientError } from '../native/errors.mjs';
/** Bounded subprocesses. Failed attempts are retained, never reused or removed underneath children. */
export const run = (command, args, options) => new Promise((resolve, reject) => {
  execFile(command, args, { ...options, encoding: 'utf8', timeout: 180000, maxBuffer: 256 * 1024, windowsHide: true }, error => {
    if (error?.code === 'ENOENT' && command === 'npm') return reject(new ClientError('NPM_REQUIRED', 'npm was not found. Use a supported Node.js distribution with npm on PATH, then rerun bootstrap; no global installation was changed.'));
    if (error) reject(new ClientError('INSTALL_FAILED', `Dependency command failed (${error.killed ? 'timeout/output limit' : Number.isInteger(error.code) ? `exit ${error.code}` : 'could not execute'}). Retry bootstrap; the private failed attempt is retained for inspection.`));
    else resolve();
  });
});
