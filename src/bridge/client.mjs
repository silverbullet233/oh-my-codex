/** Disposable stdio clients connect to an independently owned native host. */
import { createConnection } from 'node:net';
import { lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BridgeError } from './errors.mjs';

export class BridgeClient {
  constructor({ socketPath, timeoutMs = 30000 }) {
    this.socketPath = socketPath;
    this.timeoutMs = timeoutMs;
    this.sockets = new Set();
  }

  async request(method, params = {}) {
    if (method !== 'health') await this.ensureCompatible();
    const result = await this.exchange(method, params);
    if (method === 'health') this.verifyHealth(result);
    return result;
  }

  verifyHealth(value) {
    const required = ['native-session', 'durable-role-snapshots', 'native-role-settings', 'text-input', 'idempotent-admission'];
    if (value?.ok !== true || value.protocol?.name !== 'dsh-team-roles' || value.protocol.version !== 1
      || !Array.isArray(value.protocol.capabilities) || required.some(name => !value.protocol.capabilities.includes(name))) {
      throw new BridgeError('CAPABILITY_MISMATCH', 'The native host must support dsh-team-roles IPC 1 and the required native role capabilities. No work was submitted.');
    }
  }

  async ensureCompatible() {
    this.handshake ??= this.exchange('health', {}).then(value => this.verifyHealth(value)).catch(error => { this.handshake = undefined; throw error; });
    await this.handshake;
  }

  async exchange(method, params) {
    for (const path of [dirname(this.socketPath), this.socketPath]) {
      const info = await lstat(path);
      if (info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0
        || (path === this.socketPath ? !info.isSocket() : !info.isDirectory())) {
        throw new BridgeError('UNSAFE_SOCKET', 'IPC socket and parent must be private and owned by this UID.');
      }
    }
    const id = randomUUID();
    const request = `${JSON.stringify({ protocol: 1, id, method, params })}\n`;
    if (Buffer.byteLength(request) > 131072) throw new BridgeError('REQUEST_TOO_LARGE', 'IPC request exceeds the protocol byte limit; no native operation was submitted.');
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      this.sockets.add(socket);
      let finished = false;
      let body = Buffer.alloc(0);
      const finish = (error, result) => {
        if (finished) return;
        finished = true;
        this.sockets.delete(socket);
        socket.destroy();
        if (error) reject(error); else resolve(result);
      };
      socket.setTimeout(this.timeoutMs, () => finish(new BridgeError('IPC_TIMEOUT', 'Native admission outcome is uncertain; inspect status before retrying.')));
      socket.once('error', error => finish(error));
      socket.once('close', () => { if (!finished) finish(new BridgeError('IPC_DISCONNECTED', 'IPC disconnected; native execution continues and admission may be uncertain.')); });
      socket.once('connect', () => socket.write(request));
      socket.on('data', chunk => {
        body = Buffer.concat([body, chunk]);
        if (body.length > 1048576) { finish(new BridgeError('RESPONSE_TOO_LARGE', 'IPC response exceeds the byte limit.')); return; }
        const end = body.indexOf(10);
        if (end < 0) return;
        try {
          const response = JSON.parse(body.subarray(0, end).toString('utf8'));
          if (response.protocol !== 1) throw new BridgeError('PROTOCOL_MISMATCH', 'Native host returned an incompatible IPC protocol version. No fallback is supported.');
          if (response.id !== id) throw new BridgeError('INVALID_RESPONSE', 'IPC response identity mismatch.');
          if (response.error) finish(new BridgeError(response.error.code, response.error.message));
          else finish(undefined, response.result);
        } catch (error) { finish(error); }
      });
    });
  }

  /** Close only this client's transport resources. */
  close() { for (const socket of this.sockets) socket.destroy(); this.sockets.clear(); }
}
