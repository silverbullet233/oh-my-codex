import { spawn } from 'node:child_process';
import { ClientError } from '../native/errors.mjs';

/** A launcher may stay alive with the browser. Hand off without killing or awaiting that browser. */
export async function handoffBrowser(url, { platform = process.platform, env = process.env, graceMs = 250 } = {}) {
  const command = platform === 'darwin' ? 'open' : platform === 'linux' ? 'xdg-open' : null;
  if (!command) throw new ClientError('PLATFORM_UNSUPPORTED', 'Native Web handoff is validated on macOS and Linux only.');
  await new Promise((resolve, reject) => {
    const child = spawn(command, [url], { env, detached: true, stdio: 'ignore' });
    let timer;
    const finish = failed => {
      clearTimeout(timer); child.unref();
      if (failed) reject(new ClientError('WEB_OPEN_FAILED', 'Could not hand off the native Web entry. No launch capability was logged.'));
      else resolve();
    };
    child.once('error', () => finish(true));
    child.once('exit', code => finish(code !== 0));
    child.once('spawn', () => { timer = setTimeout(() => finish(false), graceMs); });
  });
  return { opened: true, url: new URL(url).origin };
}
